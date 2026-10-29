import type { Gender, LangCode, Level } from "./languages";

/**
 * Test de niveau : questions écrites à la main, de A1 à B2.
 * La note est calculée sans IA, par des règles simples et affichées à l'utilisateur
 * (les petits modèles locaux notent de façon trop aléatoire).
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

export interface AnswerScore {
  score: number;
  words: number;
  answered: number;
  length: number;
  vocabulary: number;
  relevance: number;
}

export function scoreAnswer(q: PlacementQuestion, answer: string): AnswerScore {
  const words = answer.split(/\s+/).map(strip).filter((w) => w.length > 0);
  if (!words.length) return { score: 0, words: 0, answered: 0, length: 0, vocabulary: 0, relevance: 0 };
  const target = TARGET_WORDS[q.level];
  const length = Math.min(100, Math.round((words.length / target) * 100));
  const vocabulary = Math.min(100, Math.round((new Set(words).size / (target * 0.8)) * 100));
  const hit = words.some((w) => q.keywords.some((k) => w === k || unprefix(w) === k || w.includes(k)) || (q.pattern?.test(w) ?? false));
  const relevance = hit ? 100 : 0;
  // Sans mot ou forme attendus, la réponse ne montre pas qu'on a compris : plafonnée à 30.
  const score = hit ? Math.round(length * 0.35 + vocabulary * 0.25 + 40) : Math.min(30, Math.round((length * 0.35 + vocabulary * 0.25) / 2));
  return { score, words: words.length, answered: 100, length, vocabulary, relevance };
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
  "Le score de chaque réponse est calculé sans IA : 35 % longueur (nombre de mots en hébreu par rapport à ce qu'on attend à ce niveau), 25 % variété du vocabulaire, 40 % pertinence (présence des mots ou formes attendus). Une réponse sans les mots attendus est plafonnée à 30. Ton niveau est le plus haut niveau dont tu réussis les questions (55/100 en moyenne, aucune sous 30). La prononciation n'est pas notée.";
