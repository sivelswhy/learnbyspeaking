"use client";
import { HF_MT_HE_EN_REPO } from "./hosting";
import { whenAlive } from "./workerReady";
import type { LangCode } from "./languages";

/** Chaîne de modèles opus-mt par langue maternelle (pivot par l'anglais). */
const CHAINS: Partial<Record<LangCode, string[]>> = {
  en: [HF_MT_HE_EN_REPO],
  fr: [HF_MT_HE_EN_REPO, "Xenova/opus-mt-en-fr"],
  es: [HF_MT_HE_EN_REPO, "Xenova/opus-mt-en-es"],
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
