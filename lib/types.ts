import type { Goal, LangCode, Level } from "./languages";

export interface Profile {
  native: LangCode;
  target: LangCode;
  level: Level;
  goal: Goal;
  dailyMinutes: number;
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
  seconds: number;
  turns: number;
  corrections: Correction[];
  words: NewWord[];
  report?: Report;
}

export interface Report {
  score: number;
  scoreExplanation: string;
  grammar: number;
  vocabulary: number;
  fluency: number;
  mainErrors: string[];
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
