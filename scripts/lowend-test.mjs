// Machine « low end » simulée : Chrome headless avec CPU ralenti, réseau lent,
// écran de téléphone. Usage :
//   npm run build && npx serve out -l 3000   (autre terminal ; export statique)
//   npm run test:lowend [-- --profile=phone|tablet|oldlaptop] [--net=slow4g|slow3g|fast] [--url=...]
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};

const PROFILES = {
  // iPhone 15 : écran 393×852 @3x, CPU ~2× plus lent qu'un Mac récent (ajuster avec --cpu=)
  iphone15: {
    cpu: 2,
    viewport: { width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
  // Android d'entrée de gamme (≈ Moto G4 / Galaxy A0x)
  phone: {
    cpu: 6,
    viewport: { width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (Linux; Android 10; Moto G4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  },
  tablet: {
    cpu: 4,
    viewport: { width: 768, height: 1024, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (Linux; Android 9; SM-T510) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  oldlaptop: {
    cpu: 4,
    viewport: { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    ua: null,
  },
};

const NETS = {
  slow4g: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  slow3g: { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 },
  fast: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
};

const R = (n) => Math.round(n);
const verdict = (v, ok, warn) => (v <= ok ? "OK  " : v <= warn ? "LENT" : "MAUVAIS");
const AI = process.argv.includes("--ai");
const url = arg("url", "http://localhost:3000");
const profName = arg("profile", "iphone15");
const netName = arg("net", "fast");
const prof = PROFILES[profName];
const net = NETS[netName];
if (arg("cpu")) prof.cpu = Number(arg("cpu"));
if (!prof || !net) {
  console.error(`Profil ou réseau inconnu. Profils : ${Object.keys(PROFILES)} ; réseaux : ${Object.keys(NETS)}`);
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 30 * 60 * 1000, // téléchargement des modèles : long
  // --ai : profil persistant (les ~2,5 Go de modèles ne sont téléchargés qu'une fois) et WebGPU activé.
  ...(AI ? { userDataDir: ".lowend-profile" } : {}),
  args: AI
    ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-angle=metal", "--ignore-gpu-blocklist"]
    : ["--disable-gpu", "--js-flags=--max-old-space-size=256"],
});
const page = await browser.newPage();
await page.setViewport(prof.viewport);
if (prof.ua) await page.setUserAgent(prof.ua);

const cdp = await page.createCDPSession();
await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", net);
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

const problems = [];
let bytes = 0;
let requests = 0;
cdp.on("Network.loadingFinished", (e) => {
  bytes += e.encodedDataLength;
  requests++;
});
page.on("pageerror", (e) => problems.push(`Erreur JS : ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error : ${m.text()}`);
});
page.on("requestfailed", (r) => problems.push(`Requête échouée : ${r.url()} (${r.failure()?.errorText})`));

// Observe long tasks + LCP + CLS avant tout script de la page.
await page.evaluateOnNewDocument(() => {
  window.__m = { longTasks: [], lcp: 0, cls: 0 };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__m.longTasks.push(e.duration))).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__m.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__m.cls += e.value; })).observe({ type: "layout-shift", buffered: true });
});

const t0 = Date.now();
try {
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
} catch (e) {
  console.error(`Impossible de charger ${url} : ${e.message}\nLe serveur tourne-t-il ? (npm run build && npx serve out -l 3000)`);
  await browser.close();
  process.exit(1);
}
const loadMs = Date.now() - t0;
await new Promise((r) => setTimeout(r, 3000)); // laisse l'hydratation finir

const res = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
  const lt = window.__m.longTasks;
  const tbt = lt.reduce((s, d) => s + Math.max(0, d - 50), 0);
  const mem = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
  const de = document.documentElement;
  return {
    fcp, lcp: window.__m.lcp, cls: window.__m.cls,
    domInteractive: nav.domInteractive, tbt, longest: Math.max(0, ...lt), nLong: lt.length,
    mem, overflowX: de.scrollWidth > de.clientWidth, nodes: document.getElementsByTagName("*").length,
  };
});

