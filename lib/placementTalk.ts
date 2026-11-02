"use client";
import { complete, isReady, type LlmSettings } from "./llm";
import { dontKnow, hebrewWords } from "./placement";
import { pickGender, replyFlaws, tidyReply } from "./prompts";
import { CLARIFY, flat, isQuestion } from "./scenes";

/**
 * Test de niveau mené comme une vraie discussion : Shuli réagit à ce que l'apprenant dit, sans attendre une
 * réponse précise. Les cas qui ne sont pas une réponse (silence, « je n'ai pas compris », français, question en
 * retour) reçoivent une réplique humaine et la question reste ouverte ; tout le reste est noté normalement.
 * Chaque réplique a une version écrite à la main : le test marche aussi sans modèle chargé.
 */
export type TalkKind = "answer" | "filler" | "clarify" | "french" | "askBack" | "offTopic";

/** Silence, « אממ », « ... ». */
const FILLER = /^[\s.…!?,\-]*((א|ה)+מ+|א+ה+|ה+מ+|אה|אמ)?[\s.…!?,\-]*$/;
/** « je n'ai pas compris » en français ou en anglais, ou un simple « מה? ». */
const CLARIFY_OTHER = /comprends? pas|compris|r[ée]p[ée]t|pardon|quoi\s*\?|sorry|understand|repeat|what\s*\?/i;
/** Question qui vise Shuli (« ואתה? », « מאיפה אתה? », « מה איתך? »). */
const ABOUT_YOU = /(^|\s)(ו?אתה|ו?את|לך|שלך|ממך|איתך|אותך)(\s|$)/;

export function classify(said: string, retries: number): TalkKind {
  const t = said.trim();
  // Après deux échanges sur la même question, on prend ce qui vient comme réponse (on n'insiste pas).
  if (!t || retries >= 2) return "answer";
  const f = flat(t);
  if (FILLER.test(t)) return "filler";
  if (CLARIFY.test(f) || /^מה\s*\?*$/.test(t.replace(/[.!]/g, "")) || CLARIFY_OTHER.test(t)) return "clarify";
  const he = hebrewWords(t).length;
  if (!he && /[a-zA-ZÀ-ÿ]{2,}/.test(t)) return "french";
  // « ואתה? » seul : question en retour. « אני מפריז, ואתה? » : c'est une réponse (et Shuli répondra à la question).
  const before = t.split(/[?,]|\s(?:ו?אתה|ו?את)(?=[\s?.!]|$)/)[0];
  if (isQuestion(t) && ABOUT_YOU.test(f) && hebrewWords(before).length < 2) return "askBack";
  return "answer";
}

const you = (g: "m" | "f", m: string, f: string) => (g === "f" ? f : m);

/** Phrases écrites à la main : toujours justes, utilisées sans modèle ou si la réplique du modèle a un défaut. */
export function fallbackLine(kind: TalkKind, question: string, g: "m" | "f", score?: number, said = ""): string {
  switch (kind) {
    case "filler":
      return `${you(g, "לא נורא, קח את הזמן.", "לא נורא, קחי את הזמן.")} ${question}`;
    case "clarify":
      return `${you(g, "אין בעיה, אני שואל שוב, לאט:", "אין בעיה, אני שואל שוב, לאט:")} ${question}`;
    case "french":
      return `${you(g, "נסה בעברית, אפילו מילה אחת זה בסדר!", "נסי בעברית, אפילו מילה אחת זה בסדר!")} ${question}`;
    case "offTopic":
      return `${you(g, "מעניין!", "מעניין!")} אבל שאלתי: ${question}`;
    case "askBack":
      return `שאלה טובה! ${you(g, "קודם אתה:", "קודם את:")} ${question}`;
    default:
      if (!hebrewWords(said).length || dontKnow(said)) return "לא נורא, נמשיך!";
      return (score ?? 50) >= 55 ? "יופי, הבנתי!" : "אוקיי, תודה!";
  }
}

const SHULI = "אתה שולי, ישראלי מתל אביב, נחמד ורגוע. אתה מדבר בעל פה";

