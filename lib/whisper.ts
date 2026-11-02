"use client";
import type { LoadState } from "./llm";
import { isIOS } from "./device";
import { whenAlive } from "./workerReady";
import { nativeDownload, nativeModel, toLoadState } from "./native";

/**
 * Reconnaissance vocale 100 % locale : Whisper ivrit-ai dans un worker (WebGPU),
 * ou, dans l'app Mac, whisper.cpp natif (Metal, modèle complet en f16 : lib/native.ts).
 */
export const WHISPER_MB = 560;
const NATIVE_WHISPER_MB = 874;
const native = () => nativeModel("whisper");
/** Taille à télécharger pour la reconnaissance vocale sur cet appareil (Mo). */
export const whisperMB = () => (native() ? NATIVE_WHISPER_MB : WHISPER_MB);

/**
 * q4f16 (≈ 560 Mo) si le GPU calcule en fp16 : environ moitié moins de mémoire que q4, dont le reste est en fp32.
 * Sinon q4 (≈ 760 Mo).
 */
let dtypeP: Promise<"q4" | "q4f16"> | null = null;
function whisperDtype() {
  dtypeP ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter().catch(() => null);
    return adapter?.features.has("shader-f16") ? "q4f16" : "q4";
  })();
  return dtypeP;
}

const WHISPER_LANG: Record<string, string> = { he: "hebrew", en: "english", es: "spanish", fr: "french" };

let worker: Worker | null = null;
let readyP: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();

