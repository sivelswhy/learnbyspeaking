"use client";
import { complete, yesProbability, type LlmSettings, type Msg } from "./llm";
import { judge } from "./judge";
import { grammarPrompts, hebrewWords, readJudgement, relevancePrompt } from "./placement";
import { HE_LEVEL } from "./prompts";
import { feminize } from "./sayInHebrew";
import { GOALS, targetLevelOf, type Focus, type Goal, type Level } from "./languages";

/** Avis de Shuli sur une réponse de l'apprenant, affiché sous sa bulle. */
export interface Feedback {
  /** « A2 → B1 · Voyage » : le profil dont l'avis tient compte. */
  context: string;
  /** Compliment quand il n'y a rien à reprendre. */
  praise?: string;
  /** Conseils en français (règles affichées, pas d'explication inventée par le modèle). */
  tips: string[];
  /** Phrase corrigée, seulement si l'IA ne change que quelques mots (sinon on ne s'y fie pas). */
  correction?: string;
  /** Réponse plus complète sur la même idée, au niveau visé, vérifiée par le juge (pertinente et correcte). */
  example?: string;
}

export interface Learner {
  level: Level;
  targetLevel?: Level;
  goal: Goal;
  focus?: Focus[];
  gender: "m" | "f";
}

/** Longueur d'une réponse développée au niveau visé (mots hébreux). */
const DEV_WORDS: Record<Level, number> = { A1: 3, A2: 5, B1: 8, B2: 12, C1: 14, C2: 14 };

/** Ce qui distingue le niveau visé : un conseil, seulement si la réponse ne le montre pas encore. */
const LEVEL_SKILL: Partial<Record<Level, { has: RegExp; tip: string }>> = {
  A2: { has: /(^|\s)(ו[א-ת]|גם|אבל)/, tip: "Pour viser l'A2 : relie deux idées (ו…, גם…, אבל…)." },
  B1: { has: /(^|\s)(כי|אבל|אז|בגלל|כש|לכן)/, tip: "Pour viser le B1 : explique ou enchaîne tes idées (כי…, אבל…, אז…, כש…)." },
  B2: { has: /(לדעתי|אני חושב|אני חושבת|נראה לי|למרות|אם|הייתי|לכן|בגלל ש)/, tip: "Pour viser le B2 : nuance ou donne ton avis (לדעתי…, למרות ש…, אם… הייתי…)." },
  C1: { has: /(לדעתי|למרות|אילו|בעצם|מצד אחד|לעומת)/, tip: "Pour viser le C1 : compare et argumente (מצד אחד… מצד שני…, לעומת…, בעצם…)." },
};

/** Pour une réponse déjà bonne : une piste tournée vers l'objectif de l'apprenant. */
const GOAL_TIP: Record<Goal, string> = {
  travel: "Pour voyager : entraîne-toi aussi à demander (אפשר…? איפה…? כמה זה עולה?).",
  work: "Pour le travail : essaie une tournure polie (הייתי רוצה…, אפשר בבקשה…).",
  study: "Pour les études : précise ton domaine et tes cours (אני לומד/ת…, הקורס על…).",
  daily: "Pour le quotidien : ajoute quand et avec qui (בבוקר, בסוף השבוע, עם…).",
  family: "Pour la famille : parle des proches (אחי, אמא שלי, הילדים…).",
  move: "Pour t'installer : pense aux démarches (דירה, עבודה, משרד…).",
};

const SHOTS: [string, string, string][] = [
  ["מה אתה אוהב לעשות?", "כדורגל", "אני אוהב לשחק כדורגל עם החברים שלי בסוף השבוע."],
  ["מאיפה את?", "צרפת", "אני מצרפת, מפריז. אני גרה בישראל כבר שנה."],
  ["איך היה היום שלך?", "טוב", "היום שלי היה טוב, הלכתי לעבודה ואחר כך פגשתי חברה."],
];

