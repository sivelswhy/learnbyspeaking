import type { Gender, LangCode, Level } from "./languages";

/**
 * Test de niveau : questions écrites à la main, de A1 à B2.
 * Chaque réponse est notée par l'IA (pertinence, grammaire) et par des règles (développement, vocabulaire).
 * L'IA ne donne pas de note libre : on lui pose des questions oui/non et on lit la probabilité du « oui ».
 */
type G = Record<Gender, string>;
const s = (v: string): G => ({ m: v, f: v });

export interface PlacementQuestion {
  level: Level;
  text: G;
  transliteration: G;
  translation: Partial<Record<LangCode, string>>;
  /** Mots qui montrent qu'on a compris la question (racines, sans préfixes). */
  keywords: string[];
  /** Motif de forme attendue (ex. passé en ־תי). */
  pattern?: RegExp;
  sample: { he: G; tr: G; fr: string };
  tip: string;
}

export const PLACEMENT: Partial<Record<LangCode, PlacementQuestion[]>> = {
  he: [
    {
      level: "A1",
      text: s("איך קוראים לך?"),
      transliteration: { m: "Eikh kor'im lekha?", f: "Eikh kor'im lakh?" },
      translation: { fr: "Comment tu t'appelles ?", en: "What's your name?", es: "¿Cómo te llamas?" },
      keywords: ["קוראים", "שמי", "שם"],
      sample: { he: s("קוראים לי דני, נעים מאוד!"), tr: s("Kor'im li Dani, na'im me'od!"), fr: "Je m'appelle Dani, enchanté !" },
      tip: "Commence par « kor'im li » puis ton prénom, et ajoute « na'im me'od » (enchanté).",
    },
    {
      level: "A1",
      text: { m: "מאיפה אתה?", f: "מאיפה את?" },
      transliteration: { m: "Me'eifo ata?", f: "Me'eifo at?" },
      translation: { fr: "Tu viens d'où ?", en: "Where are you from?", es: "¿De dónde eres?" },
      keywords: ["צרפת", "בלגיה", "שוויץ", "קנדה", "פריז", "ליון", "מרסיי", "גר", "גרה"],
      pattern: /^מ[א-ת]{2,}/,
      sample: { he: { m: "אני מצרפת, אני גר בליון.", f: "אני מצרפת, אני גרה בליון." }, tr: { m: "Ani mi-Tsarfat, ani gar be-Lyon.", f: "Ani mi-Tsarfat, ani gara be-Lyon." }, fr: "Je viens de France, j'habite à Lyon." },
      tip: "Colle la lettre מ (de) au pays : מצרפת. Ajoute où tu habites avec גר / גרה.",
    },
    {
      level: "A2",
      text: { m: "מה אתה אוהב לעשות בסוף השבוע?", f: "מה את אוהבת לעשות בסוף השבוע?" },
      transliteration: { m: "Ma ata ohev la'asot be-sof hashavua?", f: "Ma at ohevet la'asot be-sof hashavua?" },
      translation: { fr: "Qu'est-ce que tu aimes faire le week-end ?", en: "What do you like to do at the weekend?", es: "¿Qué te gusta hacer el fin de semana?" },
      keywords: ["אוהב", "אוהבת", "ים", "חברים", "לטייל", "לקרוא", "לבשל", "לישון", "ספורט", "סרט", "משפחה", "לנוח"],
      sample: { he: { m: "אני אוהב ללכת לים ולראות חברים.", f: "אני אוהבת ללכת לים ולראות חברים." }, tr: { m: "Ani ohev lalekhet la-yam ve-lir'ot khaverim.", f: "Ani ohevet lalekhet la-yam ve-lir'ot khaverim." }, fr: "J'aime aller à la plage et voir des amis." },
      tip: "Utilise אוהב / אוהבת + un verbe à l'infinitif (qui commence souvent par ל).",
    },
    {
      level: "A2",
      text: s("מה עשית אתמול?"),
      transliteration: { m: "Ma asita etmol?", f: "Ma asit etmol?" },
      translation: { fr: "Qu'est-ce que tu as fait hier ?", en: "What did you do yesterday?", es: "¿Qué hiciste ayer?" },
      keywords: ["אתמול"],
      pattern: /תי$/,
      sample: { he: s("אתמול עבדתי, ובערב ראיתי סרט עם חברים."), tr: s("Etmol avadti, u-va-erev ra'iti seret im khaverim."), fr: "Hier j'ai travaillé, et le soir j'ai vu un film avec des amis." },
      tip: "Au passé, « je » se termine par ־תי : עבדתי (j'ai travaillé), הלכתי (je suis allé).",
    },
    {
      level: "B1",
      text: { m: "למה אתה לומד עברית?", f: "למה את לומדת עברית?" },
      transliteration: { m: "Lama ata lomed ivrit?", f: "Lama at lomedet ivrit?" },
      translation: { fr: "Pourquoi tu apprends l'hébreu ?", en: "Why are you learning Hebrew?", es: "¿Por qué aprendes hebreo?" },
      keywords: ["כי", "בגלל", "כדי"],
      sample: { he: { m: "אני לומד עברית כי יש לי משפחה בישראל ואני רוצה לדבר איתם.", f: "אני לומדת עברית כי יש לי משפחה בישראל ואני רוצה לדבר איתם." }, tr: { m: "Ani lomed ivrit ki yesh li mishpakha be-Israel ve-ani rotse ledaber itam.", f: "Ani lomedet ivrit ki yesh li mishpakha be-Israel ve-ani rotsa ledaber itam." }, fr: "J'apprends l'hébreu parce que j'ai de la famille en Israël et je veux leur parler." },
      tip: "Donne une raison avec כי (parce que) et développe en deux idées reliées par ו (et).",
    },
    {
      level: "B2",
      text: s("מה היית עושה אם היית זוכה בלוטו?"),
      transliteration: { m: "Ma hayita ose im hayita zokhe ba-loto?", f: "Ma hayit osa im hayit zokha ba-loto?" },
      translation: { fr: "Que ferais-tu si tu gagnais au loto ?", en: "What would you do if you won the lottery?", es: "¿Qué harías si ganaras la lotería?" },
      keywords: ["הייתי"],
      sample: { he: { m: "הייתי קונה דירה ליד הים ונוסע לטייל בעולם עם המשפחה שלי.", f: "הייתי קונה דירה ליד הים ונוסעת לטייל בעולם עם המשפחה שלי." }, tr: { m: "Hayiti kone dira leyad ha-yam ve-nose'a letayel ba-olam im ha-mishpakha sheli.", f: "Hayiti kona dira leyad ha-yam ve-nosa'at letayel ba-olam im ha-mishpakha sheli." }, fr: "J'achèterais un appartement près de la mer et je voyagerais dans le monde avec ma famille." },
      tip: "Le conditionnel se forme avec הייתי + le verbe au présent : הייתי קונה (j'achèterais).",
    },
  ],
};

