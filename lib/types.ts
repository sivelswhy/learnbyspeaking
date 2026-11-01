import type { Focus, Gender, Goal, LangCode, Level } from "./languages";

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
  /** Points à améliorer choisis après le test de niveau. */
  focus?: Focus[];
  /** Étape du premier lancement encore à faire (absent : terminé). */
  onboarding?: "placement" | "goal";
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
  /** Traduction / translittération, sur les messages du tuteur. */
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
  /** Grammaire notée par l'IA (sur 100). */
  grammar?: number;
  /** Réponses en lien avec la question de Shuli, jugées par l'IA (sur 100). Absent : bilan par règles. */
  relevance?: number;
  mainErrors?: string[];
  tips: string[];
  summary: string;
}

export interface VocabCard {
  word: string;
  transliteration: string;
  meaning: string;
  added: string;
  /** Maîtrise 0-4 (affichage ; ancien système de boîtes). */
  box: number;
  due: string; // ISO
  /** Révision espacée (lib/srs.ts) : facilité, intervalle en jours, réussites d'affilée, oublis. Absents sur les anciennes cartes. */
  ease?: number;
  ivl?: number;
  reps?: number;
  lapses?: number;
}

export type CourseProgress = Record<string, { speaking?: string; scenario?: string; /** Fluidité moyenne (0-100) de l'entraînement à la parole. */ fluency?: number | null }>;

export interface PlacementResult {
  date: string;
  level: Level;
  /** Axes 0-100, calculés à partir des réponses (voir lib/placement.ts). */
  axes: {
    relevance: number;
    vocabulary: number;
    /** null : grammaire non notée (IA indisponible). */
    grammar?: number | null;
    development?: number;
    /** null : voix non mesurée (réponses écrites, trop courtes, ou reconnaissance du navigateur). */
    fluency?: number | null;
    /** Anciens résultats (avant la notation par l'IA). */
    answered?: number;
    length?: number;
  };
  /** Noté avec l'IA (absent : ancien résultat, règles seules). */
  ai?: boolean;
  answers: { question: string; answer: string; score: number; fluency?: number | null; wpm?: number | null }[];
  /** Compétence estimée (échelle logit) et confiance de l'estimation, 0-100 (test adaptatif). */
  theta?: number;
  confidence?: number;
  /** Moyennes sur les réponses parlées mesurées. */
  voice?: { wpm: number | null; pauseRatio: number; longPauses: number; latency: number; spoken: number };
}
