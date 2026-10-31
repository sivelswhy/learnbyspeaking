"use client";
import { grammarLine, loadDict, lookupFrench, lookupHebrew, type Dict } from "./dictionary";
import { complete, type LlmSettings, type Msg } from "./llm";
import { exampleMessages, translateMessages, wordMessages } from "./prompts";
import { canTranslate, canTranslateToHebrew, translateHebrew, translateToHebrew } from "./translate";
import type { Profile } from "./types";

const HEBREW = /[֐-׿]/;

/** « que veut dire hôpital ? » → « hôpital ». */
export function wordOf(q: string): string {
  return q
    .replace(/^\s*(que veut dire|ça veut dire quoi|c'est quoi|définition de|définis|définir|traduis|traduire|le mot)\s*/i, "")
    .replace(/[«»"“”?!.:]/g, "")
    .trim();
}

/** Minuscules, sans accents, sans article ni ponctuation : « L'Hôpital » → « hopital ». */
export function plain(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\b(l'|d'|le|la|les|un|une|des|du|de)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le texte français contient-il le mot (ou sa racine : « travaille » pour « travailler ») ? */
export function mentions(text: string, word: string): boolean {
  const w = plain(word);
  if (!w) return false;
  const stem = w.length > 5 ? w.slice(0, Math.max(5, w.length - 2)) : w;
  return plain(text).split(" ").some((t) => t === w || t.startsWith(stem) || (t.length >= 4 && w.startsWith(t)));
}

/** Candidats hébreux d'une sortie : « עוף/ציפור », « לגימה, לשתות. (boire) » → mots séparés. */
export function candidates(raw: string): string[] {
  return raw
    .replace(/\([^)]*\)/g, "")
    .split(/[,/;]|\s[-–]\s/)
    .map((s) => s.replace(/[^א-ת\s'"״׳-]/g, "").replace(/\s+/g, " ").trim())
    .filter((s) => HEBREW.test(s));
}

/**
 * Le mot (ou l'expression) hébreu figure-t-il dans la phrase ?
 * Tolère un préfixe collé (ו ה ב ל מ ש כ, deux au plus) et une fin différente (pluriel, féminin : ספר → ספרים).
 */
export function containsWord(sentence: string, he: string): boolean {
  const tokens = sentence.replace(/[^\u05d0-\u05ea\s]/g, " ").split(/\s+/).filter(Boolean);
  const words = he.replace(/[^\u05d0-\u05ea\s]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const stem = (w: string) => (w.length > 3 ? w.replace(/[הםןת]$/, "") : w);
  const match = (t: string, w: string) => {
    for (let k = 0; k <= 2 && k < t.length; k++) {
      if (k && !/^[והבלמשכ]+$/.test(t.slice(0, k))) break;
      if (t.slice(k).startsWith(stem(w))) return true;
    }
    return false;
  };
  return tokens.some((_, i) => words.every((w, j) => tokens[i + j] !== undefined && match(tokens[i + j], w)));
}

export interface Definition {
  he: string;
  /** Avec voyelles (nikud), si le dictionnaire le donne. */
  nikud?: string;
  transliteration?: string;
  meaning: string;
  grammar?: string;
  /** Autres traductions possibles. */
  others?: string[];
  example?: { he: string; tr: string };
  /** Mot non trouvé dans le dictionnaire et non confirmé par la retraduction. */
  doubt?: string;
  /** Réponse tirée du Wiktionnaire (licence CC BY-SA : on cite la source). */
  fromDictionary?: boolean;
}

/** Pour les tests : autre modèle, autre traducteur, autre dictionnaire que ceux de l'app. */
export interface DefineIO {
  ask?: (messages: Msg[], temperature: number, maxTokens: number) => Promise<string>;
  toNative?: (he: string) => Promise<string>;
  toHebrew?: (text: string) => Promise<string>;
  dict?: Dict | null;
}

/**
 * « Définir un mot ».
 * 1. Dictionnaire (Wiktionnaire) : mot, nikud, prononciation, genre, pluriel.
 * 2. À défaut, traducteur dédié (opus-mt) ; 3. en dernier recours, DictaLM, vérifié par retraduction.
 * Puis une phrase d'exemple (DictaLM, qui doit contenir le mot) traduite par le traducteur dédié.
 */
export async function defineWord(llm: LlmSettings, p: Profile, input: string, io: DefineIO = {}): Promise<Definition> {
  const word = wordOf(input);
  const ask = io.ask ?? ((messages, temperature, maxTokens) => complete(llm, { messages, temperature, maxTokens }));
  const dict = io.dict !== undefined ? io.dict : await loadDict();
  const mtFrom = !!io.toNative || canTranslate(p.target, p.native);
  const mtTo = !!io.toHebrew || canTranslateToHebrew(p.native);
  const toNative = async (he: string) =>
    io.toNative
      ? io.toNative(he)
      : mtFrom
        ? translateHebrew(he, p.native).catch(() => "")
        : (await ask(translateMessages(p, he), 0.1, 60)).split("\n")[0];
  const toHebrew = async (text: string) => (io.toHebrew ? io.toHebrew(text) : mtTo ? translateToHebrew(text, p.native).catch(() => "") : "");

  const d: Definition = { he: word, meaning: "" };
  const fill = (he: string) => {
    const info = dict ? lookupHebrew(dict, he) : null;
    if (!info) return;
    d.nikud = info[0] || undefined;
    d.transliteration = info[1] || undefined;
    d.grammar = grammarLine(info[4], info[2], info[3]) || undefined;
    d.fromDictionary = true;
  };

  if (HEBREW.test(word)) {
    const info = dict ? lookupHebrew(dict, word) : null;
    // Sens sans doublons (« Hôpital ; hôpital ») ni majuscule initiale.
    const senses = [...new Map((info?.[5] ?? []).map((x) => [x.toLowerCase(), x[0].toLowerCase() + x.slice(1)])).values()].sort((a, b) => a.length - b.length);
    d.meaning = senses.slice(0, 3).join(" ; ") || (await toNative(word));
    fill(word);
  } else {
    const found = dict && p.native === "fr" ? lookupFrench(dict, word) : null;
    d.meaning = found?.key ?? word;
    let first = found?.entries[0];
    let fromMt = "";
    // Verbe français (manger, dormir…) : le dictionnaire donne parfois une forme conjuguée (אוכל) ou un adjectif (ישן).
    // « Je veux manger » → « אני רוצה לאכול » : le mot après « רוצה » est l'infinitif.
    if (p.native === "fr" && /(er|ir|re|oir)$/.test(word.trim()) && !word.includes(" ") && !first?.[0].startsWith("ל")) {
      const inf = (await toHebrew(`Je veux ${word.trim()}.`)).match(/רוצה\s+(ל[\u05d0-\u05ea]+)/)?.[1];
      if (inf) {
        first = undefined;
        fromMt = inf;
      }
    }
    if (first) {
      d.he = first[0];
      d.nikud = first[1] || undefined;
      d.transliteration = first[2] || undefined;
      d.grammar = grammarLine(first[5], first[3], first[4]) || undefined;
      d.others = found!.entries.slice(1).map((e) => e[0]);
      d.fromDictionary = true;
    } else {
      // Pas dans le dictionnaire : traducteur dédié, sinon DictaLM vérifié par retraduction.
      d.he = fromMt || candidates(await toHebrew(word))[0] || "";
      if (!d.he) {
        const cands = candidates((await ask(wordMessages(word), 0, 16)).split("\n")[0]);
        d.he = cands[0] ?? word;
        const backs: string[] = [];
        if (mtFrom) {
          for (const c of cands) {
            const back = await toNative(c);
            if (mentions(back, word)) {
              d.he = c;
              backs.length = 0;
              break;
            }
            backs.push(back);
          }
        }
        if (backs.length) d.doubt = backs[0];
      }
      fill(d.he);
    }
  }

  // Exemple : il doit contenir le mot, et sa traduction aussi (sinon le modèle a changé de sens) ; deux essais au plus.
  const frWord = HEBREW.test(word) ? "" : d.meaning;
  for (const temperature of [0, 0.7]) {
    const s = (await ask(exampleMessages(d.he), temperature, 30)).split("\n")[0].trim();
    if (!HEBREW.test(s) || !containsWord(s, d.he)) continue;
    const tr = await toNative(s);
    if (frWord && !mentions(tr, frWord)) continue;
    d.example = { he: s, tr };
    break;
  }
  // Mot douteux mais confirmé par la traduction de l'exemple : plus de doute.
  if (d.doubt && d.example && mentions(d.example.tr, word)) d.doubt = undefined;
  return d;
}

/** Mise en forme pour la bulle de ToolChat (une ligne en hébreu = bouton « écouter » ; « (…) » = ligne discrète). */
export function formatDefinition(d: Definition): string {
  const lines = [d.nikud || d.he];
  if (d.transliteration) lines.push(`(${d.transliteration})`);
  lines.push(`Sens : ${d.meaning}`);
  if (d.grammar) lines.push(d.grammar);
  if (d.others?.length) lines.push("Aussi :", ...d.others);
  if (d.example) lines.push("Exemple :", d.example.he, d.example.tr);
  if (d.doubt) lines.push(`⚠ Le traducteur relit ce mot comme « ${d.doubt} » : vérifie-le dans un dictionnaire.`);
  if (d.fromDictionary) lines.push("(Source : Wiktionnaire, licence CC BY-SA)");
  return lines.join("\n");
}
