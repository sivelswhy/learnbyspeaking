import type { Level } from "./languages";
import type { Report } from "./types";

/** Mots attendus par réponse selon le niveau. */
const TARGET: Record<Level, number> = { A1: 3, A2: 5, B1: 7, B2: 9, C1: 11, C2: 13 };
const HEBREW = /[א-ת]/;

/**
 * Bilan de session calculé sans IA, à partir de ce que l'apprenant a réellement dit.
 * Un modèle local de 1,7 Md note la grammaire de façon trop aléatoire pour être affiché comme un score.
 */
export function scoreSession(answers: string[], level: Level): Report {
  const words = answers.map((a) => a.split(/\s+/).filter((w) => HEBREW.test(w)));
  const total = words.reduce((n, w) => n + w.length, 0);
  const unique = new Set(words.flat().map((w) => w.replace(/[^א-ת]/g, ""))).size;
  const avg = answers.length ? total / answers.length : 0;
  const t = TARGET[level];
  const participation = Math.min(100, Math.round((answers.length / 6) * 100));
  const fluency = Math.min(100, Math.round((avg / t) * 100));
  const vocabulary = Math.min(100, Math.round((unique / (t * 3)) * 100));
  const tips: string[] = [];
  const foreign = answers.filter((a, i) => a.trim() && words[i].length === 0).length;
  if (foreign) tips.push("Essaie de répondre en hébreu, même avec des mots simples : c'est en parlant qu'on progresse.");
  if (avg < t) tips.push(`Fais des réponses un peu plus longues : vise environ ${t} mots par réponse à ton niveau.`);
  if (answers.length < 6) tips.push("Reste plus longtemps dans la conversation : 6 échanges ou plus.");
  tips.push("Révise les nouveaux mots de la session dans « Moi › Vocabulaire ».");
  return {
    participation,
    fluency,
    vocabulary,
    score: Math.round(participation * 0.3 + fluency * 0.4 + vocabulary * 0.3),
    scoreExplanation: `Score calculé sans IA, sur ce que tu as dit : 30 % participation (nombre de réponses, objectif 6), 40 % longueur des réponses (objectif ${t} mots en hébreu au niveau ${level}), 30 % variété du vocabulaire. La grammaire et la prononciation ne sont pas notées automatiquement.`,
    tips,
    summary: `Tu as fait ${answers.length} réponse${answers.length > 1 ? "s" : ""} avec ${total} mot${total > 1 ? "s" : ""} en hébreu, dont ${unique} différent${unique > 1 ? "s" : ""}.`,
  };
}
