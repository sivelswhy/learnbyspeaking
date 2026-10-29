import { GOALS, LANGUAGES, type Scenario } from "./languages";
import type { Correction, Profile } from "./types";

const LEVEL_STYLE: Record<string, string> = {
  A1: "very short sentences (3-7 words), basic everyday words, present tense only",
  A2: "short simple sentences, common vocabulary, present and simple past",
  B1: "medium-length sentences, varied everyday vocabulary",
  B2: "natural sentences with common idioms",
  C1: "rich, nuanced natural speech",
  C2: "fully native speech, no simplification",
};

const str = { type: "string" };

/** Exemple de bon échange, pour caler le style des petits modèles. */
const REPLY_EXAMPLE: Partial<Record<string, string>> = {
  he: `Learner: אני רוצה קפה
You: בטח! קפה הפוך או שחור?
Learner: הפוך בבקשה
You: מעולה. רוצה גם משהו לאכול?`,
};

function genderLine(p: Profile) {
  const t = LANGUAGES[p.target];
  if (!t.genderedYou || !p.gender) return "";
  return p.gender === "f"
    ? "The learner is a woman: address her with feminine forms (את, לך, רוצה, ספרי…)."
    : "The learner is a man: address him with masculine forms (אתה, לך, רוצה, ספר…).";
}

const HE_LEVEL: Record<string, string> = {
  A1: "משפטים קצרים מאוד (3 עד 7 מילים), מילים בסיסיות, זמן הווה בלבד",
  A2: "משפטים קצרים ופשוטים, מילים יומיומיות",
  B1: "משפטים באורך בינוני, אוצר מילים מגוון",
  B2: "עברית טבעית עם ביטויים נפוצים",
  C1: "עברית עשירה וטבעית",
  C2: "עברית של דובר ילידי",
};

/**
 * Appel 1 : la réponse parlée (streaming).
 * Pour l'hébreu, consignes en hébreu : DictaLM (entraîné sur l'hébreu) les suit bien mieux qu'en anglais.
 */
export function replySystem(p: Profile, sc: Pick<Scenario, "role" | "goal">, weak: string[]) {
  const t = LANGUAGES[p.target];
  if (p.target === "he") {
    const you = p.gender === "f" ? "פני אל התלמידה בלשון נקבה (את, רוצה, אוהבת)." : "פנה אל התלמיד בלשון זכר (אתה, רוצה, אוהב).";
    return `אתה משתתף בשיחה בעל פה עם תלמיד שלומד עברית (רמה ${p.level}).
התפקיד שלך: ${sc.role} (התיאור בצרפתית). המטרה של התלמיד: ${sc.goal}.
כללים:
- ענה בעברית בלבד: ${HE_LEVEL[p.level]}.
- משפט אחד או שניים קצרים, כמו בשיחה אמיתית, ואז שאלה קצרה אחת שממשיכה את השיחה.
- הגב למה שהתלמיד אמר. אל תחזור על אותה שאלה פעמיים.
- בלי רשימות, בלי כוכביות, בלי אימוג'י, בלי תרגום ובלי הסברים.
- ${you}${weak.length ? `\n- תן לתלמיד הזדמנות לתרגל: ${weak.join("; ")}.` : ""}
דוגמה:
תלמיד: אני רוצה קפה
אתה: בטח! קפה הפוך או שחור?`;
  }
  const ex = REPLY_EXAMPLE[p.target];
  return `You are a native ${t.name} speaker having a spoken conversation with a language learner (level ${p.level}).
Role-play: you are ${sc.role} (described in French). The learner's goal in this scene: ${sc.goal}. Overall learning goal: ${GOALS[p.goal]}.
Language notes: ${t.tutorNotes}
${genderLine(p)}

Rules:
- Reply ONLY in ${t.name}. Use ${LEVEL_STYLE[p.level]}.
- 1 or 2 short sentences, like real speech. Then ask ONE simple follow-up question that moves the scene forward.
- React to what the learner actually said. Stay in character. Never break the role.
- Never repeat a word or phrase twice in a row. Never repeat a question you already asked.
- No translation, no transliteration, no explanation, no emoji, no quotes.${weak.length ? `\n- Naturally give the learner chances to practise: ${weak.join("; ")}.` : ""}
${ex ? `\nExample of the expected style:\n${ex}` : ""}`;
}