// Interaction : mesure le délai de réponse d'un clic sur chaque bouton visible (jusqu'à 5).
const btns = await page.$$("button, a[href]");
const inter = [];
for (const b of btns.slice(0, 5)) {
  const box = await b.boundingBox();
  if (!box) continue;
  const label = (await b.evaluate((el) => (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)));
  const t = await page.evaluate(() => new Promise((r) => { const s = performance.now(); requestAnimationFrame(() => setTimeout(() => r(performance.now() - s), 0)); }));
  const s = Date.now();
  await b.click().catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  inter.push({ label, ms: Date.now() - s, idle: Math.round(t) });
}

let ai = null;
if (AI) ai = await testAI(page, cdp);

await page.screenshot({ path: `lowend-${profName}.png` });
await browser.close();

console.log(`\nProfil ${profName} (CPU ×${prof.cpu}, réseau ${netName}, ${prof.viewport.width}×${prof.viewport.height}) — ${url}\n`);
const rows = [
  ["Chargement (load)", `${loadMs} ms`, verdict(loadMs, 4000, 8000)],
  ["FCP", `${R(res.fcp)} ms`, verdict(res.fcp, 1800, 3000)],
  ["LCP", `${R(res.lcp)} ms`, verdict(res.lcp, 2500, 4000)],
  ["CLS", res.cls.toFixed(3), verdict(res.cls, 0.1, 0.25)],
  ["TBT (long tasks)", `${R(res.tbt)} ms (${res.nLong} tâches, max ${R(res.longest)} ms)`, verdict(res.tbt, 600, 1500)],
  ["Transfert", `${(bytes / 1024).toFixed(0)} Ko / ${requests} requêtes`, verdict(bytes / 1048576, 1.5, 4)],
  ["Mémoire JS", res.mem == null ? "n/a" : `${res.mem.toFixed(1)} Mo`, res.mem == null ? "-" : verdict(res.mem, 50, 100)],
  ["Nœuds DOM", String(res.nodes), verdict(res.nodes, 1500, 3000)],
  ["Débordement horizontal", res.overflowX ? "OUI" : "non", res.overflowX ? "MAUVAIS" : "OK  "],
];
for (const [a, b, c] of rows) console.log(`${a.padEnd(24)} ${b.padEnd(42)} ${c}`);
if (inter.length) {
  console.log("\nClics (ms jusqu'à 2 frames) :");
  for (const i of inter) console.log(`  ${i.label.padEnd(30)} ${i.ms} ms  ${verdict(i.ms, 200, 500)}`);
}
if (ai) {
  console.log("\nFonctions IA (le CPU ralenti ne touche que le thread principal ; GPU et workers tournent à pleine vitesse) :");
  for (const [a, b, c] of ai) console.log(`  ${a.padEnd(24)} ${b.padEnd(46)} ${c}`);
}
if (problems.length) {
  console.log("\nProblèmes :");
  [...new Set(problems)].forEach((p) => console.log(`  - ${p.replace(/\?[^ ]*/, "?…").slice(0, 160)}`));
}
console.log(`\nCapture : lowend-${profName}.png`);
process.exit(problems.length ? 1 : 0);

