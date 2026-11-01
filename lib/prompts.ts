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

/** Rôle et objectif des scénarios en hébreu : DictaLM suit mal une description en français. */
const HE_SCENE: Record<string, { role: string; goal: string }> = {
  free: { role: "חבר נחמד שמדבר בטבעיות", goal: "לדבר על מה שבא לו" },
  restaurant: { role: "מלצר במסעדה בתל אביב", goal: "להזמין אוכל ולבקש חשבון" },
  market: { role: "מוכר בשוק הכרמל", goal: "לשאול מחיר ולקנות" },
  meet: { role: "אדם נחמד שפוגשים בפעם הראשונה במסיבה", goal: "להציג את עצמו ולהכיר" },
  hotel: { role: "פקיד קבלה במלון", goal: "לעשות צ'ק-אין ולשאול שאלות" },
  airport: { role: "פקיד צ'ק-אין בנמל התעופה בן גוריון", goal: "צ'ק-אין, מזוודות ושער העלייה" },
  taxi: { role: "נהג מונית", goal: "להגיד לאן נוסעים ולשאול על הדרך" },
  daily: { role: "שכן נחמד וסקרן", goal: "לדבר על היום, על המשפחה ועל ההרגלים" },
  study: { role: "חבר ללימודים באוניברסיטה", goal: "לדבר על הלימודים ועל הקורסים" },
  interview: { role: "מראיין בראיון עבודה", goal: "לספר על הניסיון ועל המוטיבציה" },
};

/**
 * Appel 1 : la réponse parlée (streaming).
 * Pour l'hébreu, consignes en hébreu et au genre de l'apprenant : DictaLM (entraîné sur l'hébreu) les suit bien mieux qu'en anglais.
 */
