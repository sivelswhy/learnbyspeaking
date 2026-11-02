"use client";
import type { LoadState } from "./llm";

/**
 * Modèles natifs de l'app Mac (llama.cpp pour le cerveau, whisper.cpp pour l'oreille), lancés par mac/main.swift.
 * L'app injecte window.__lbsNative = { llamacpp: {url, key, ready}, whisper: {url, key, ready} } avant le chargement de la page.
 * Hors de l'app Mac (navigateur, iPhone) : rien, la page garde les modèles WebGPU.
 */
export type NativeId = "llamacpp" | "whisper";
export interface NativeModel { url: string; key: string; ready?: boolean }
export interface NativeProgress { phase: "download" | "init" | "ready" | "error"; done?: number; total?: number; error?: string }

type Win = {
  __lbsNative?: Partial<Record<NativeId, NativeModel>>;
  __lbsBrain?: (p: NativeProgress & { id?: NativeId }) => void;
  webkit?: { messageHandlers?: { lbsBrain?: { postMessage: (x: unknown) => void } } };
};
const win = () => (typeof window === "undefined" ? null : (window as unknown as Win));

export function nativeModel(id: NativeId): NativeModel | null {
  return win()?.__lbsNative?.[id] ?? null;
}

const handlers = new Map<NativeId, (p: NativeProgress) => void>();
const inflight = new Map<NativeId, Promise<void>>();

/** Fait télécharger le modèle par l'app (si besoin) puis démarrer son serveur ; onProgress suit l'avancée. */
export function nativeDownload(id: NativeId, onProgress: (p: NativeProgress) => void): Promise<void> {
  const w = win();
  const n = nativeModel(id);
  if (!w || !n) return Promise.reject(new Error("NATIVE_MISSING"));
  if (n.ready) {
    onProgress({ phase: "ready" });
    return Promise.resolve();
  }
  const running = inflight.get(id);
  if (running) {
    handlers.set(id, onProgress);
    return running;
  }
  // Un seul point d'entrée pour l'app : on répartit les messages selon le modèle.
  w.__lbsBrain = (p) => handlers.get(p.id ?? "llamacpp")?.(p);
  const pr = new Promise<void>((resolve, reject) => {
    handlers.set(id, (p) => {
      onProgress(p);
      if (p.phase === "ready") resolve();
      else if (p.phase === "error") reject(new Error(p.error || "NATIVE_ERROR"));
    });
  }).finally(() => inflight.delete(id));
  inflight.set(id, pr);
  w.webkit?.messageHandlers?.lbsBrain?.postMessage({ action: "download", id });
  return pr;
}

/** Avancée envoyée par l'app → état de chargement affiché (mêmes champs que WebLLM et Whisper WebGPU). */
export function toLoadState(p: NativeProgress, t0: number): Partial<LoadState> {
  if (p.phase === "download") {
    const mb = (x = 0) => x / 1e6;
    const sec = (Date.now() - t0) / 1000;
    const mbps = sec > 1 ? mb(p.done) / sec : 0;
    const total = p.total ? mb(p.total) : 0;
    return { phase: "download", progress: p.total ? (p.done ?? 0) / p.total : 0, doneMB: Math.round(mb(p.done)), totalMB: Math.round(total), mbps, etaSec: mbps && total ? Math.round((total - mb(p.done)) / mbps) : null, cachedMB: 0, fromCache: false, error: undefined };
  }
  if (p.phase === "error") return { phase: "error", error: p.error };
  return { phase: p.phase, progress: 1, etaSec: null };
}
