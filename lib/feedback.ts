"use client";
import { complete, yesProbability, type LlmSettings, type Msg } from "./llm";
import { judge } from "./judge";
import { grammarPrompts, hebrewWords, readJudgement, relevancePrompt } from "./placement";
import { feminize } from "./sayInHebrew";
import type { Level } from "./languages";

/** Avis de Shuli sur une réponse de l'apprenant, affiché sous sa bulle. */
export interface Feedback {
  /** Compliment quand il n'y a rien à reprendre. */
  praise?: string;
  /** Conseils en français (règles affichées, pas d'explication inventée par le modèle). */
  tips: string[];
  /** Phrase corrigée, seulement si l'IA ne change que quelques mots (sinon on ne s'y fie pas). */
  correction?: string;
  /** Réponse plus complète sur la même idée, vérifiée par le juge (pertinente et correcte). */
  example?: string;
}

const SHOTS: [string, string, string][] = [
  ["מה אתה אוהב לעשות?", "כדורגל", "אני אוהב לשחק כדורגל עם החברים שלי בסוף השבוע."],
  ["מאיפה את?", "צרפת", "אני מצרפת, מפריז. אני גרה בישראל כבר שנה."],
  ["איך היה היום שלך?", "טוב", "היום שלי היה טוב, הלכתי לעבודה ואחר כך פגשתי חברה."],
];

/** Consigne : la même idée, en meilleur hébreu, une ou deux phrases, au genre de l'apprenant. */
function betterMessages(question: string, answer: string, f: boolean): Msg[] {
  return [
    {
      role: "system",
      content: `אתה מורה לעברית. התלמיד${f ? "ה" : ""} ענ${f ? "תה" : "ה"} על שאלה. כתוב גרסה טובה יותר של התשובה: אותו רעיון, עברית נכונה ופשוטה, משפט אחד או שניים, בגוף ראשון, בלשון ${f ? "נקבה" : "זכר"}. רק התשובה, בלי הסברים.`,
    },
    ...SHOTS.flatMap(([q, a, b]): Msg[] => [{ role: "user", content: `שאלה: ${q}\nתשובה: ${a}` }, { role: "assistant", content: b }]),
    { role: "user", content: `שאלה: ${question}\nתשובה: ${answer}` },
  ];
}

/**
 * Avis sur une réponse : pertinence, grammaire et correction par le juge du test de niveau (lib/judge.ts),
 * conseils par règles, et un exemple de meilleure réponse gardé seulement s'il passe le juge
 * (mesuré sur 8 réponses : 8 pertinents, grammaire jugée ≥ 0,81 ; une faute « שנדבר אותה » passait à 0,90, d'où le seuil 0,85).
 * null si le modèle n'est pas disponible.
 */
export async function reviewAnswer(llm: LlmSettings, o: { question: string; answer: string; level: Level; gender: "m" | "f" }): Promise<Feedback | null> {
  const ai = await judge(llm, o.question, o.answer, o.gender);
  if (!ai) return null;
  const r = readJudgement(o.answer, ai);
  const words = hebrewWords(o.answer).length;
  const asked = o.question.includes("?");
  const tips: string[] = [];

  if (asked && r.relevance < 40) tips.push("Ta réponse ne répond pas vraiment à la question de Shuli. Réécoute-la ou traduis-la, puis réponds-y directement.");
  if (!r.correction && r.grammar < 60) tips.push("Il reste sans doute une faute d'accord ou de conjugaison : vérifie le genre et la personne du verbe.");
  if (words <= 2) tips.push("Fais une phrase complète, avec un verbe : « אני… ».");
  else if (words < 5 && o.level !== "A1") tips.push("Développe un peu : ajoute un détail ou une raison (כי…, גם…, אבל…).");

  let example: string | undefined;
  if (asked && (tips.length || r.correction || words < 6)) {
    try {
      let b = (await complete(llm, { messages: betterMessages(o.question, o.answer, o.gender === "f"), temperature: 0.2, maxTokens: 60 })).split("\n")[0].trim();
      if (o.gender === "f") b = await feminize(llm, b);
      const same = hebrewWords(b).join(" ") === hebrewWords(o.answer).join(" ");
      if (b && !same && !/[a-zA-Z]/.test(b) && hebrewWords(b).length <= 20) {
        const rel = await yesProbability(llm, relevancePrompt(o.question, b));
        const ok = rel >= 0.5 && (await yesProbability(llm, grammarPrompts(b).correct)) >= 0.85;
        if (ok) example = b;
      }
    } catch {
      /* pas d'exemple */
    }
  }

  const praise = tips.length || r.correction ? undefined : words >= 6 && r.grammar >= 75 ? "Excellente réponse : claire, correcte et développée !" : "Bonne réponse, correcte !";
  return { praise, tips, correction: r.correction, example };
}
