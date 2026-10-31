"use client";
import type { LoadState } from "./llm";
import { isIOS } from "./device";
import { whenAlive } from "./workerReady";

/** Reconnaissance vocale 100 % locale : Whisper ivrit-ai dans un worker (WebGPU). */
export const WHISPER_MB = 560;

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

export async function transcribe(audio: Float32Array, lang: string): Promise<string> {
  await loadWhisper();
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
 * Micro gardé ouvert 30 s après chaque enregistrement : getUserMedia et la mise en route du micro prennent
 * plusieurs centaines de millisecondes, pendant lesquelles le début de la phrase était perdu.
 * Pas sur iOS : micro ouvert, le son passe dans l'écouteur et la voix de Noam devient très faible.
 */
const MIC_IDLE_MS = 30000;
let mic: { stream: MediaStream; ctx: AudioContext; an: AnalyserNode } | null = null;
let micTimer: ReturnType<typeof setTimeout> | undefined;

async function openMic() {
  clearTimeout(micTimer);
  if (mic && mic.stream.getAudioTracks().some((t) => t.readyState === "live") && mic.ctx.state !== "closed") return mic;
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