/* ---------- Fonctions IA : WebLLM, Whisper, voix, traduction ---------- */
async function testAI(page, cdp) {
  const rows = [];
  const add = (a, b, c = "-") => rows.push([a, b, c]);
  const run = async (name, fn, arg) => {
    // Le réseau de la machine de test coupe parfois les gros téléchargements : on réessaie (les fichiers finis restent en cache).
    for (let n = 1; ; n++) {
      try {
        return await page.evaluate(fn, arg);
      } catch (e) {
        if (n < 5 && /fetch|network/i.test(e.message)) {
          console.error(`  ${name} : ${String(e.message).split("\n")[0]} — nouvel essai ${n}/4`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        add(name, `ÉCHEC : ${String(e.message).split("\n")[0].slice(0, 80)}`, "MAUVAIS");
        return null;
      }
    }
  };
  await page.waitForFunction(() => !!window.__lbs, { timeout: 30000 }).catch(() => {});
  const gpu = await page.evaluate(async () => {
    if (!navigator.gpu) return "absent";
    const a = await navigator.gpu.requestAdapter();
    return a ? "ok" : "pas d'adaptateur";
  });
  add("WebGPU", gpu, gpu === "ok" ? "OK  " : "MAUVAIS");
  if (gpu !== "ok") return rows;
  await cdp.send("Network.emulateNetworkConditions", NETS.fast); // pas de limite réseau pour les modèles

  // 1. LLM (DictaLM) : chargement, premier token, débit.
  const llm = await run("LLM", async () => {
    const L = window.__lbs;
    let t = performance.now();
    await L.loadWebLLM(L.DEFAULT_LLM.webllmModel);
    const load = performance.now() - t;
    t = performance.now();
    let first = 0, last = "";
    const out = await L.complete(L.DEFAULT_LLM, {
      messages: [{ role: "system", content: "Tu es un partenaire de conversation en hébreu." }, { role: "user", content: "שלום! מה שלומך? ספר לי על היום שלך." }],
      maxTokens: 80,
      onToken: (p) => { if (!first) first = performance.now() - t; last = p; },
    });
    const total = performance.now() - t;
    return { load, first, total, chars: out.length, text: out.slice(0, 60) };
  });
  if (llm) {
    add("LLM chargement", `${R(llm.load)} ms`, verdict(llm.load, 15000, 40000));
    add("LLM 1er token", `${R(llm.first)} ms`, verdict(llm.first, 1500, 4000));
    add("LLM réponse (80 tok max)", `${R(llm.total)} ms, ${llm.chars} car.`, verdict(llm.total, 6000, 15000));
    add("LLM texte", llm.text.replace(/\s+/g, " "), llm.chars > 5 ? "OK  " : "MAUVAIS");
  }

  // 2. Whisper : un vrai fichier hébreu du cours, converti en PCM 16 kHz.
  const dir = "mac/native/Resources/he";
  const file = readdirSync(dir).find((f) => f.endsWith(".m4a") && !f.includes("slow"));
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", join(dir, file), "-t", "8", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { maxBuffer: 1 << 26 });
  const samples = Array.from(new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4));
  const w = await run("Whisper", async (samples) => {
    const L = window.__lbs;
    let t = performance.now();
    await L.loadWhisper();
    const load = performance.now() - t;
    t = performance.now();
    const text = await L.transcribe(new Float32Array(samples), "he");
    return { load, ms: performance.now() - t, text, sec: samples.length / 16000 };
  }, samples);
  if (w) {
    add("Whisper chargement", `${R(w.load)} ms`, verdict(w.load, 15000, 40000));
    add("Whisper transcription", `${R(w.ms)} ms pour ${w.sec.toFixed(1)} s d'audio (×${(w.ms / 1000 / w.sec).toFixed(2)})`, verdict(w.ms / 1000 / w.sec, 1, 2));
    add("Whisper texte", w.text.slice(0, 46), w.text.length > 2 ? "OK  " : "MAUVAIS");
  }

  // 3. Voix hébraïque (Piper + Phonikud).
  const v = await run("Voix", async () => {
    const L = window.__lbs;
    let t = performance.now();
    await L.loadVoice();
    const load = performance.now() - t;
    t = performance.now();
    const ok = await L.speak("שלום, מה שלומך היום?");
    return { load, ok, ms: performance.now() - t };
  });
  if (v) {
    add("Voix chargement", `${R(v.load)} ms`, verdict(v.load, 10000, 30000));
    add("Voix lancement", v.ok ? "démarrée" : "refusée (non prête)", v.ok ? "OK  " : "MAUVAIS");
  }

  // 4. Traduction hébreu → français (opus-mt, ~465 Mo).
  const tr = await run("Traduction", async () => {
    const t = performance.now();
    const out = await window.__lbs.translateHebrew("אני רוצה לאכול משהו טעים. איפה המסעדה?", "fr");
    return { ms: performance.now() - t, out };
  });
  if (tr) {
    add("Traduction he→fr", `${R(tr.ms)} ms (chargement inclus)`, verdict(tr.ms, 8000, 20000));
    add("Traduction texte", tr.out.slice(0, 46), tr.out.length > 2 ? "OK  " : "MAUVAIS");
  }

  const mem = await page.evaluate(() => performance.memory?.usedJSHeapSize / 1048576);
  if (mem) add("Mémoire JS (page)", `${mem.toFixed(0)} Mo`, "-");
  return rows;
}