/** Nettoie la réponse d'un petit modèle : pas de markdown, 2 phrases maximum. */
export function tidyReply(text: string): string {
  const flat = text.replace(/[*#_`>]/g, "").replace(/^\s*[-•]\s*/gm, "").replace(/\s*\n+\s*/g, " ").trim();
  const parts = flat.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [flat];
  return parts.slice(0, 2).join("").trim();
}

type Chat = { role: "system" | "user" | "assistant"; content: string }[];

/**
 * Les petits modèles suivent mal une consigne, mais imitent très bien des exemples :
 * traduction et suggestions se font donc « par l'exemple » (few-shot).
 */
const TR_SHOTS: Record<string, [string, string][]> = {
  fr: [["בטח! קפה הפוך או שחור?", "Bien sûr ! Un café au lait ou noir ?"], ["זה עולה עשרים שקל.", "Ça coûte vingt shekels."], ["איפה אתה גר?", "Tu habites où ?"]],
  en: [["בטח! קפה הפוך או שחור?", "Sure! A latte or black coffee?"], ["זה עולה עשרים שקל.", "It costs twenty shekels."], ["איפה אתה גר?", "Where do you live?"]],
  es: [["בטח! קפה הפוך או שחור?", "¡Claro! ¿Café con leche o solo?"], ["זה עולה עשרים שקל.", "Cuesta veinte séqueles."], ["איפה אתה גר?", "¿Dónde vives?"]],
};

/** Traduction d'une phrase cible -> langue maternelle (ou l'inverse si `reverse`). */
export function translateMessages(p: Profile, text: string, reverse = false): Chat {
  const n = LANGUAGES[p.native];
  const t = LANGUAGES[p.target];
  const shots = TR_SHOTS[p.native] ?? TR_SHOTS.en;
  const [from, to] = reverse ? [n.name, t.name] : [t.name, n.name];
  return [
    { role: "system", content: `You translate ${from} sentences into ${to}. Output only the translation.` },
    ...shots.flatMap(([he, nat]) => (reverse ? [{ role: "user" as const, content: nat }, { role: "assistant" as const, content: he }] : [{ role: "user" as const, content: he }, { role: "assistant" as const, content: nat }])),
    { role: "user", content: text },
  ];
}

const SUG_SHOTS: [string, Record<"m" | "f", string>][] = [
  ["שולחן לכמה אנשים?", { m: "שולחן לשניים, בבקשה.", f: "שולחן לשניים, בבקשה." }],
  ["מה אתה רוצה לשתות?", { m: "אני רוצה מים, בבקשה.", f: "אני רוצה מים, בבקשה." }],
  ["איך היה סוף השבוע?", { m: "היה טוב, הלכתי לים.", f: "היה טוב, הלכתי לים." }],
  ["מאיפה אתה?", { m: "אני מצרפת, אני גר בפריז.", f: "אני מצרפת, אני גרה בפריז." }],
];

/** Une réponse courte que l'apprenant pourrait dire (exemples au bon genre). */
export function suggestMessages(p: Profile, partner: string): Chat {
  const g = p.gender ?? "m";
  return [
    { role: "system", content: "כתוב תשובה קצרה ופשוטה אחת (משפט אחד) שתלמיד מתחיל יכול לענות." },
    ...SUG_SHOTS.flatMap(([q, a]) => [{ role: "user" as const, content: q }, { role: "assistant" as const, content: a[g] }]),
    { role: "user", content: partner },
  ];
}

/** Exemples d'échanges courts, placés avant l'historique pour caler la longueur et le ton. */
export function replyShots(p: Profile): Chat {
  if (p.target !== "he") return [];
  const g = p.gender ?? "m";
  return [
    { role: "user", content: "שלום" },
    { role: "assistant", content: "שלום! מה נשמע?" },
    { role: "user", content: "אני רוצה מים" },
    { role: "assistant", content: g === "f" ? "בטח. רוצה גם משהו לאכול?" : "בטח. רוצה גם משהו לאכול?" },
  ];
}

export function openingPrompt() {
  return "(Start the conversation in character with one short greeting and one question.)";
}

/** Aides ponctuelles. */
export const assistSchema = {
  type: "object",
  properties: { result: str, transliteration: str, example: str },
  required: ["result", "transliteration", "example"],
};

export function assistSystem(p: Profile, kind: "translate" | "rephrase" | "help") {
  const t = LANGUAGES[p.target];
  const n = LANGUAGES[p.native];
  const task = {
    translate: `Traduis en ${n.name} le texte en ${t.name}. result = traduction. example = "".`,
    rephrase: `Reformule le texte en ${t.name} de façon plus naturelle, comme un natif. result = reformulation. example = "".`,
    help: `L'apprenant ne sait pas quoi répondre au message du partenaire (le texte). result = une réponse simple en ${t.name}, adaptée au niveau ${p.level}. example = explication en ${n.name}.`,
  }[kind];
  return `Tu aides un apprenant (langue maternelle : ${n.name}) à apprendre ${t.name}. ${t.tutorNotes}\n${task}\ntransliteration : ${t.needsTransliteration ? `transcription latine du texte en ${t.name} (celui de result si c'est du ${t.name}, sinon du texte donné)` : '""'}.`;
}

export function correctionsToWeakPoints(cs: Correction[]): string[] {
  const count = new Map<string, number>();
  for (const c of cs) count.set(c.category, (count.get(c.category) ?? 0) + 1);
  const hints = cs.slice(-6).map((c) => c.explanation).filter(Boolean);
  const cats = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => `erreurs de ${k}`);
  return [...cats.slice(0, 2), ...hints.slice(0, 2)];
}