const ORDER: Level[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TARGET_WORDS: Record<string, number> = { A1: 2, A2: 4, B1: 7, B2: 9, C1: 12, C2: 14 };

const strip = (w: string) => w.replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");
/** Enlève les préfixes collés (ו ה ב ל מ ש כ) pour comparer les racines. */
const unprefix = (w: string) => w.replace(/^(ו|ש)?(ה|ב|ל|מ|כ)?/, "");

export const hebrewWords = (answer: string) => answer.split(/\s+/).map(strip).filter((w) => w.length > 0);

/** La réponse contient-elle un mot ou une forme attendus pour cette question ? */
export function hasKeyword(q: PlacementQuestion, answer: string): boolean {
  // Mot contenu dans un autre seulement à partir de 3 lettres : sinon « ים » (mer) se trouve dans « קוראים ».
  return hebrewWords(answer).some((w) => q.keywords.some((k) => w === k || unprefix(w) === k || (k.length >= 3 && w.includes(k))) || (q.pattern?.test(w) ?? false));
}

/** Avis de l'IA (DictaLM) sur une réponse. */
export interface AiJudgement {
  /** Probabilité (0-1) que la réponse réponde à la question. */
  relevance: number;
  /** Probabilité (0-1) que la phrase soit grammaticalement correcte. */
  grammar: number;
  /** La phrase corrigée par l'IA (identique si elle ne voit pas de faute). */
  correction: string;
}

/**
 * Part (0-1) des mots de la réponse que la correction garde tels quels, dans l'ordre (plus longue sous-suite commune).
 * Les mots ajoutés ne comptent pas : le modèle 4 bits ajoute parfois une formule (« נעים מאוד ») à une phrase juste.
 */
export function keptRatio(answer: string, correction: string): number {
  const x = hebrewWords(answer);
  const y = hebrewWords(correction);
  if (!x.length) return 1;
  const d: number[][] = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++) d[i][j] = x[i - 1] === y[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  return d[x.length][y.length] / x.length;
}

export interface AnswerScore {
  score: number;
  /** true : noté avec l'IA ; false : règles seules (modèle indisponible). */
  ai: boolean;
  relevance: number;
  grammar: number | null;
  development: number;
  vocabulary: number;
  /** Nombre de mots en hébreu (sert aux conseils, n'est pas affiché comme tel). */
  words: number;
  /** Correction proposée par l'IA, si elle diffère de la réponse et reste proche (sinon on ne s'y fie pas). */
  correction?: string;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * Score d'une réponse (0-100).
 * Avec l'IA : 35 % pertinence, 45 % grammaire, 10 % développement, 10 % variété.
 * Réglages mesurés sur 90 réponses étiquetées (justes, avec fautes, hors sujet) : les réponses hors sujet
 * ont une probabilité de pertinence ≈ 0, les pertinentes > 0,25 ; la grammaire (probabilité + correction)
 * classe juste 92 % des phrases. Résultat : 92 % des réponses justes à 75 ou plus, 88 % des réponses
 * avec faute sous 75, toutes les réponses hors sujet à 25 ou moins.
 * Sans l'IA : pertinence par mots-clés uniquement, et la grammaire n'est pas notée.
 */
export function scoreAnswer(q: PlacementQuestion, answer: string, ai?: AiJudgement | null): AnswerScore {
  const words = hebrewWords(answer);
  if (!words.length) return { score: 0, ai: !!ai, relevance: 0, grammar: ai ? 0 : null, development: 0, vocabulary: 0, words: 0 };
  const target = TARGET_WORDS[q.level];
  const development = clamp((words.length / target) * 100);
  const vocabulary = clamp((new Set(words).size / (target * 0.8)) * 100);
  const hit = hasKeyword(q, answer);
  if (!ai) {
    const relevance = hit ? 100 : 0;
    const raw = development * 0.35 + vocabulary * 0.25;
    const score = hit ? Math.round(raw + 40) : Math.min(30, Math.round(raw / 2));
    return { score, ai: false, relevance, grammar: null, development, vocabulary, words: words.length };
  }
  const { relevance, grammar, correction } = readJudgement(answer, ai);
  let score = Math.round(relevance * 0.35 + grammar * 0.45 + development * 0.1 + vocabulary * 0.1);
  // Une réponse à côté de la question ne montre pas qu'on l'a comprise.
  if (relevance < 30) score = Math.min(score, 25);
  return { score, ai: true, relevance, grammar, development, vocabulary, words: words.length, correction };
}

/** Deux mots de même famille : l'un contient l'autre, ou même début (sans les préfixes ו ה ב ל מ ש כ). */
const related = (a: string, b: string) => {
  const x = a.replace(/^[והבלמשכ]{1,2}(?=.{2})/, "");
  const y = b.replace(/^[והבלמשכ]{1,2}(?=.{2})/, "");
  return a.includes(b) || b.includes(a) || x.includes(y) || y.includes(x) || (x.length >= 3 && y.length >= 3 && x.slice(0, 2) === y.slice(0, 2));
};

/** La correction ne fait que remplacer des mots par d'autres mots (aucune autre forme d'un mot de l'apprenant) ? */
export function rewordedOnly(answer: string, correction: string): boolean {
  const a = hebrewWords(answer);
  const c = hebrewWords(correction);
  const changed = a.filter((w) => !c.includes(w));
  const added = c.filter((w) => !a.includes(w));
  return changed.length > 0 && changed.every((w) => !added.some((x) => related(w, x)));
}

/** Avis de l'IA → pertinence et grammaire sur 100, et correction à montrer (si elle est fiable). */
export function readJudgement(answer: string, ai: AiJudgement): { relevance: number; grammar: number; correction?: string } {
  // Hors sujet : ≤ 0,01. Pertinent, même avec des fautes : souvent > 0,5, au pire ≈ 0,04 (modèle 4 bits).
  // Échelle logarithmique : 0,01 → 0, 0,5 → 100.
  const relevance = clamp(((Math.log10(Math.max(ai.relevance, 1e-4)) + 2) / (2 + Math.log10(0.5))) * 100);
  // Phrase que l'IA ne corrige pas = bon signe ; on y ajoute sa probabilité « correcte ».
  // Mesuré : phrases justes ≈ 0,85-0,98, avec faute ≈ 0,35-0,75. On étale 0,6 → 0 et 0,95 → 100.
  // Un mot remplacé par un autre mot (טוב → נהדר) est une question de style, pas une faute,
  // sauf si l'IA juge aussi la phrase incorrecte. Une autre forme du même mot (אוהבים → אוהבת) en est une.
  const styleOnly = rewordedOnly(answer, ai.correction) && ai.grammar >= 0.5;
  const kept = styleOnly ? 1 : keptRatio(answer, ai.correction);
  const grammar = clamp(((0.3 * ai.grammar + 0.7 * kept - 0.6) / 0.35) * 100);
  // Correction montrée seulement si elle change peu de mots et n'ajoute presque rien (sinon on ne s'y fie pas).
  const correction = kept < 1 && kept >= 0.5 && hebrewWords(ai.correction).length <= hebrewWords(answer).length + 1 ? ai.correction.trim() : undefined;
  return { relevance, grammar, correction };
}

/** Le plus haut niveau dont les questions sont réussies (≥ 55/100), à condition que les niveaux en dessous le soient aussi. */
export function estimateLevel(qs: PlacementQuestion[], scores: number[]): Level {
  let level: Level = "A1";
  for (const lv of ORDER) {
    const sc = qs.map((q, i) => (q.level === lv ? scores[i] ?? 0 : null)).filter((x): x is number => x !== null);
    if (!sc.length) continue;
    if (sc.reduce((a, b) => a + b, 0) / sc.length >= 55 && Math.min(...sc) >= 30) level = lv;
    else break;
  }
  return level; // 6 questions ne permettent pas de distinguer au-delà de B2
}

export const SCORING_EXPLANATION =
  "Chaque réponse est notée par l'IA (DictaLM, sur ton appareil) et par des règles : 35 % pertinence (l'IA juge si tu réponds à la question, sans tenir compte des fautes), 45 % grammaire (l'IA juge si la phrase est correcte et propose une correction), 10 % développement (réponse assez fournie pour le niveau), 10 % variété du vocabulaire. Une réponse à côté de la question est plafonnée à 25. Ton niveau est le plus haut dont tu réussis les questions (55/100 en moyenne, aucune sous 30). L'IA peut se tromper, surtout sur la grammaire ; la prononciation n'est pas notée.";

export const SCORING_EXPLANATION_NO_AI =
  "Notation par règles seulement, sans IA : 35 % développement, 25 % variété du vocabulaire, 40 % pertinence (présence des mots ou formes attendus). Une réponse sans les mots attendus est plafonnée à 30. La grammaire et la prononciation ne sont pas notées.";

/* ---------- Questions posées à l'IA (en hébreu, avec exemples : DictaLM s'en sort mieux ainsi) ---------- */

type M = { role: "system" | "user" | "assistant"; content: string };
const ex = (u: string, a: string): M[] => [{ role: "user", content: u }, { role: "assistant", content: a }];

const RELEVANCE_EXAMPLES: [string, string, boolean][] = [
  ["מה השעה?", "אני גר בחיפה", false],
  ["מה השעה?", "עכשיו שלוש", true],
  ["איפה אתה עובד?", "אני עובדים בבנק", true],
  ["איפה אתה עובד?", "אני אוהב שוקולד", false],
  ["מה אכלת היום?", "אני אוכל סלט", true],
  ["מה אכלת היום?", "קוראים לי משה", false],
  ["כמה ילדים יש לך?", "שניים", true],
  ["כמה ילדים יש לך?", "היום יום ראשון", false],
];

/** « La réponse répond-elle à la question ? » — en ignorant les fautes (exemples fautifs mais pertinents). */
export function relevancePrompt(question: string, answer: string): M[] {
  const ask = (q: string, a: string) => `שאלה: ${q}\nתשובה: ${a}\nהאם התשובה עונה על השאלה?`;
  return [
    { role: "system", content: 'אתה בודק תשובות של תלמיד שלומד עברית. אל תתייחס לטעויות דקדוק: בודקים רק אם התשובה מתאימה לשאלה. ענה רק "כן" או "לא".' },
    ...RELEVANCE_EXAMPLES.flatMap(([q, a, ok]) => ex(ask(q, a), ok ? "כן" : "לא")),
    { role: "user", content: ask(question, answer) },
  ];
}

const GRAMMAR_EXAMPLES: [string, boolean][] = [
  ["אני הולכים לבית ספר", false],
  ["אני הולך לבית הספר", true],
  ["אתמול אני אוכל פיצה", false],
  ["אתמול אכלתי פיצה", true],
  ["אני מישראל, אני גרה בחיפה", true],
  ["היא אוהב לשחות", false],
  ["כי אני אוהב את השפה", true],
  ["אני רוצה ללכת בים", false],
];

const CORRECTION_EXAMPLES: [string, string][] = [
  ["אני הולכים לבית ספר", "אני הולך לבית ספר"],
  ["אתמול אכלתי פיצה", "אתמול אכלתי פיצה"],
  ["היא אוהב לשחות", "היא אוהבת לשחות"],
  ["אני גרה בחיפה", "אני גרה בחיפה"],
  ["מחר אני נסעתי לעבודה", "מחר אני אסע לעבודה"],
  ["כי אני אוהב את השפה", "כי אני אוהב את השפה"],
  ["אני רוצה אוכל פיצה", "אני רוצה לאכול פיצה"],
  ["הייתי קונה מכונית", "הייתי קונה מכונית"],
  ["לבד", "לבד"],
  ["קוראים לי רון, נעים מאוד", "קוראים לי רון, נעים מאוד"],
];

/** L'IA réécrit la phrase corrigée (ou la recopie si elle est juste). */
export function correctionPrompt(answer: string): M[] {
  return [
    { role: "system", content: "תקן את טעויות הדקדוק במשפט. אם אין טעות, כתוב את המשפט בדיוק כמו שהוא. כתוב רק את המשפט." },
    ...CORRECTION_EXAMPLES.flatMap(([a, b]) => ex(a, b)),
    { role: "user", content: answer },
  ];
}

/** Deux formulations opposées (« est-ce correct ? » / « y a-t-il une faute ? ») : on fait la moyenne, plus stable. */
export function grammarPrompts(answer: string): { correct: M[]; mistake: M[] } {
  const isOk = (s: string) => `משפט: ${s}\nהאם המשפט נכון דקדוקית?`;
  const hasErr = (s: string) => `משפט: ${s}\nהאם יש במשפט טעות דקדוקית?`;
  return {
    correct: [
      { role: "system", content: 'אתה מורה לעברית. בודקים רק דקדוק: נטיית פעלים, התאמה במין ובמספר, זמן הפועל ומילות יחס. ענה רק "כן" או "לא".' },
      ...GRAMMAR_EXAMPLES.flatMap(([s, ok]) => ex(isOk(s), ok ? "כן" : "לא")),
      { role: "user", content: isOk(answer) },
    ],
    mistake: [
      { role: "system", content: 'אתה מורה לעברית. ענה רק "כן" או "לא".' },
      ...GRAMMAR_EXAMPLES.flatMap(([s, ok]) => ex(hasErr(s), ok ? "לא" : "כן")),
      { role: "user", content: hasErr(answer) },
    ],
  };
}
