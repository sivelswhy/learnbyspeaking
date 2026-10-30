"use client";
import { useEffect, useState, useCallback } from "react";
import type { CourseProgress, PlacementResult, Profile, SessionRecord, VocabCard, NewWord } from "./types";
import { lowMemoryDevice } from "./device";
import { DEFAULT_LLM, type LlmSettings } from "./llm";

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
    localStorage.setItem(key, JSON.stringify(v));
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileState(read<Profile | null>(K.profile, null));
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
  }, []);

  const setProfile = useCallback((p: Profile | null) => {
    setProfileState(p);
    if (p) write(K.profile, p);
    else localStorage.removeItem(K.profile);
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

  /** Leitner : réussite → boîte +1 (intervalle plus long), échec → retour boîte 0. */
  const reviewCard = useCallback((word: string, ok: boolean) => {
    const days = [0, 1, 3, 7, 21];
    setVocab((prev) => {
      const next = prev.map((c) => {
        if (c.word !== word) return c;
        const box = ok ? Math.min(c.box + 1, 4) : 0;
        const due = new Date(Date.now() + days[box] * 864e5).toISOString();
        return { ...c, box, due: ok ? due : new Date().toISOString() };
      });
      write(K.vocab, next);
      return next;
    });
  }, []);

  const setLlm = useCallback((l: LlmSettings) => {
    setLlmState(l);
    write(K.llm, l);
  }, []);

  /** Marque une activité d'un jour de cours comme faite. */
  const completeActivity = useCallback((dayId: string, activity: "speaking" | "scenario") => {
    setCourse((prev) => {
      const next = { ...prev, [dayId]: { ...prev[dayId], [activity]: new Date().toISOString() } };
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
    setProfileState(null);
    setSessions([]);
    setVocab([]);
    setCourse({});
    setPlacementState(null);
  }, []);

  return { ready, llm, setLlm, course, completeActivity, placement, setPlacement, profile, setProfile, sessions, addSession, vocab, addWords, reviewCard, reset };
}
