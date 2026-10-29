import type { Gender, Goal, LangCode, Level } from "./languages";

export interface Profile {
  name?: string;
  native: LangCode;
  target: LangCode;
  level: Level;
  goal: Goal;
  dailyMinutes: number;
  /** Pour les langues où « tu » s'accorde (hébreu). */
  gender?: Gender;
  /** Niveau mesuré par le test de niveau (sinon déclaré). */
  placementDone?: boolean;
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
  natural: string;
  category: "grammaire" | "vocabulaire" | "fluidité" | "autre";
}

export interface NewWord {
  word: string;
  transliteration: string;
  meaning: string;
}

export interface Extra {
  transliteration: string;
  translation: string;
  suggestions: string[];
  /** Translittération/traduction écrites à la main : l'analyse IA ne les remplace pas. */
  locked?: boolean;
  /** Traduction faite par le modèle local : à signaler comme approximative. */
  machine?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Analyse du tuteur sur cette réponse de l'apprenant (null = aucune erreur). */
  correction?: Correction | null;
  /** Traduction / translittération / suggestions, sur les messages du tuteur. */
  extra?: Extra;
  analyzing?: boolean;
}

export interface SessionRecord {
  id: string;
  date: string; // ISO
  scenarioId: string;
  /** Titre affiché (scénario, jour de cours ou sujet). */
  title?: string;
  seconds: number;
  turns: number;
  corrections: Correction[];
  words: NewWord[];
  report?: Report;
}

export interface Report {
  score: number;
  scoreExplanation: string;
  participation: number;
  vocabulary: number;
  fluency: number;
  /** Anciennes sessions (notées par l'IA) : conservé pour l'historique. */
  grammar?: number;
  mainErrors?: string[];
  tips: string[];
  summary: string;
}

export interface VocabCard {
  word: string;
  transliteration: string;
  meaning: string;
  added: string;
  box: number; // Leitner 0-4
  due: string; // ISO
}

export type CourseProgress = Record<string, { speaking?: string; scenario?: string }>;

export interface PlacementResult {
  date: string;
  level: Level;
  /** Axes 0-100, calculés à partir des réponses (voir lib/placement.ts). */
  axes: { answered: number; length: number; vocabulary: number; relevance: number };
  answers: { question: string; answer: string; score: number }[];
}
