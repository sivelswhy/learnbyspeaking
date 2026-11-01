import type { Level } from "./languages";
import { hebrewWords, readJudgement, type AiJudgement } from "./placement";
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

/** Une réponse de l'apprenant et la question de Shuli à laquelle elle répond. */
export interface Turn {
  question: string;
  answer: string;
}

/** Réponses notées par l'IA au plus (les dernières) : ≈ 2,5 s chacune sur Mac. */
export const MAX_JUDGED = 8;

/**
 * Bilan noté par l'IA : pour chaque réponse, est-elle en lien avec la question de Shuli, est-elle correcte (et sa correction).
 * 35 % pertinence, 40 % grammaire, 10 % participation, 15 % variété du vocabulaire.
 * `judge` renvoie null si le modèle n'est pas disponible : on revient au bilan par règles.
 */
export async function scoreSessionAI(turns: Turn[], level: Level, judge: (t: Turn) => Promise<AiJudgement | null>): Promise<Report> {
  const rules = scoreSession(turns.map((t) => t.answer), level);
  const judged = turns.filter((t) => hebrewWords(t.answer).length).slice(-MAX_JUDGED);
  const read: { t: Turn; relevance: number; grammar: number; correction?: string }[] = [];
  for (const t of judged) {
    const ai = await judge(t);
    if (!ai) return rules;
    // Conversation : sans question de Shuli, ou avec une question en retour (« כמה זה עולה? »), la réplique n'est pas hors sujet.
    if (!t.question.includes("?") || t.answer.trim().endsWith("?")) ai.relevance = 1;
    read.push({ t, ...readJudgement(t.answer, ai) });
  }
  if (!read.length) return rules;
  const avg = (k: "relevance" | "grammar") => Math.round(read.reduce((a, r) => a + r[k], 0) / read.length);
  const relevance = avg("relevance");
  const grammar = avg("grammar");
  const onTopic = read.filter((r) => r.relevance >= 50).length;
  const correct = read.filter((r) => r.grammar >= 60).length;
  const mainErrors = read
    .filter((r) => r.correction)
    .slice(0, 4)
    .map((r) => `« ${r.t.answer.trim()} » → « ${r.correction} »`);
  const tips: string[] = [];
  if (onTopic < read.length) tips.push("Certaines réponses ne suivaient pas la question de Shuli : écoute-la jusqu'au bout, ou touche « Traduire » avant de répondre.");
  if (mainErrors.length) tips.push("Relis les corrections ci-dessus à voix haute : c'est le moyen le plus rapide de retenir la bonne forme. (L'IA peut se tromper.)");
  if (rules.fluency < 70) tips.push("Ajoute un détail à tes réponses : une deuxième idée avec ו (et) ou כי (parce que).");
  if (turns.length < 6) tips.push("Reste plus longtemps dans la conversation : 6 échanges ou plus.");
  tips.push("Révise les nouveaux mots de la session dans « Moi › Vocabulaire ».");
  return {
    ...rules,
    relevance,
    grammar,
    score: Math.round(relevance * 0.35 + grammar * 0.4 + rules.participation * 0.1 + rules.vocabulary * 0.15),
    scoreExplanation: `Score calculé par l'IA (DictaLM, sur ton appareil) et par des règles : 35 % pertinence (tes réponses suivent-elles la question de Shuli ?), 40 % grammaire (l'IA juge chaque phrase et propose une correction), 10 % participation (objectif 6 réponses), 15 % variété du vocabulaire.${judged.length < turns.length ? ` L'IA a noté tes ${judged.length} dernières réponses.` : ""} L'IA peut se tromper ; la prononciation n'est pas notée.`,
    mainErrors,
    tips,
    summary: `${onTopic} de tes ${read.length} réponses suivent bien la conversation, et ${correct} sont correctes selon l'IA.`,
  };
}
