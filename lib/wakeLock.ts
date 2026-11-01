"use client";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Garder l'écran allumé pendant les téléchargements (API Screen Wake Lock).
 * Sur téléphone, l'écran qui s'éteint met la page en veille et coupe le téléchargement des modèles.
 */
const KEY = "lbs.keepAwake";

let pref = true;
let loaded = false;
const listeners = new Set<() => void>();

function read() {
  if (loaded) return pref;
  loaded = true;
  try {
    pref = localStorage.getItem(KEY) !== "0";
  } catch {
    /* stockage bloqué : on garde la valeur par défaut */
  }
  return pref;
}

export const keepAwakeStore = {
  get: () => read(),
  server: () => true,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function setKeepAwake(v: boolean) {
  pref = v;
  loaded = true;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* stockage bloqué */
  }
  listeners.forEach((l) => l());
}

export function useKeepAwakePref(): boolean {
  return useSyncExternalStore(keepAwakeStore.subscribe, keepAwakeStore.get, keepAwakeStore.server);
}

export function wakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

type Sentinel = { release: () => Promise<void>; released: boolean };

/** Tant que `active` est vrai, l'écran reste allumé. Le verrou saute quand la page passe en arrière-plan : on le reprend au retour. */
export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active || !wakeLockSupported()) return;
    let lock: Sentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const l = (await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock.request("screen"));
        if (stopped) void l.release().catch(() => {});
        else lock = l;
      } catch {
        /* refusé (économie d'énergie, page cachée) : on réessaiera au prochain retour sur la page */
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      if (lock && !lock.released) void lock.release().catch(() => {});
    };
  }, [active]);
}