let state: LoadState = { model: "whisper", phase: "idle", progress: 0, doneMB: 0, totalMB: WHISPER_MB, mbps: 0, etaSec: null, cachedMB: 0, fromCache: false };
const listeners = new Set<() => void>();
function setState(p: Partial<LoadState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export const whisperStore = {
  get: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function whisperReady() {
  return state.phase === "ready";
}

export async function whisperCached(): Promise<boolean> {
  const n = native();
  if (n) return !!n.ready;
  try {
    const c = await caches.open("transformers-cache");
    const keys = await c.keys();
    const file = `encoder_model_${await whisperDtype()}.onnx`;
    return keys.some((k) => k.url.includes("whisper-large-v3-turbo-onnx") && k.url.includes(file));
  } catch {
    return false;
  }
}

export function loadWhisper(): Promise<void> {
  if (readyP) return readyP;
  if (native()) {
    const t0 = Date.now();
    if (!native()!.ready) setState({ phase: "download", progress: 0, doneMB: 0, totalMB: NATIVE_WHISPER_MB, mbps: 0, etaSec: null, fromCache: false, error: undefined });
    readyP = nativeDownload("whisper", (p) => setState(toLoadState(p, t0))).catch((err) => {
      readyP = null;
      throw err;
    });
    return readyP;
  }
  readyP = (async () => {
    const fromCache = await whisperCached();
    if (!fromCache) await navigator.storage?.persist?.().catch(() => false);
    setState({ phase: fromCache ? "init" : "download", fromCache, progress: 0, doneMB: 0, error: undefined });
    const dtype = await whisperDtype();
    worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    await whenAlive(worker);
    const samples: [number, number][] = [];
    await new Promise<void>((resolve, reject) => {
      worker!.onmessage = (e) => {
        const m = e.data;
        if (m.type === "progress") {
          const now = performance.now();
          samples.push([now, m.loaded]);
          while (samples.length > 2 && now - samples[0][0] > 8000) samples.shift();
          const span = (now - samples[0][0]) / 1000;
          const mbps = span > 0.8 ? (m.loaded - samples[0][1]) / 1e6 / span : 0;
          const totalMB = Math.round(m.total / 1e6) || WHISPER_MB;
          // Lecture depuis le cache : des centaines de Mo/s, on n'affiche pas d'ETA.
          const cache = fromCache || mbps > 150;
          setState({
            phase: cache ? "init" : "download",
            progress: m.total ? m.loaded / m.total : 0,
            doneMB: Math.round(m.loaded / 1e6),
            totalMB,
            mbps: cache ? 0 : mbps,
            etaSec: !cache && mbps > 0.05 && span >= 2 ? Math.round((m.total - m.loaded) / 1e6 / mbps) : null,
          });
        } else if (m.type === "compiling") {
          setState({ phase: "init", progress: 1, etaSec: null });
        } else if (m.type === "ready") {
          worker!.onmessage = onResult;
          setState({ phase: "ready", progress: 1 });
          resolve();
        } else if (m.type === "error") {
          reject(new Error(m.message));
        }
      };
      worker!.postMessage({ type: "load", dtype });
    });
  })().catch((err) => {
    worker?.terminate();
    worker = null;
    readyP = null;
    setState({ phase: "error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  });
  return readyP;
}

function onResult(e: MessageEvent) {
  const m = e.data;
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.type === "result") p.resolve(String(m.text ?? "").trim());
  else p.reject(new Error(m.message));
}

/** Audio 16 kHz mono → WAV PCM 16 bits (format attendu par whisper-server). */
function wav(audio: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + audio.length * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + audio.length * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, audio.length * 2, true);
  for (let i = 0; i < audio.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, audio[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

/** whisper.cpp natif (app Mac) : le chemin d'inférence secret tient lieu de jeton. */
async function transcribeNative(audio: Float32Array, lang: string): Promise<string> {
  const n = native()!;
  const form = new FormData();
  form.append("file", wav(audio), "audio.wav");
  form.append("language", lang in WHISPER_LANG ? lang : "he");
  form.append("temperature", "0.0");
  form.append("response_format", "json");
  // Amorce avec des « ? » : sans elle, Whisper oubliait le point d'interrogation (2 questions sur 3),
  // dont dépend le repérage des questions de l'apprenant (lib/scenes.ts, isQuestion).
  if (lang === "he") form.append("prompt", "מה שלומך? אני בסדר, תודה. איפה אתה גר?");
  // Juste après l'ouverture de l'app, le serveur charge encore le modèle (≈ 4 s) : on réessaie jusqu'à 20 s.
  const until = Date.now() + 20_000;
  let res: Response | null = null;
  for (;;) {
    res = await fetch(`${n.url}/${n.key}`, { method: "POST", body: form }).catch(() => null);
    if (res || Date.now() > until) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!res?.ok) throw new Error(`WHISPER_${res?.status ?? "UNREACHABLE"}`);
  // L'amorce laisse parfois une virgule ou un tiret en tête (« , שלום… », « -באיזו… »).
  return String((await res.json()).text ?? "").replace(/\s+/g, " ").trim().replace(/^[,.\-–—\s]+/, "");
}

export async function transcribe(audio: Float32Array, lang: string): Promise<string> {
  await loadWhisper();
  if (native()) return transcribeNative(audio, lang);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ type: "transcribe", id, audio, language: WHISPER_LANG[lang] ?? "hebrew" }, [audio.buffer]);
  });
}

/* ---------- Enregistrement micro, arrêt automatique sur silence ---------- */

export interface Recording {
  stop: () => void;
  done: Promise<Float32Array | null>; // null = rien dit
}

/**
 * Micro ouvert dès l'arrivée sur un écran où l'on parle, et gardé ouvert ensuite : getUserMedia et la mise en route
 * du micro prennent plusieurs centaines de millisecondes, pendant lesquelles le début de la phrase était perdu
 * (vérifié avec un faux micro à 400 ms d'ouverture : « שלום » disparaissait à chaque fois).
 * Fermé en quittant l'écran, ou après 5 min sans enregistrement.
 * Pas sur iOS : micro ouvert, le son passe dans l'écouteur et la voix de Shuli devient très faible.
 */
const MIC_IDLE_MS = 5 * 60_000;
type Mic = { stream: MediaStream; ctx: AudioContext; an: AnalyserNode };
let mic: Mic | null = null;
let micTimer: ReturnType<typeof setTimeout> | undefined;

/** Ouverture en cours : un toucher pendant l'ouverture anticipée attend ce micro au lieu d'en ouvrir un second. */
let opening: Promise<Mic> | null = null;

function openMic(): Promise<Mic> {
  clearTimeout(micTimer);
  if (mic && mic.stream.getAudioTracks().some((t) => t.readyState === "live") && mic.ctx.state !== "closed") return Promise.resolve(mic);
  opening ??= doOpenMic().finally(() => {
    opening = null;
  });
  return opening;
}

async function doOpenMic(): Promise<Mic> {
  closeMic();
  const stream = await navigator.mediaDevices.getUserMedia({
    // Sans réduction de bruit : elle met un temps à s'adapter et rogne les attaques de phrase (ה, א, ע faibles).
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true },
  });
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);
  mic = { stream, ctx, an };
  return mic;
}

/** Ouvre le micro à l'avance (hors iOS), pour que le premier enregistrement ne perde pas le début de la phrase. */
export async function warmMic(): Promise<void> {
  if (isIOS() || mic) return;
  await openMic();
  micTimer = setTimeout(closeMic, MIC_IDLE_MS);
}

/** Coupe le micro (et son voyant) tout de suite. */
export function closeMic() {
  clearTimeout(micTimer);
  if (!mic) return;
  mic.stream.getTracks().forEach((t) => t.stop());
  void mic.ctx.close().catch(() => {});
  mic = null;
}

export async function record(onLevel: (v: number) => void): Promise<Recording> {
  const { stream, ctx, an } = await openMic();
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const buf = new Float32Array(an.fftSize);
  const t0 = performance.now();
  let spoke = false;
  let lastVoice = t0;
  let raf = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    if (rec.state !== "inactive") rec.stop();
  };
  const loop = () => {
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    onLevel(Math.min(1, rms * 8));
    const now = performance.now();
    if (rms > 0.02) {
      spoke = true;
      lastVoice = now;
    }
    // Fin de phrase : 1,3 s de silence après avoir parlé ; abandon après 8 s sans rien ; 30 s max.
    if ((spoke && now - lastVoice > 1300) || (!spoke && now - t0 > 8000) || now - t0 > 30000) return stop();
    raf = requestAnimationFrame(loop);
  };

  const done = new Promise<Float32Array | null>((resolve, reject) => {
    rec.onstop = async () => {
      onLevel(0);
      try {
        if (!spoke || !chunks.length) return resolve(null);
        const data = await new Blob(chunks, { type: rec.mimeType }).arrayBuffer();
        resolve(await to16kMono(await ctx.decodeAudioData(data)));
      } catch (e) {
        reject(e);
      } finally {
        // Après le décodage, qui a besoin du contexte audio.
        if (isIOS()) closeMic();
        else micTimer = setTimeout(closeMic, MIC_IDLE_MS);
      }
    };
  });
  // On ne rend la main (« Je t'écoute ») qu'une fois l'enregistrement vraiment lancé.
  const started = new Promise<void>((r) => (rec.onstart = () => r()));
  rec.start();
  await Promise.race([started, new Promise((r) => setTimeout(r, 1000))]);
  raf = requestAnimationFrame(loop);
  return { stop, done };
}

async function to16kMono(b: AudioBuffer): Promise<Float32Array> {
  const off = new OfflineAudioContext(1, Math.ceil(b.duration * 16000), 16000);
  const s = off.createBufferSource();
  s.buffer = b;
  s.connect(off.destination);
  s.start();
  return (await off.startRendering()).getChannelData(0);
}
