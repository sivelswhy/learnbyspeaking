"use client";
import { HF_MT_HE_EN_REPO, HF_MT_TO_HE_REPO } from "./hosting";
import type { LoadState } from "./llm";
import { whenAlive } from "./workerReady";
import type { LangCode } from "./languages";

/** Chaîne de modèles opus-mt par langue maternelle (pivot par l'anglais). */
const CHAINS: Partial<Record<LangCode, string[]>> = {
  en: [HF_MT_HE_EN_REPO],
  fr: [HF_MT_HE_EN_REPO, "Xenova/opus-mt-en-fr"],
  es: [HF_MT_HE_EN_REPO, "Xenova/opus-mt-en-es"],
};

/** Vers l'hébreu : un modèle direct par langue maternelle. */
const TO_HE: Partial<Record<LangCode, string[]>> = {
  fr: [HF_MT_TO_HE_REPO.fr],
  en: [HF_MT_TO_HE_REPO.en],
  es: [HF_MT_TO_HE_REPO.es],
};

let worker: Worker | null = null;
let alive: Promise<void> | null = null;
let next = 1;
let idle: ReturnType<typeof setTimeout> | null = null;

/** Le traducteur (≈ 465 Mo) n'est gardé en mémoire que le temps de s'en servir. */
const IDLE_MS = 45_000;
function scheduleUnload() {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    if (pending.size) return scheduleUnload();
    worker?.terminate();
    worker = null;
    alive = null;
  }, IDLE_MS);
}
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();

export function canTranslate(target: LangCode, native: LangCode) {
  return target === "he" && !!CHAINS[native];
}

/** Traduit de l'hébreu vers la langue maternelle, phrase par phrase (les modèles opus-mt sautent sinon des phrases). */
export function translateHebrew(text: string, native: LangCode): Promise<string> {
  const chain = CHAINS[native];
  if (!chain) return Promise.reject(new Error("unsupported"));
  return run(chain, text);
}

export function canTranslateToHebrew(native: LangCode) {
  return !!TO_HE[native];
}

/** Traduit de la langue maternelle vers l'hébreu (au masculin : voir lib/sayInHebrew.ts pour le féminin). */
export function translateToHebrew(text: string, native: LangCode): Promise<string> {
  const chain = TO_HE[native];
  if (!chain) return Promise.reject(new Error("unsupported"));
  return run(chain, text);
}

function run(chain: string[], text: string): Promise<string> {
  if (!worker) {
    worker = new Worker(new URL("./mt.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.text);
      scheduleUnload();
    };
    alive = whenAlive(worker);
  }
  if (idle) clearTimeout(idle);
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const id = next++;
  const w = worker;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    alive!.then(
      () => w.postMessage({ id, chain, sentences }),
      (err: Error) => {
        pending.delete(id);
        reject(err);
      },
    );
  });
}

/* ---------- Téléchargement à l'avance (premier lancement) ---------- */

/** Taille approximative des traducteurs d'une langue maternelle (vers et depuis l'hébreu). */
export function translatorsMB(native: LangCode) {
  return (CHAINS[native] ? 465 : 0) + (TO_HE[native] ? 145 : 0);
}

function translatorModels(native: LangCode) {
  return [...(CHAINS[native] ?? []), ...(TO_HE[native] ?? [])];
}

let mtState: LoadState = { model: "mt", phase: "idle", progress: 0, doneMB: 0, totalMB: 0, mbps: 0, etaSec: null, cachedMB: 0, fromCache: false };
const mtListeners = new Set<() => void>();
function setMt(p: Partial<LoadState>) {
  mtState = { ...mtState, ...p };
  mtListeners.forEach((l) => l());
}
export const mtStore = {
  get: () => mtState,
  subscribe: (l: () => void) => {
    mtListeners.add(l);
    return () => mtListeners.delete(l);
  },
};

/** Tous les traducteurs de cette langue sont déjà dans le cache de transformers.js. */
export async function translatorsCached(native: LangCode): Promise<boolean> {
  try {
    const keys = (await (await caches.open("transformers-cache")).keys()).map((k) => k.url);
    return translatorModels(native).every((m) => keys.some((u) => u.includes(m) && u.includes("decoder_model_merged")));
  } catch {
    return false;
  }
}

let preloadP: Promise<void> | null = null;

/**
 * Télécharge les traducteurs dans un worker à part, puis le ferme : rien ne reste en mémoire
 * (sur téléphone, garder ≈ 600 Mo de plus à côté du modèle de conversation fait recharger la page).
 */
export function preloadTranslators(native: LangCode): Promise<void> {
  if (preloadP) return preloadP;
  const models = translatorModels(native);
  preloadP = (async () => {
    if (!models.length || (await translatorsCached(native))) {
      setMt({ phase: "ready", progress: 1 });
      return;
    }
    await navigator.storage?.persist?.().catch(() => false);
    const estMB = translatorsMB(native);
    setMt({ phase: "download", progress: 0, doneMB: 0, totalMB: estMB, error: undefined, fromCache: false });
    const w = new Worker(new URL("./mt.worker.ts", import.meta.url), { type: "module" });
    try {
      await whenAlive(w);
      // Octets par modèle : la taille réelle remplace l'estimation dès qu'elle est connue.
      const loaded = models.map(() => 0);
      const totals = models.map((_, k) => (k < (CHAINS[native]?.length ?? 0) ? 465 / (CHAINS[native]?.length ?? 1) : 145) * 1e6);
      const samples: [number, number][] = [];
      await new Promise<void>((resolve, reject) => {
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === "progress") {
            if (m.done) loaded[m.index] = totals[m.index];
            else {
              if (m.total) totals[m.index] = m.total;
              loaded[m.index] = m.loaded;
            }
            const got = loaded.reduce((a, b) => a + b, 0);
            const all = totals.reduce((a, b) => a + b, 0);
            const now = performance.now();
            samples.push([now, got]);
            while (samples.length > 2 && now - samples[0][0] > 8000) samples.shift();
            const span = (now - samples[0][0]) / 1000;
            const mbps = span > 0.8 ? (got - samples[0][1]) / 1e6 / span : 0;
            setMt({
              progress: all ? got / all : 0,
              doneMB: Math.round(got / 1e6),
              totalMB: Math.round(all / 1e6),
              mbps,
              etaSec: mbps > 0.05 && span >= 2 ? Math.round((all - got) / 1e6 / mbps) : null,
            });
          } else if (m.type === "ready") resolve();
          else if (m.type === "error") reject(new Error(m.message));
        };
        w.postMessage({ type: "preload", models });
      });
      setMt({ phase: "ready", progress: 1, etaSec: null });
    } finally {
      w.terminate();
    }
  })().catch((err) => {
    preloadP = null;
    setMt({ phase: "error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  });
  return preloadP;
}
