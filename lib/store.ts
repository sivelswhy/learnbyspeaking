"use client";
import { useEffect, useState, useCallback } from "react";
import type { CourseProgress, PlacementResult, Profile, SessionRecord, VocabCard, NewWord } from "./types";
import { lowMemoryDevice } from "./device";
import { DEFAULT_LLM, type LlmSettings } from "./llm";
import { LANGUAGES } from "./languages";
import { schedule, type Grade } from "./srs";
import { BACKUP_KEYS, clearMirror, mirror, restoreIfEmpty } from "./backup";

const K = { profile: "lbs.profile", sessions: "lbs.sessions", vocab: "lbs.vocab", llm: "lbs.llm", course: "lbs.course", placement: "lbs.placement" };

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    const raw = JSON.stringify(v);
    localStorage.setItem(key, raw);
    mirror(key, raw); // copie dans IndexedDB : voir lib/backup.ts
  } catch {
    /* stockage plein ou bloqué */
  }
}

export function useStore() {
  const [ready, setReady] = useState(false);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [vocab, setVocab] = useState<VocabCard[]>([]);
  const [llm, setLlmState] = useState<LlmSettings>(DEFAULT_LLM);
  const [course, setCourse] = useState<CourseProgress>({});
  const [placement, setPlacementState] = useState<PlacementResult | null>(null);

  useEffect(() => {
    // Lecture unique au montage : localStorage n'existe pas côté serveur.
    void (async () => {
      // localStorage vidé par le navigateur : on remet la copie d'IndexedDB avant de lire.
      await restoreIfEmpty();
      // Profil d'une ancienne version (langue absente ou inconnue) : valeurs par défaut plutôt qu'un plantage.
      const p = read<Profile | null>(K.profile, null);
      setProfileState(p && typeof p === "object" ? { ...p, native: p.native in LANGUAGES ? p.native : "fr", target: p.target in LANGUAGES ? p.target : "he" } : null);
      setSessions(read<SessionRecord[]>(K.sessions, []));
      setVocab(read<VocabCard[]>(K.vocab, []));
      // Sur iPhone, Whisper (≈ 760 Mo) en plus du reste fait recharger la page : reconnaissance d'Apple par défaut.
      const saved = { ...DEFAULT_LLM, ...(lowMemoryDevice() ? { stt: "browser" as const } : {}), ...read<Partial<LlmSettings>>(K.llm, {}) };
      // Les anciens modèles Qwen se sont révélés mauvais en hébreu : on bascule sur DictaLM.
      if (saved.webllmModel !== DEFAULT_LLM.webllmModel) saved.webllmModel = DEFAULT_LLM.webllmModel;
      setLlmState(saved);
      setCourse(read<CourseProgress>(K.course, {}));
      setPlacementState(read<PlacementResult | null>(K.placement, null));
      setReady(true);
      // Utilisateurs d'avant la copie miroir : on la remplit avec ce qui existe déjà.
      for (const k of BACKUP_KEYS) {
        const raw = localStorage.getItem(k);
        if (raw !== null) mirror(k, raw);
      }
      // Demande au navigateur de ne pas purger les données (et les modèles) en cas de manque de place.
      void navigator.storage?.persist?.().catch(() => {});
    })();
  }, []);

  const setProfile = useCallback((p: Profile | null) => {
    setProfileState(p);
    if (p) write(K.profile, p);
    else {
      localStorage.removeItem(K.profile);
      mirror(K.profile, null);
    }
  }, []);

  const addSession = useCallback((s: SessionRecord) => {
    setSessions((prev) => {
      const next = [...prev, s];
      write(K.sessions, next);
      return next;
    });
  }, []);

  const addWords = useCallback((words: NewWord[]) => {
    setVocab((prev) => {
      const next = [...prev];
      for (const w of words) {
        if (!w.word || next.some((c) => c.word === w.word)) continue;
        const now = new Date().toISOString();
        next.push({ ...w, added: now, box: 0, due: now });
      }
      write(K.vocab, next);
      return next;
    });
  }, []);

  /** Révision espacée : voir lib/srs.ts. */
  const reviewCard = useCallback((word: string, grade: Grade) => {
    setVocab((prev) => {
      const next = prev.map((c) => (c.word === word ? { ...c, ...schedule(c, grade) } : c));
      write(K.vocab, next);
      return next;
    });
  }, []);

  const setLlm = useCallback((l: LlmSettings) => {
    setLlmState(l);
    write(K.llm, l);
  }, []);

  /** Marque une activité d'un jour de cours comme faite. */
  const completeActivity = useCallback((dayId: string, activity: "speaking" | "scenario", fluency?: number | null) => {
    setCourse((prev) => {
      const next = { ...prev, [dayId]: { ...prev[dayId], [activity]: new Date().toISOString(), ...(fluency != null ? { fluency } : {}) } };
      write(K.course, next);
      return next;
    });
  }, []);

  const setPlacement = useCallback((r: PlacementResult) => {
    setPlacementState(r);
    write(K.placement, r);
  }, []);

  const reset = useCallback(() => {
    Object.values(K).forEach((k) => localStorage.removeItem(k));
    void clearMirror();
    setProfileState(null);
    setSessions([]);
    setVocab([]);
    setCourse({});
    setPlacementState(null);
  }, []);

  return { ready, llm, setLlm, course, completeActivity, placement, setPlacement, profile, setProfile, sessions, addSession, vocab, addWords, reviewCard, reset };
}
