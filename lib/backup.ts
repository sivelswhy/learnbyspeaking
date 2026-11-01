"use client";
/**
 * Sauvegarde des progrès.
 *  - Copie miroir de chaque écriture dans IndexedDB : si le navigateur vide localStorage (nettoyage du système, mode
 *    privé, « effacer les données »), les progrès reviennent tout seuls au lancement suivant.
 *  - Export / import en fichier JSON, pour changer d'appareil ou garder une copie.
 * Les modèles d'IA ne font pas partie de la sauvegarde : ils se retéléchargent.
 */
export const BACKUP_KEYS = ["lbs.profile", "lbs.sessions", "lbs.vocab", "lbs.llm", "lbs.course", "lbs.placement"] as const;

const DB = "lbs-backup";
const STORE = "kv";

let dbp: Promise<IDBDatabase> | null = null;

/** Une seule connexion partagée : des ouvertures en parallèle sur une base neuve se gênaient et perdaient des écritures. */
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      req.result.onclose = req.result.onversionchange = () => {
        dbp = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      dbp = null;
      reject(req.error);
    };
  });
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Copie une valeur déjà sérialisée (ou la supprime si null). Sans effet si IndexedDB est indisponible. */
export function mirror(key: string, raw: string | null) {
  if (typeof indexedDB === "undefined") return;
  void (raw === null ? tx("readwrite", (s) => s.delete(key)) : tx("readwrite", (s) => s.put(raw, key))).catch(() => {});
}

export async function clearMirror() {
  if (typeof indexedDB === "undefined") return;
  await tx("readwrite", (s) => s.clear()).catch(() => {});
}

/** Au lancement : si localStorage est vide mais que la copie existe, on la remet. Renvoie true si quelque chose a été restauré. */
export async function restoreIfEmpty(): Promise<boolean> {
  try {
    if (typeof indexedDB === "undefined" || BACKUP_KEYS.some((k) => localStorage.getItem(k) !== null)) return false;
    let n = 0;
    for (const k of BACKUP_KEYS) {
      const v = await tx<unknown>("readonly", (s) => s.get(k));
      if (typeof v === "string") {
        localStorage.setItem(k, v);
        n++;
      }
    }
    return n > 0;
  } catch {
    return false;
  }
}

export const BACKUP_VERSION = 1;

/** Contenu du fichier de sauvegarde. */
export function exportJson(): string {
  const data: Record<string, unknown> = {};
  for (const k of BACKUP_KEYS) {
    const raw = localStorage.getItem(k);
    if (raw === null) continue;
    try {
      data[k] = JSON.parse(raw);
    } catch {
      /* valeur illisible : ignorée */
    }
  }
  return JSON.stringify({ app: "learnbyspeaking", version: BACKUP_VERSION, date: new Date().toISOString(), data }, null, 2);
}

export type ImportResult = { ok: true; keys: number } | { ok: false; error: string };

/** Remet les données d'un fichier de sauvegarde (remplace les données actuelles). */
export function importJson(text: string): ImportResult {
  let obj: { app?: string; version?: number; data?: Record<string, unknown> };
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "Ce fichier n'est pas une sauvegarde valide (JSON illisible)." };
  }
  if (obj.app !== "learnbyspeaking" || !obj.data || typeof obj.data !== "object") return { ok: false, error: "Ce fichier ne vient pas de LearnBySpeaking." };
  if ((obj.version ?? 0) > BACKUP_VERSION) return { ok: false, error: "Cette sauvegarde vient d'une version plus récente de l'app. Mets l'app à jour." };
  if (!obj.data["lbs.profile"]) return { ok: false, error: "La sauvegarde ne contient pas de profil." };
  let keys = 0;
  for (const k of BACKUP_KEYS) {
    if (!(k in obj.data)) continue;
    const raw = JSON.stringify(obj.data[k]);
    localStorage.setItem(k, raw);
    mirror(k, raw);
    keys++;
  }
  return { ok: true, keys };
}

/** Enregistre un fichier : panneau « Enregistrer » dans l'app Mac, téléchargement ailleurs. */
export function saveFile(name: string, text: string) {
  const w = window as unknown as { webkit?: { messageHandlers?: { lbsSave?: { postMessage: (m: unknown) => void } } } };
  if (w.webkit?.messageHandlers?.lbsSave) return w.webkit.messageHandlers.lbsSave.postMessage({ name, text });
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
