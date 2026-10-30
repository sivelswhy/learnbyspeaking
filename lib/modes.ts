import { LANGUAGES } from "./languages";
import type { Profile } from "./types";

/** Modes du hub « Parler à l'IA ». `talk` = conversation vocale ; `tool` = assistant écrit. */
export type ModeId = "talk" | "daily" | "teacher" | "grammar" | "translate" | "define";

export interface Mode {
  id: ModeId;
  kind: "talk" | "tool";
  title: string;
  sub: string;
  /** Message d'accueil de l'assistant (outils). */
  hello?: string;
  placeholder?: string;
}

export const MODES: Mode[] = [
  { id: "talk", kind: "talk", title: "Discussion libre", sub: "Noam lance un sujet" },
  { id: "daily", kind: "talk", title: "Sujets du quotidien", sub: "Choisis un thème · 5 min" },
  { id: "teacher", kind: "tool", title: "Professeur d'hébreu", sub: "Pose toutes tes questions", hello: "Pose-moi n'importe quelle question sur l'hébreu : un mot, une règle, une expression, la culture…", placeholder: "Ex. : comment dire « j'ai faim » ?" },
  { id: "grammar", kind: "tool", title: "Professeur de grammaire", sub: "Une règle expliquée simplement", hello: "Quelle règle veux-tu comprendre ? Je l'explique simplement, avec des exemples.", placeholder: "Ex. : le féminin des adjectifs" },
  { id: "translate", kind: "tool", title: "Traduction intelligente", sub: "Avec prononciation et variantes", hello: "Écris une phrase en français ou en hébreu : je la traduis, avec la prononciation et des variantes.", placeholder: "Ex. : On se voit demain ?" },
  { id: "define", kind: "tool", title: "Définir un mot", sub: "Dictionnaire intelligent", hello: "Donne-moi un mot en hébreu ou en français : sens, prononciation, genre, pluriel et exemples.", placeholder: "Ex. : שלום ou « maison »" },
];

export function toolSystem(p: Profile, id: ModeId) {
  const t = LANGUAGES[p.target];
  const n = LANGUAGES[p.native];
  const base = `You are a friendly, precise ${t.name} teacher. Always answer in ${n.name}. Learner level: ${p.level}. ${t.tutorNotes}
Every time you write ${t.name}, write it on its own line followed by the transliteration in parentheses, e.g.:
שלום
(shalom)
Keep answers short and concrete (max ~8 lines). Use simple formatting: short lines, "-" bullets, no tables, no markdown headings. If you are not sure, say so instead of inventing.`;
  const task: Partial<Record<ModeId, string>> = {
    teacher: "Answer the learner's question about the language or culture, with 1-2 example sentences.",
    grammar: "Explain the grammar point simply: the rule in one or two sentences, then 3 short examples, then one common mistake to avoid.",
    translate: `Translate the learner's text (from ${n.name} to ${t.name}, or from ${t.name} to ${n.name}). Give the most natural translation first, then 1-2 alternatives (more formal / more casual) with a few words on when to use each.`,
    define: `Define the word. Give: the word in ${t.name}, transliteration, meaning in ${n.name}, gender and plural for nouns (or root and infinitive for verbs), and 2 short example sentences.`,
  };
  return `${base}\n\nTask: ${task[id] ?? ""}`;
}
