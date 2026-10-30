import * as ort from "onnxruntime-web";
import { decode, encode } from "./phonikud/diacritize";
import { expandNumbers } from "./phonikud/numbers";
import { phonemize } from "./phonikud/phonemize";
import { VOICE_FILES, VOICE_CACHE } from "./voiceFiles";

// Voix hébraïque locale : Phonikud vocalise le texte, Piper (VITS) le prononce. Tout sur le CPU (wasm).
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;

interface PiperConfig {
  audio: { sample_rate: number };
  phoneme_id_map: Record<string, number[]>;
}

let loaded: Promise<{ nikud: ort.InferenceSession; piper: ort.InferenceSession; cfg: PiperConfig }> | null = null;

/**
 * Télécharge un fichier (ou le lit depuis le cache) en signalant la progression.
 * Un seul tampon de la taille finale : sur téléphone, plusieurs copies de 300 Mo font recharger la page.
 */
async function fetchCached(url: string, size: number, onBytes: (n: number) => void): Promise<Uint8Array> {
  const cache = await caches.open(VOICE_CACHE);
  const hit = await cache.match(url);
  if (hit) {
    const buf = new Uint8Array(await hit.arrayBuffer());
    onBytes(buf.byteLength);
    return buf;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} pour ${url}`);
  let buf = new Uint8Array(Number(res.headers.get("content-length")) || size);
  let n = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (n + value.byteLength > buf.byteLength) {
      const bigger = new Uint8Array(Math.max(buf.byteLength * 2, n + value.byteLength));
      bigger.set(buf.subarray(0, n));
      buf = bigger;
    }
    buf.set(value, n);
    n += value.byteLength;
    onBytes(value.byteLength);
  }
  buf = buf.subarray(0, n);
  await cache.put(url, new Response(buf as BlobPart, { headers: { "Content-Type": "application/octet-stream" } }));
  return buf;
}

function load() {
  loaded ??= (async () => {
    const total = VOICE_FILES.reduce((a, f) => a + f.bytes, 0);
    let got = 0;
    const tick = (n: number) => {
      got += n;
      self.postMessage({ type: "progress", loaded: Math.min(got, total), total });
    };
    // L'un après l'autre : pas deux gros tampons en mémoire en même temps.
    const [nikudFile, piperFile, cfgFile] = VOICE_FILES;
    const opts: ort.InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    const nikud = await ort.InferenceSession.create(await fetchCached(nikudFile.url, nikudFile.bytes, tick), opts);
    const piper = await ort.InferenceSession.create(await fetchCached(piperFile.url, piperFile.bytes, tick), opts);
    const cfg = JSON.parse(new TextDecoder().decode(await fetchCached(cfgFile.url, cfgFile.bytes, tick))) as PiperConfig;
    self.postMessage({ type: "compiling" });
    return { nikud, piper, cfg };
  })();
  loaded.catch(() => (loaded = null));
  return loaded;
}

async function diacritize(nikud: ort.InferenceSession, text: string) {
  const enc = encode(text);
  const shape = [1, enc.ids.length];
  const out = await nikud.run({
    input_ids: new ort.Tensor("int64", enc.ids, shape),
    attention_mask: new ort.Tensor("int64", new BigInt64Array(enc.ids.length).fill(BigInt(1)), shape),
    token_type_ids: new ort.Tensor("int64", new BigInt64Array(enc.ids.length), shape),
  });
  return decode(enc, out.nikud_logits.data as Float32Array, out.shin_logits.data as Float32Array, out.additional_logits.data as Float32Array);
}

async function synthesize(piper: ort.InferenceSession, cfg: PiperConfig, phonemes: string, lengthScale: number) {
  // Comme piper_onnx : ^ au début, un _ après chaque phonème connu, $ à la fin.
  const map = cfg.phoneme_id_map;
  const ids: number[] = [];
  for (const p of ["^", ...Array.from(phonemes)]) {
    if (!map[p]) continue;
    ids.push(...map[p], ...map["_"]);
  }
  ids.push(...map["$"]);
  const input = BigInt64Array.from(ids.map(BigInt));
  const out = await piper.run({
    input: new ort.Tensor("int64", input, [1, input.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(input.length)]), [1]),
    // Réglages de la démo Phonikud : un peu plus lent et plus expressif que les valeurs par défaut.
    scales: new ort.Tensor("float32", Float32Array.from([0.64, lengthScale, 1.0]), [3]),
  });
  const samples = Float32Array.from(out.output.data as Float32Array);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.max(-1, Math.min(1, samples[i] * 2));
  return samples;
}

type Msg = { type: "load" } | { type: "speak"; id: number; text: string; lengthScale: number };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      const { nikud, piper, cfg } = await load();
      // Premier passage à vide : prépare les deux modèles avant la première vraie phrase.
      await synthesize(piper, cfg, phonemize(await diacritize(nikud, "שלום")), 1);
      self.postMessage({ type: "ready" });
      return;
    }
    const { nikud, piper, cfg } = await load();
    // Phrase par phrase : la première est jouée pendant que la suivante se calcule.
    const sentences = expandNumbers(msg.text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    for (let k = 0; k < sentences.length; k++) {
      const diac = await diacritize(nikud, sentences[k]);
      const phonemes = phonemize(diac);
      const samples = phonemes.trim() ? await synthesize(piper, cfg, phonemes, msg.lengthScale) : new Float32Array(0);
      self.postMessage({ type: "audio", id: msg.id, samples, sampleRate: cfg.audio.sample_rate, last: k === sentences.length - 1, diac, phonemes }, { transfer: [samples.buffer] });
    }
    if (!sentences.length) self.postMessage({ type: "audio", id: msg.id, samples: new Float32Array(0), sampleRate: cfg.audio.sample_rate, last: true });
  } catch (err) {
    self.postMessage({ type: "error", id: msg.type === "speak" ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};

// Prêt à recevoir des messages (voir lib/workerReady.ts).
self.postMessage({ type: "alive" });
