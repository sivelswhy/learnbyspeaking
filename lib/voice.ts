"use client";
import type { LoadState } from "./llm";
import { VOICE_CACHE, VOICE_FILES, VOICE_MB } from "./voiceFiles";

/** Voix hébraïque naturelle et locale (Phonikud + Piper) dans un worker ; la voix du système reste en secours. */
export { VOICE_MB };

let worker: Worker | null = null;
let enabled = true;

/** Réglage « voix du système » : la voix naturelle reste chargée mais n'est plus utilisée. */
export function setVoiceEnabled(on: boolean) {
  enabled = on;
  if (!on) cancelVoice();
}
let readyP: Promise<void> | null = null;
let nextId = 1;

let state: LoadState = { model: "voice", phase: "idle", progress: 0, doneMB: 0, totalMB: VOICE_MB, mbps: 0, etaSec: null, cachedMB: 0, fromCache: false };
const listeners = new Set<() => void>();
function setState(p: Partial<LoadState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export const voiceStore = {
  get: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function voiceReady() {
  return state.phase === "ready";
}

export async function voiceCached(): Promise<boolean> {
  try {
    const c = await caches.open(VOICE_CACHE);
    const hits = await Promise.all(VOICE_FILES.map((f) => c.match(f.url)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

export function loadVoice(): Promise<void> {
  if (readyP) return readyP;
  readyP = (async () => {
    const fromCache = await voiceCached();
    if (!fromCache) await navigator.storage?.persist?.().catch(() => false);
    setState({ phase: fromCache ? "init" : "download", fromCache, progress: 0, doneMB: 0, error: undefined });
    worker = new Worker(new URL("./voice.worker.ts", import.meta.url), { type: "module" });
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
          setState({
            phase: fromCache ? "init" : "download",
            progress: m.loaded / m.total,
            doneMB: Math.round(m.loaded / 1e6),
            totalMB: Math.round(m.total / 1e6),
            mbps: fromCache ? 0 : mbps,
            etaSec: !fromCache && mbps > 0.05 && span >= 2 ? Math.round((m.total - m.loaded) / 1e6 / mbps) : null,
          });
        } else if (m.type === "compiling") {
          setState({ phase: "init", progress: 1, etaSec: null });
        } else if (m.type === "ready") {
          worker!.onmessage = onAudio;
          setState({ phase: "ready", progress: 1 });
          resolve();
        } else if (m.type === "error") {
          reject(new Error(m.message));
        }
      };
      worker!.postMessage({ type: "load" });
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

/* ---------- Lecture ---------- */

let ctx: AudioContext | null = null;
let current = 0; // identifiant de la phrase en cours ; les morceaux d'une phrase annulée sont ignorés
let playhead = 0;
let sources: AudioBufferSourceNode[] = [];
let onEndCb: (() => void) | null = null;

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Safari n'autorise le son qu'après un geste : on débloque l'AudioContext au premier contact.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => audio(), { once: true, capture: true });
}

function onAudio(e: MessageEvent) {
  const m = e.data;
  if (m.id !== current) return;
  if (m.type === "error") {
    finish();
    return;
  }
  const c = audio();
  if (m.samples.length) {
    const buf = c.createBuffer(1, m.samples.length, m.sampleRate);
    buf.copyToChannel(m.samples, 0);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    playhead = Math.max(playhead, c.currentTime + 0.05);
    src.start(playhead);
    playhead += buf.duration + 0.12; // courte pause entre les phrases
    sources.push(src);
    if (m.last) src.onended = () => finish();
  } else if (m.last) {
    // Dernier morceau vide : on attend la fin de ce qui est déjà programmé.
    const last = sources[sources.length - 1];
    if (last) last.onended = () => finish();
    else finish();
  }
}

function finish() {
  const cb = onEndCb;
  onEndCb = null;
  sources = [];
  cb?.();
}

export function cancelVoice() {
  current = 0;
  onEndCb = null;
  sources.forEach((s) => {
    s.onended = null;
    try {
      s.stop();
    } catch {
      /* pas encore démarrée */
    }
  });
  sources = [];
  playhead = 0;
}

/** Lit un texte hébreu. `rate` suit la convention de speechSynthesis (1 = normal). Renvoie false si la voix n'est pas prête. */
export function speakVoice(text: string, rate: number, onEnd?: () => void): boolean {
  if (!enabled || !voiceReady() || !worker) return false;
  cancelVoice();
  current = nextId++;
  onEndCb = onEnd ?? null;
  audio();
  // La démo Phonikud utilise 1,2 ; on ralentit encore pour les débutants.
  const lengthScale = Math.min(1.6, Math.max(0.95, 1.02 / rate));
  worker.postMessage({ type: "speak", id: current, text, lengthScale });
  return true;
}