/** Consigne : la même idée, en meilleur hébreu, au niveau visé, au genre de l'apprenant. */
function betterMessages(question: string, answer: string, f: boolean, target: Level): Msg[] {
  return [
    {
      role: "system",
      content: `אתה מורה לעברית. התלמיד${f ? "ה" : ""} ענ${f ? "תה" : "ה"} על שאלה. כתוב גרסה טובה יותר של התשובה: אותו רעיון, עברית נכונה, ברמה ${target} (${HE_LEVEL[target]}), משפט אחד או שניים, בגוף ראשון, בלשון ${f ? "נקבה" : "זכר"}. רק התשובה, בלי הסברים.`,
    },
    ...SHOTS.flatMap(([q, a, b]): Msg[] => [{ role: "user", content: `שאלה: ${q}\nתשובה: ${a}` }, { role: "assistant", content: b }]),
    { role: "user", content: `שאלה: ${question}\nתשובה: ${answer}` },
  ];
}

/**
 * Avis sur une réponse, selon le niveau de l'apprenant, le niveau visé et son objectif :
 * pertinence, grammaire et correction par le juge du test de niveau (lib/judge.ts), conseils par règles
 * (longueur attendue au niveau visé, compétence propre à ce niveau, piste liée à l'objectif), et un exemple
 * au niveau visé gardé seulement s'il passe le juge (pertinence ≥ 0,5, grammaire ≥ 0,85 :
 * une faute « שנדבר אותה » passait à 0,90 au seuil précédent).
 * null si le modèle n'est pas disponible.
 */
export async function reviewAnswer(llm: LlmSettings, o: { question: string; answer: string; learner: Learner }): Promise<Feedback | null> {
  const { learner: l } = o;
  const target = targetLevelOf(l);
  const ai = await judge(llm, o.question, o.answer, l.gender);
  if (!ai) return null;
  const r = readJudgement(o.answer, ai);
  const words = hebrewWords(o.answer).length;
  const asked = o.question.includes("?");
  const focus = l.focus ?? [];
  // « Oser parler » : on pousse un peu plus à développer ; « grammaire » : on signale plus tôt un doute.
  const devWords = DEV_WORDS[target] + (focus.includes("speaking") ? 2 : 0);
  const grammarAlert = focus.includes("grammar") ? 75 : 60;
  const tips: string[] = [];

  if (asked && r.relevance < 40) tips.push("Ta réponse ne répond pas vraiment à la question de Shuli. Réécoute-la ou traduis-la, puis réponds-y directement.");
  if (!r.correction && r.grammar < grammarAlert) tips.push("Il reste sans doute une faute d'accord ou de conjugaison : vérifie le genre et la personne du verbe.");
  if (words <= 2) tips.push("Fais une phrase complète, avec un verbe : « אני… ».");
  else if (words < devWords) tips.push(`Au niveau ${target}, on développe davantage : vise au moins ${devWords} mots, avec un détail ou une raison.`);
  const skill = LEVEL_SKILL[target];
  if (skill && words > 2 && !skill.has.test(o.answer.replace(/[֑-ׇ]/g, ""))) tips.push(skill.tip);

  let example: string | undefined;
  if (asked && (tips.length || r.correction)) {
    try {
      let b = (await complete(llm, { messages: betterMessages(o.question, o.answer, l.gender === "f", target), temperature: 0.2, maxTokens: 70 })).split("\n")[0].trim();
      if (l.gender === "f") b = await feminize(llm, b);
      const same = hebrewWords(b).join(" ") === hebrewWords(o.answer).join(" ");
      if (b && !same && !/[a-zA-Z]/.test(b) && hebrewWords(b).length <= 25) {
        const rel = await yesProbability(llm, relevancePrompt(o.question, b));
        const ok = rel >= 0.5 && (await yesProbability(llm, grammarPrompts(b).correct)) >= 0.85;
        if (ok) example = b;
      }
    } catch {
      /* pas d'exemple */
    }
  }

  const good = !tips.length && !r.correction;
  const praise = good ? (words >= devWords + 3 && r.grammar >= 75 ? "Excellente réponse : claire, correcte et développée !" : "Bonne réponse, correcte !") : undefined;
  if (good) tips.push(GOAL_TIP[l.goal]);
  return { context: `${l.level} → ${target} · ${GOALS[l.goal]}`, praise, tips, correction: r.correction, example };
}