export function replySystem(p: Profile, sc: Pick<Scenario, "role" | "goal"> & { id?: string }, weak: string[]) {
  const t = LANGUAGES[p.target];
  if (p.target === "he") {
    const f = p.gender === "f";
    const scene = (sc.id && HE_SCENE[sc.id]) || { role: `${sc.role} (התיאור בצרפתית)`, goal: sc.goal };
    const who = f ? "תלמידה" : "תלמיד";
    const you = f ? "פנה אליה תמיד בלשון נקבה: את, רוצה, אוהבת, תגידי, תרצי." : "פנה אליו תמיד בלשון זכר: אתה, רוצה, אוהב, תגיד, תרצה.";
    return `אתה שולי. אתה מדבר בעל פה עם ${who} שלומד${f ? "ת" : ""} עברית (רמה ${p.level}).
התפקיד שלך: ${scene.role}. המטרה של ה${who}: ${scene.goal}.
כללים:
- ענה בעברית בלבד: ${HE_LEVEL[p.level]}.
- תגובה קצרה מאוד (עד 10 מילים) ואז שאלה קצרה ופשוטה אחת.
- הגב למה ש${f ? "היא אמרה" : "הוא אמר"}. אל תחזור על אותה שאלה פעמיים.
- בלי רשימות, בלי כוכביות, בלי אימוג'י, בלי תרגום ובלי הסברים.
- ${you}${weak.length ? `\n- תן הזדמנות לתרגל: ${weak.join("; ")}.` : ""}`;
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
  // Réponse coupée par la limite de longueur : on retire la phrase inachevée s'il reste une phrase complète.
  if (parts.length > 1 && !/[.!?]$/.test(parts[parts.length - 1].trim())) parts.pop();
  return parts.slice(0, 2).join("").trim();
}

/** Lettres finales hébraïques et leur forme au milieu d'un mot (pour תומך + ת → תומכת). */
const FINAL: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

/**
 * DictaLM écrit parfois les deux genres à la fois (« את/ה », « אוהב/ת »).
 * On garde celui de l'apprenant, sauf quand Shuli parle de lui (après « אני ») : masculin.
 */
export function pickGender(text: string, learner: "m" | "f"): string {
  return text.replace(/(\S*?)([\u05d0-\u05ea]+)\/([\u05d0-\u05ea]{1,2})(?![\u05d0-\u05ea])/g, (all, pre: string, base: string, suf: string, off: number, whole: string) => {
    const g = /אני\s+$/.test(whole.slice(Math.max(0, off - 6), off)) ? "m" : learner;
    // « את/ה », aussi avec un préfixe (שאת/ה, ואת/ה)
    if (base.endsWith("את") && base.length <= 3 && suf === "ה") return pre + base.slice(0, -2) + (g === "m" ? "אתה" : "את");
    if (g === "m") return pre + base;
    const last = base.slice(-1);
    return pre + base.slice(0, -1) + (FINAL[last] ?? last) + suf;
  });
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

/** Vers l'hébreu : phrases à la 1re personne, au genre de l'apprenant (DictaLM suit les exemples bien plus que les consignes). */
const TR_FIRST_PERSON: Record<string, [Record<"m" | "f", string>, string][]> = {
  fr: [[{ m: "אני עייף.", f: "אני עייפה." }, "Je suis fatigué."], [{ m: "אני צריך עזרה.", f: "אני צריכה עזרה." }, "J'ai besoin d'aide."], [{ m: "אני גר בפריז.", f: "אני גרה בפריז." }, "J'habite à Paris."], [{ m: "אני מחפש את המפתחות.", f: "אני מחפשת את המפתחות." }, "Je cherche mes clés."]],
  en: [[{ m: "אני עייף.", f: "אני עייפה." }, "I'm tired."], [{ m: "אני צריך עזרה.", f: "אני צריכה עזרה." }, "I need help."], [{ m: "אני גר בפריז.", f: "אני גרה בפריז." }, "I live in Paris."], [{ m: "אני מחפש את המפתחות.", f: "אני מחפשת את המפתחות." }, "I'm looking for my keys."]],
  es: [[{ m: "אני עייף.", f: "אני עייפה." }, "Estoy cansado."], [{ m: "אני צריך עזרה.", f: "אני צריכה עזרה." }, "Necesito ayuda."], [{ m: "אני גר בפריז.", f: "אני גרה בפריז." }, "Vivo en París."], [{ m: "אני מחפש את המפתחות.", f: "אני מחפשת את המפתחות." }, "Busco mis llaves."]],
};

/** Questions : sans elles, DictaLM répond à « Où est… ? » au lieu de le traduire. */
const TR_QUESTIONS: Record<string, [string, string][]> = {
  fr: [["איפה הבנק?", "Où est la banque ?"], ["אתה רוצה קפה?", "Tu veux un café ?"]],
  en: [["איפה הבנק?", "Where is the bank?"], ["אתה רוצה קפה?", "Do you want a coffee?"]],
  es: [["איפה הבנק?", "¿Dónde está el banco?"], ["אתה רוצה קפה?", "¿Quieres un café?"]],
};

/**
 * Traduction d'une phrase cible -> langue maternelle (ou l'inverse si `reverse`).
 * Chaque demande est présentée comme « traduis : … » : sinon le modèle répond à la phrase au lieu de la traduire.
 */
export function translateMessages(p: Profile, text: string, reverse = false): Chat {
  const n = LANGUAGES[p.native];
  const t = LANGUAGES[p.target];
  const g = p.gender ?? "m";
  const firstPerson = reverse && t.genderedYou ? (TR_FIRST_PERSON[p.native] ?? TR_FIRST_PERSON.en).map(([he, nat]) => [he[g], nat] as [string, string]) : [];
  const shots = [...(TR_SHOTS[p.native] ?? TR_SHOTS.en), ...(TR_QUESTIONS[p.native] ?? TR_QUESTIONS.en), ...firstPerson];
  const [from, to] = reverse ? [n.name, t.name] : [t.name, n.name];
  const ask = (x: string) => `Translate into ${to}: ${x}`;
  return [
    { role: "system", content: `You translate ${from} sentences into ${to}. Translate exactly, keep names and places, never answer the sentence. Output only the translation.${reverse && t.genderedYou && p.gender ? ` The speaker is a ${p.gender === "f" ? "woman: write first-person verbs and adjectives in the feminine (אני רעבה, אני צריכה, אני גרה)" : "man: write first-person verbs and adjectives in the masculine (אני רעב, אני צריך, אני גר)"}.` : ""}` },
    ...shots.flatMap(([he, nat]) => (reverse ? [{ role: "user" as const, content: ask(nat) }, { role: "assistant" as const, content: he }] : [{ role: "user" as const, content: ask(he) }, { role: "assistant" as const, content: nat }])),
    { role: "user", content: ask(text) },
  ];
}

type Shot = [string, string];
/** Exemples propres à chaque situation : un petit modèle tient bien mieux son rôle (serveur, vendeur…) avec eux. */
const SCENE_SHOTS: Record<string, (f: boolean) => Shot[]> = {
  restaurant: () => [["שולחן לשניים, בבקשה", "בבקשה, שבו כאן. מה תרצו לשתות?"], ["אני רוצה פיצה", "פיצה, מצוין. רוצה גם סלט?"], ["אפשר חשבון?", "בטח, הנה החשבון. היה טעים?"]],
  market: () => [["כמה עולות העגבניות?", "עשרה שקלים לקילו. כמה לשים?"], ["זה יקר!", "בשבילך, שמונה שקלים. בסדר?"], ["קילו תפוחים, בבקשה", "בבקשה. עוד משהו?"]],
  meet: (f) => [["קוראים לי טל", f ? "נעים מאוד, טל! מאיפה את?" : "נעים מאוד, טל! מאיפה אתה?"], ["אני מצרפת", f ? "צרפת, איזה יופי! מה את עושה בישראל?" : "צרפת, איזה יופי! מה אתה עושה בישראל?"]],
  hotel: (f) => [["כן, יש לי הזמנה", "מצוין. על איזה שם?"], ["על השם כהן", f ? "הנה, חדר שתים עשרה. צריכה עזרה עם המזוודות?" : "הנה, חדר שתים עשרה. צריך עזרה עם המזוודות?"], ["יש ארוחת בוקר?", "כן, משבע עד עשר. עוד שאלה?"]],
  airport: (f) => [["הנה הדרכון", f ? "תודה. לאן את טסה?" : "תודה. לאן אתה טס?"], ["לפריז", "יש לך מזוודות?"], ["מזוודה אחת", "בסדר. חלון או מעבר?"]],
  taxi: (f) => [["לתחנה המרכזית, בבקשה", f ? "בסדר, יוצאים. את ממהרת?" : "בסדר, יוצאים. אתה ממהר?"], ["כמה זה עולה?", "בערך חמישים שקל. בסדר?"], ["כאן זה טוב, תודה", "בבקשה, חמישים שקל. במזומן או באשראי?"]],
  daily: (f) => [["היה טוב, הלכתי לים", "איזה כיף! עם מי הלכת?"], ["עם חברים", f ? "יופי. ומה את עושה היום?" : "יופי. ומה אתה עושה היום?"], [f ? "היום אני עובדת" : "היום אני עובד", f ? "בהצלחה! איפה את עובדת?" : "בהצלחה! איפה אתה עובד?"]],
  study: (f) => [["יש לי שיעור עברית", "גם לי! המורה נחמדה?"], ["כן, היא נחמדה", f ? "יופי. את לומדת הרבה בבית?" : "יופי. אתה לומד הרבה בבית?"]],
  interview: (f) => [["קוראים לי טל, אני מצרפת", "נעים מאוד. מה המקצוע שלך?"], [f ? "אני מהנדסת" : "אני מהנדס", f ? "מעניין. למה את רוצה לעבוד אצלנו?" : "מעניין. למה אתה רוצה לעבוד אצלנו?"]],
};

/** Exemples d'échanges courts, placés avant l'historique pour caler la longueur, le ton, le genre et le rôle. */
export function replyShots(p: Profile, sceneId?: string): Chat {
  if (p.target !== "he") return [];
  const f = p.gender === "f";
  const scene = sceneId ? SCENE_SHOTS[sceneId]?.(f) : undefined;
  const shots: Shot[] = scene ?? [
    ["שלום", "שלום! מה שלומך?"],
    ["אני בסדר, תודה", f ? "יופי! מאיפה את?" : "יופי! מאיפה אתה?"],
    ["אני מצרפת", f ? "צרפת יפה! מה את אוהבת לעשות?" : "צרפת יפה! מה אתה אוהב לעשות?"],
    ["אני רוצה מים", "בטח. רוצה גם משהו לאכול?"],
  ];
  return shots.flatMap(([u, a]) => [{ role: "user" as const, content: u }, { role: "assistant" as const, content: a }]);
}

/** Formes de « tu » au mauvais genre (liste non exhaustive des plus fréquentes). */
const MASC_YOU = /(^|[\s,.!?])(אתה|תגיד|תן|שים|קח|תבחר|תספר|ספר לי|בוא|תזמין|תרצה|תהנה|תיהנה|תצטרך|תוכל|אתה רוצה)(?=[\s,.!?]|$)/;
const FEM_YOU = /(^|[\s,.!?])(תגידי|תני|שימי|קחי|תבחרי|תספרי|ספרי לי|בואי|תזמיני|תרצי|תהני|תיהני|תצטרכי|תוכלי)(?=[\s,.!?]|$)/;

/** Shuli est un homme : « אני » suivi d'une forme féminine (« אני שמחה ») est une faute. */
const NOAM_FEM = /(^|[\s,.!?])(ו|ש|כש)?אני\s+(לא\s+)?(יכולה|שמחה|אוהבת|גרה|עובדת|לומדת|מבינה|חושבת|צריכה|מחפשת|יודעת|מדברת|הולכת|מצטערת|בטוחה|ממליצה|מציעה|נותנת|מכינה|מביאה)(?=[\s,.!?]|$)/;

/** Défauts d'une réplique de Shuli (0 = parfaite) : sert à choisir la meilleure de plusieurs tentatives. */
export function replyFlaws(text: string, gender: "m" | "f", said: string[] = []): string[] {
  const words = text.split(/\s+/).filter(Boolean).length;
  const norm = (t: string) => t.replace(/[^\u05d0-\u05ea]/g, "");
  return [
    !text && "vide",
    /[a-zA-Z]/.test(text) && "latin",
    (gender === "f" ? MASC_YOU : FEM_YOU).test(text) && "genre",
    NOAM_FEM.test(text) && "genre",
    words > 16 && "long",
    !text.includes("?") && "sans question",
    said.some((s) => norm(s) === norm(text)) && "répétition",
  ].filter((x): x is string => !!x);
}

export function openingPrompt() {
  return "(Start the conversation in character with one short greeting and one question.)";
}

export function correctionsToWeakPoints(cs: Correction[]): string[] {
  const count = new Map<string, number>();
  for (const c of cs) count.set(c.category, (count.get(c.category) ?? 0) + 1);
  const hints = cs.slice(-6).map((c) => c.explanation).filter(Boolean);
  const cats = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => `erreurs de ${k}`);
  return [...cats.slice(0, 2), ...hints.slice(0, 2)];
}

/* ---------- Dictionnaire (« Définir un mot ») : par l'exemple, comme la traduction ---------- */

/** Exemples choisis parmi les faux amis avec l'anglais (« pain », « chat ») : sans eux, DictaLM lit le mot en anglais. */
const WORD_SHOTS: [string, string][] = [
  ["maison", "בית"],
  ["pain", "לחם"],
  ["manger", "לאכול"],
  ["chat", "חתול"],
  ["voiture", "מכונית"],
  ["heureux", "שמח"],
  ["lentement", "לאט"],
  ["médecin", "רופא"],
  ["fromage", "גבינה"],
  ["demain", "מחר"],
];

/** Un mot (ou une courte expression) en français → le mot hébreu le plus courant, seul. */
export function wordMessages(word: string): Chat {
  const ask = (w: string) => `המילה בצרפתית: ${w}`;
  return [
    { role: "system", content: "תרגם מילה מצרפתית לעברית. כתוב רק את המילה בעברית, בלי ניקוד ובלי הסבר." },
    ...WORD_SHOTS.flatMap(([fr, he]) => [{ role: "user" as const, content: ask(fr) }, { role: "assistant" as const, content: he }]),
    { role: "user", content: ask(word) },
  ];
}

const EXAMPLE_SHOTS: [string, string][] = [
  ["בית", "יש לי בית קטן."],
  ["לאכול", "אני רוצה לאכול."],
  ["רופא", "הרופא נחמד."],
  ["מחר", "נתראה מחר."],
  ["לשחות", "אני אוהב לשחות."],
  ["תחנת אוטובוס", "תחנת האוטובוס קרובה."],
];

/** Une phrase d'exemple très courte et simple avec le mot hébreu. */
export function exampleMessages(he: string): Chat {
  return [
    { role: "system", content: "כתוב משפט אחד קצר מאוד (עד 5 מילים) ופשוט בעברית עם המילה. רק את המשפט." },
    ...EXAMPLE_SHOTS.flatMap(([w, s]) => [{ role: "user" as const, content: w }, { role: "assistant" as const, content: s }]),
    { role: "user", content: he },
  ];
}

/* ---------- Passage au féminin d'une phrase traduite (le traducteur dédié écrit au masculin) ---------- */

const FEM_SHOTS: [string, string][] = [
  ["אני עייף.", "אני עייפה."],
  ["אני מחפש את התחנה.", "אני מחפשת את התחנה."],
  ["איפה השירותים?", "איפה השירותים?"],
  ["אני לא מבין.", "אני לא מבינה."],
  ["אני רוצה קפה, בבקשה.", "אני רוצה קפה, בבקשה."],
  ["אני יכול לשלם בכרטיס?", "אני יכולה לשלם בכרטיס?"],
  ["אתה גר פה?", "אתה גר פה?"],
  ["אני גר בפריז ואני עובד בבנק.", "אני גרה בפריז ואני עובדת בבנק."],
];

/** Met au féminin ce que dit « je » (et seulement ça) : la personne qui parle est une femme. */
export function feminineMessages(he: string): Chat {
  return [
    { role: "system", content: "המשפט נאמר על ידי אישה. שנה ללשון נקבה רק את מה שמתאר את הדוברת (אני). אל תשנה שום דבר אחר. כתוב רק את המשפט." },
    ...FEM_SHOTS.flatMap(([m, f]) => [{ role: "user" as const, content: m }, { role: "assistant" as const, content: f }]),
    { role: "user", content: he },
  ];
}

/* ---------- Relance : une question courte quand la réplique de Shuli n'en a pas ---------- */

/** Une question courte qui prolonge l'échange (même genre que l'apprenant). */
export function followUpMessages(p: Profile, learner: string, reply: string): Chat {
  const f = p.gender === "f";
  const ask = (a: string, b: string) => `${f ? "התלמידה אמרה" : "התלמיד אמר"}: ${a}\nשולי ענה: ${b}\nשאלה:`;
  const shots: [string, string, string][] = [
    ["אני גר בפריז", "פריז יפה מאוד.", f ? "מה את אוהבת לעשות שם?" : "מה אתה אוהב לעשות שם?"],
    ["אני רוצה פיצה", "בסדר, פיצה אחת.", "רוצה גם משהו לשתות?"],
    ["הלכתי לים", "כיף, הים נהדר בקיץ.", "עם מי הלכת?"],
    ["אני עובד בבנק", "עבודה טובה.", f ? "את אוהבת את העבודה?" : "אתה אוהב את העבודה?"],
  ];
  return [
    { role: "system", content: `כתוב שאלה אחת קצרה ופשוטה (עד 6 מילים) שממשיכה את השיחה. ${f ? "פנה אליה בלשון נקבה." : "פנה אליו בלשון זכר."} רק את השאלה.` },
    ...shots.flatMap(([a, b, q]) => [{ role: "user" as const, content: ask(a, b) }, { role: "assistant" as const, content: q }]),
    { role: "user", content: ask(learner, reply) },
  ];
}

/** Garde la question si elle est courte, en hébreu, se termine par « ? » et respecte le genre. */
export function tidyFollowUp(text: string, gender: "m" | "f"): string {
  const q = tidyReply(text.split("\n")[0]).match(/[^.!?]*\?/)?.[0]?.trim() ?? "";
  if (!q || q.split(/\s+/).length > 8 || /[a-zA-Z[\]<>]/.test(q) || !/[א-ת]/.test(q)) return "";
  return replyFlaws(q, gender).includes("genre") ? "" : q;
}

/** Réplique + question de relance, en restant court : au-delà de 16 mots, on ne garde que la première phrase. */
export function withFollowUp(reply: string, question: string): string {
  if (!question) return reply;
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  if (words(reply) + words(question) <= 16) return `${reply} ${question}`;
  const first = reply.match(/^[^.!?]+[.!?]/)?.[0]?.trim() ?? "";
  return first && words(first) + words(question) <= 16 ? `${first} ${question}` : reply;
}
