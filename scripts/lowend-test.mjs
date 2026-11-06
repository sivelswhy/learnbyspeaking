// Machine « low end » simulée : Chrome headless avec CPU ralenti, réseau lent,
// écran de téléphone. Usage :
//   npm run build && npx serve out -l 3000   (autre terminal ; export statique)
//   npm run test:lowend [-- --profile=phone|tablet|oldlaptop] [--net=slow4g|slow3g|fast] [--url=...]
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};

const PROFILES = {
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

const url = arg("url", "http://localhost:3000");
const profName = arg("profile", "phone");
const netName = arg("net", "slow4g");
const prof = PROFILES[profName];
const net = NETS[netName];
if (!prof || !net) {
  console.error(`Profil ou réseau inconnu. Profils : ${Object.keys(PROFILES)} ; réseaux : ${Object.keys(NETS)}`);
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--js-flags=--max-old-space-size=256"],
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

await page.screenshot({ path: `lowend-${profName}.png` });
await browser.close();

const R = (n) => Math.round(n);
const verdict = (v, ok, warn) => (v <= ok ? "OK  " : v <= warn ? "LENT" : "MAUVAIS");
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
if (problems.length) {
  console.log("\nProblèmes :");
  [...new Set(problems)].forEach((p) => console.log(`  - ${p}`));
}
console.log(`\nCapture : lowend-${profName}.png`);
process.exit(problems.length ? 1 : 0);
