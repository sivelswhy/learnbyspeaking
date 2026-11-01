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
  { id: "talk", kind: "talk", title: "Discussion libre", sub: "Shuli lance un sujet" },
  { id: "daily", kind: "talk", title: "Sujets du quotidien", sub: "Choisis un thème · 5 min" },
  { id: "teacher", kind: "tool", title: "Comment dire… ?", sub: "Une phrase en français, en hébreu", hello: "Écris une phrase en français : je te dis comment la dire en hébreu. Les phrases du cours ont leur prononciation, vérifiée.", placeholder: "Ex. : j'ai faim" },
  // Leçons écrites à la main (Cours › Ressources) : un petit modèle explique la grammaire de façon trop peu fiable.
  { id: "grammar", kind: "tool", title: "Grammaire", sub: "Les règles expliquées simplement" },
  { id: "translate", kind: "tool", title: "Traduction intelligente", sub: "Avec prononciation et variantes", hello: "Écris une phrase en français ou en hébreu : je la traduis, avec la prononciation et des variantes.", placeholder: "Ex. : On se voit demain ?" },
  { id: "define", kind: "tool", title: "Définir un mot", sub: "Dictionnaire intelligent", hello: "Donne-moi un mot en français ou en hébreu : je te donne le mot dans l'autre langue et un exemple. Les mots des ressources ont leur prononciation, vérifiée.", placeholder: "Ex. : hôpital ou שלום" },
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