/** Ce qu'on demande au modèle pour chaque cas (consignes en hébreu : les deux modèles les suivent mieux). */
function prompt(kind: TalkKind, question: string, said: string, g: "m" | "f", level: string): string {
  const who = you(g, "תלמיד", "תלמידה");
  const addr = you(g, "פנה אליו בלשון זכר (אתה).", "פנה אליה בלשון נקבה (את).");
  const common = `${SHULI} עם ${who} עברית ברמה ${level}. ${addr} עברית פשוטה, בלי אנגלית, בלי אימוג'י, בלי רשימות.`;
  switch (kind) {
    case "clarify":
      return `${common}\nשאלת: "${question}". ${you(g, "הוא לא הבין", "היא לא הבינה")}. תגיד את אותה שאלה שוב במילים פשוטות וקצרות יותר. רק את השאלה, משפט אחד שנגמר ב"?".`;
    case "offTopic":
      return `${common}\nשאלת: "${question}". ${you(g, "הוא ענה", "היא ענתה")}: "${said}", וזה לא תשובה לשאלה. תגיב רק למה ש${you(g, "הוא אמר", "היא אמרה")}, בקצרה ובטבעיות: משפט אחד, עד שמונה מילים, בלי שאלה.`;
    case "askBack":
      return `${SHULI}. מישהו שואל אותך: "${question.replace(/\b(את|אתה)\b/g, "אתה")}". ענה עליך, בגוף ראשון, כמו בן אדם (פרט אישי פשוט ואמיתי). משפט אחד קצר, עד עשר מילים, בלי שאלה, בלי אנגלית.`;
    default:
      return `${common}\nשאלת: "${question}". ${you(g, "הוא ענה", "היא ענתה")}: "${said}".\nתגיב כמו בן אדם אמיתי למה ש${you(g, "הוא אמר", "היא אמרה")}: תגובה קצרה וחמה, משפט אחד, עד שמונה מילים. בלי שאלה, בלי תיקון, בלי ציון.${isQuestion(said) ? " אם יש שאלה אליך, ענה עליה בקצרה." : ""}\nדוגמאות: "אני עובד בבנק" ← "בבנק? עבודה רצינית!". "אני לא אוהב לבשל" ← "גם אני לא, אני מזמין אוכל!".`;
  }
}

/** Réplique de Shuli : par le modèle si possible (vérifiée), sinon la phrase écrite à la main. */
export async function shuliLine(llm: LlmSettings, o: {
  kind: TalkKind; question: string; said: string; gender: "m" | "f"; level: string; score?: number;
}): Promise<string> {
  const fallback = fallbackLine(o.kind, o.question, o.gender, o.score, o.said);
  // Silence et français : la phrase écrite suffit (encourager puis reposer la question telle quelle).
  // Silence, français, « je n'ai pas compris » : la phrase écrite suffit (Gemma 2B, priée de simplifier, changeait
  // le sens : « ממתי את לומדת » → « מתי את לומדת ») ; la traduction ou l'exemple s'affichent en plus.
  if (o.kind === "filler" || o.kind === "french" || o.kind === "clarify" || (!hebrewWords(o.said).length || dontKnow(o.said)) && o.kind === "answer") return fallback;
  if (!isReady(llm)) return fallback;
  try {
    for (const temperature of [0.6, 0.9]) {
      const out = await complete(llm, {
        messages: [{ role: "user", content: prompt(o.kind, o.question, o.said, o.gender, o.level) }],
        temperature, maxTokens: 70, antiRepeat: true,
      });
      const line = pickGender(tidyReply(out).replace(/^["«»“”']+|["«»“”']+$/g, ""), o.gender);
      const words = line.split(/\s+/).filter(Boolean).length;
      const flaws = replyFlaws(line, o.gender).filter((f) => f !== "sans question" && f !== "long");
      // Le modèle ne fait que la réaction ; la question est reposée telle quelle (il la déformait).
      const shape = !line.includes("?") && words <= (o.kind === "askBack" ? 12 : o.kind === "offTopic" ? 9 : 14);
      if (!line || flaws.length || !shape) continue;
      if (o.kind === "askBack") return `${line} ${you(o.gender, "ועכשיו אתה:", "ועכשיו את:")} ${o.question}`;
      if (o.kind === "offTopic") return `${line} ${you(o.gender, "אבל שאלתי:", "אבל שאלתי:")} ${o.question}`;
      return line;
    }
  } catch (e) {
    console.warn("Réplique du test de niveau : phrase écrite à la main", e);
  }
  return fallback;
}
