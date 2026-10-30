/**
 * Hébreu vocalisé → phonèmes IPA, pour la voix Piper.
 * Portage TypeScript des règles de Phonikud (github.com/thewh1teagle/phonikud, CC BY 4.0) :
 * lexicon.py, utils.py, syllables.py, hebrew.py, phonemize.py et le dictionnaire.
 * Les noms et l'ordre des étapes suivent l'original pour faciliter la comparaison.
 */

// Diacritiques non standard ajoutés par le modèle de vocalisation
const VOCAL_SHVA = "ֽ"; // Meteg
const HATAMA = "֫"; // Ole : accent tonique
const PREFIX = "|";
const NIKUD_HASER = "֯"; // Masora
const ENHANCED = new Set([HATAMA, PREFIX, VOCAL_SHVA]);

const HE_PATTERN = /[ְ-תֽ֫|֯'"]+/g;
const HE_NIKUD_PATTERN = /[ְ-ׇֽ֫|֯']/g;
const PUNCTUATION = new Set([".", ",", "!", "?", " "]);
const STRESS = "ˈ";

const MODERN_SCHEMA: [RegExp, string][] = [[/x/g, "χ"], [/r/g, "ʁ"], [/g/g, "ɡ"]];
const GERESH_PHONEMES: Record<string, string> = { "ג": "dʒ", "ז": "ʒ", "ת": "ta", "צ": "tʃ", "ץ": "tʃ" };
const LETTERS_PHONEMES: Record<string, string> = {
  "א": "ʔ", "ב": "v", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z", "ח": "x", "ט": "t", "י": "j",
  "ך": "x", "כ": "x", "ל": "l", "ם": "m", "מ": "m", "ן": "n", "נ": "n", "ס": "s", "ע": "ʔ", "פ": "f",
  "ף": "f", "ץ": "ts", "צ": "ts", "ק": "k", "ר": "r", "ש": "ʃ", "ת": "t",
  "בּ": "b", "כּ": "k", "פּ": "p", "שׁ": "ʃ", "שׂ": "s", "'": "",
};
const NIKUD_PHONEMES: Record<string, string> = {
  "ִ": "i", "ֱ": "e", "ֵ": "e", "ֶ": "e", "ֲ": "a", "ַ": "a", "ׇ": "o",
  "ֹ": "o", "ֺ": "o", "ֻ": "u", "ֳ": "o", "ָ": "a", [HATAMA]: STRESS, [VOCAL_SHVA]: "e",
};
/** Caractères gardés en sortie (l'original teste l'appartenance caractère par caractère). */
const SET_PHONEMES = new Set([
  ...Object.values(NIKUD_PHONEMES), ...Object.values(LETTERS_PHONEMES), ...Object.values(GERESH_PHONEMES), "χ", "ʁ", "ɡ", "w",
]);

const SHVA = "ְ", SIN = "ׂ", PATAH = "ַ", KAMATZ = "ָ", HATAF_KAMATZ = "ֳ", DAGESH = "ּ";
const HOLAM = "ֹ", HIRIK = "ִ", KUBUTS = "ֻ", TSERE = "ֵ", SEGOL = "ֶ";

/* ---------- utils.py ---------- */

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/(\p{L})(\p{M}+)/gu, (_, l: string, m: string) => l + [...m].sort().join(""))
    .replace(/״/g, '"')
    .replace(/׳/g, "'")
    .replace(/׳/g, "'")
    .replace(/־/g, "-");
}

export function removeNikud(text: string) {
  return text.replace(HE_NIKUD_PATTERN, "");
}

class Letter {
  char: string;
  allDiac: string;
  constructor(char: string, diac: string) {
    this.char = normalize(char);
    this.allDiac = normalize(diac);
  }
  /** Diacritiques sans les marques ajoutées (accent, shva mobile, préfixe). */
  get diac() {
    return [...this.allDiac].filter((c) => !ENHANCED.has(c)).join("");
  }
  toString() {
    return this.char + this.allDiac;
  }
}

function getLetters(word: string): Letter[] {
  return [...word.matchAll(/(\p{L})([\p{M}'|]*)/gu)].map((m) => new Letter(m[1], m[2]));
}

function sortStress(phonemes: string[]): string[] {
  const joined = phonemes.join("");
  if (!joined.includes(STRESS) || !/[aeiou]/.test(joined)) return phonemes;
  const ps = phonemes.filter((p) => p !== STRESS);
  for (let i = 0; i < ps.length; i++) {
    const j = ps[i].search(/[aeiou]/);
    if (j >= 0) {
      ps[i] = ps[i].slice(0, j) + STRESS + ps[i].slice(j);
      return ps;
    }
  }
  return ps;
}

function sortHatama(letters: Letter[]): Letter[] {
  for (let i = 0; i < letters.length - 1; i++) {
    const d = letters[i].allDiac;
    if (d.includes(HATAMA) && d.includes(NIKUD_HASER)) {
      letters[i].allDiac = d.replace(HATAMA, "");
      letters[i + 1].allDiac += HATAMA;
    }
  }
  return letters;
}

function postNormalize(phonemes: string) {
  return phonemes
    .split(" ")
    .map((w) => w.replace(/ʔ$/, "").replace(/h$/, "").replace(/ˈh$/, "").replace(/ij$/, "i"))
    .join(" ");
}

function postClean(phonemes: string) {
  let out = "";
  for (const c of phonemes) {
    if (c === "-") out += " ";
    else if (SET_PHONEMES.has(c) || PUNCTUATION.has(c)) out += c;
  }
  return out;
}

/* ---------- syllables.py ---------- */

const VOWEL_DIACS = new Set([
  ...Array.from({ length: 0x05bc - 0x05b1 }, (_, k) => String.fromCharCode(0x05b1 + k)), "ׇ", "ֽ",
]);

function hasVowelDiacs(s: string) {
  return s === "וּ" || [...s].some((c) => VOWEL_DIACS.has(c));
}

function getSyllables(word: string): string[] {
  const letters = getLetters(word);
  const syllables: string[] = [];
  let cur = "";
  let vowelState = false;
  let i = 0;
  while (i < letters.length) {
    const letter = letters[i];
    const hasVowel = hasVowelDiacs(letter.toString()) || (i === 0 && letter.allDiac.includes(SHVA));
    const vav1 = i + 2 < letters.length && letters[i + 2].char === "ו";
    const vav2 = i + 3 < letters.length && letters[i + 3].char === "ו";
    if (hasVowel) {
      if (vowelState) {
        syllables.push(cur);
        cur = letter.toString();
      } else cur += letter.toString();
      vowelState = true;
    } else cur += letter.toString();
    i++;
    if (vav1 && vav2) {
      if (cur) {
        syllables.push(cur + letters[i].toString());
        cur = "";
      }
      cur = letters[i + 1].toString() + letters[i + 2].toString();
      i += 3;
      vowelState = true;
    } else if (vav1 && letters[i + 1].diac) {
      if (cur) {
        syllables.push(cur);
        cur = "";
      }
      vowelState = false;
    }
  }
  if (cur) syllables.push(cur);
  return syllables;
}

/** Sans accent prédit : accent sur la dernière syllabe (milra), le cas le plus courant. */
function addMilraHatama(word: string) {
  const syllables = getSyllables(word);
  if (!syllables.length) return word;
  const k = syllables.length - 1;
  const letters = getLetters(syllables[k]);
  letters[0].allDiac += HATAMA;
  syllables[k] = letters.join("");
  return syllables.join("");
}

/* ---------- hebrew.py ---------- */

function handleYud(cur: Letter, prev?: Letter, next?: Letter) {
  return !!next && !cur.diac && !!prev && prev.char + prev.diac !== "אֵ" && !(next.char === "ו" && next.diac && !next.diac.includes(SHVA));
}

function handleVav(cur: Letter, prev?: Letter, next?: Letter): [string[], boolean, boolean, number] {
  if (prev && prev.diac.includes(SHVA) && cur.diac.includes(HOLAM)) return [["vo"], true, true, 0];
  if (next && next.char === "ו") {
    const diac = cur.diac + next.diac;
    if (diac.includes(HOLAM)) return [["vo"], true, true, 1];
    if (cur.diac === next.diac) return [["vu"], true, true, 1];
    if (cur.diac.includes(HIRIK)) return [["vi"], true, true, 0];
    if (cur.diac.includes(SHVA) && !next.diac) return [["v"], true, true, 0];
    if (cur.diac.includes(KAMATZ) || cur.diac.includes(PATAH)) return [["va"], true, true, 0];
    if (cur.diac.includes(TSERE) || cur.diac.includes(SEGOL)) return [["ve"], true, true, 0];
    return [[], false, false, 0];
  }
  if (/[ַ-ָ]/.test(cur.diac)) return [["va"], true, true, 0];
  if (cur.diac.includes(TSERE) || cur.diac.includes(SEGOL)) return [["ve"], true, true, 0];
  if (cur.diac.includes(HOLAM)) return [["o"], true, true, 0];
  if (cur.diac.includes(KUBUTS) || cur.diac.includes(DAGESH)) return [["u"], true, true, 0];
  if (cur.diac.includes(SHVA) && !prev) return [["ve"], true, true, 0];
  if (cur.diac.includes(HIRIK)) return [["vi"], true, true, 0];
  if (next && !cur.diac) return [[], true, true, 0];
  return [["v"], true, true, 0];
}

function letterToPhonemes(cur: Letter, prev?: Letter, next?: Letter): [string[], number] {
  let out: string[] = [];
  let skipDiacritics = false;
  let skipConsonants = false;
  let skipOffset = 0;

  if (cur.allDiac.includes(NIKUD_HASER)) {
    skipConsonants = true;
    skipDiacritics = true;
  } else if (cur.char === "א" && !cur.diac && prev) {
    if (next && next.char !== "ו") skipConsonants = true;
  } else if (cur.char === "י" && handleYud(cur, prev, next)) {
    skipConsonants = true;
  } else if (cur.char === "ש" && cur.diac.includes(SIN)) {
    if (next && next.char === "ש" && !next.diac && /[ַָ]/.test(cur.diac)) {
      out.push("sa"); // יששכר
      skipConsonants = true;
      skipDiacritics = true;
      skipOffset += 1;
    } else {
      out.push("s");
      skipConsonants = true;
    }
  } else if (cur.char === "ש" && !cur.diac && prev && prev.diac.includes(SIN)) {
    out.push("s");
    skipConsonants = true;
  } else if (!next && cur.char === "ח" && cur.diac.includes(PATAH)) {
    out.push("ax"); // patah furtif
    skipDiacritics = true;
    skipConsonants = true;
  } else if (!next && cur.char === "ה" && cur.diac.includes(PATAH)) {
    out.push("ah");
    skipDiacritics = true;
    skipConsonants = true;
  } else if (!next && cur.char === "ע" && cur.diac.includes(PATAH)) {
    out.push("a");
    skipDiacritics = true;
    skipConsonants = true;
  }

  if (cur.diac.includes("'") && cur.char in GERESH_PHONEMES) {
    out.push(GERESH_PHONEMES[cur.char]);
    skipConsonants = true;
    if (cur.char === "ת") skipDiacritics = true;
  } else if (cur.diac.includes(DAGESH) && cur.char + DAGESH in LETTERS_PHONEMES) {
    out.push(LETTERS_PHONEMES[cur.char + DAGESH]);
    skipConsonants = true;
  } else if (cur.char === "ו" && !cur.allDiac.includes(NIKUD_HASER)) {
    const [ps, sc, sd, so] = handleVav(cur, prev, next);
    out.push(...ps);
    skipConsonants = sc;
    skipDiacritics = sd;
    skipOffset += so;
  }

  if (!skipConsonants) out.push(LETTERS_PHONEMES[cur.char] ?? "");
  if (cur.diac.includes(KAMATZ) && next && next.diac.includes(HATAF_KAMATZ)) {
    out.push("o");
    skipDiacritics = true;
  }
  if (!skipDiacritics) out.push(...[...cur.allDiac].map((n) => NIKUD_PHONEMES[n] ?? ""));
  else if (cur.allDiac.includes(HATAMA)) out.push(STRESS);

  out = sortStress(out).filter((p) => p && [...p].every((c) => SET_PHONEMES.has(c)));
  return [out, skipOffset];
}

function phonemizeHebrew(letters: Letter[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < letters.length) {
    const [ps, skip] = letterToPhonemes(letters[i], letters[i - 1], letters[i + 1]);
    out.push(...ps);
    i += skip + 1;
  }
  return out;
}

/* ---------- dictionnaire (expander/dictionary.py, data/*.json) ---------- */

const DICT: Record<string, string> = Object.fromEntries(
  Object.entries({
    "וַאלְלָה": "wˈala", "וַסַבִּי": "wasˈabi", "פינגוין": "pinguwˈin", "וואצאפ": "wˈatsʔap", "וואטסאפ": "wˈatsʔap",
    "יאללה": "jˈala", "וולטר": "wˈolter", "₪": "ʃˈekel", "$": "dˈolar", "%": "axˈuz", "צה״ל": "tsˈahal",
  }).map(([k, v]) => [normalize(k), v]),
);

function expandDictionary(text: string) {
  return text.replace(/\S+/g, (raw) => {
    if (/^\p{N}+$/u.test(raw)) return raw;
    if (DICT[raw]) return DICT[raw];
    return raw.replace(HE_PATTERN, (src) => {
      const s = src.normalize("NFD");
      return DICT[s] || DICT[removeNikud(s)] || DICT[normalize(s)] || s;
    });
  });
}

/* ---------- phonemize.py ---------- */

export function phonemize(text: string): string {
  // Comme l'expander d'origine : mots séparés par une seule espace (les retours à la ligne disparaissent).
  text = expandDictionary(normalize(text).split(/\s+/).filter(Boolean).join(" "));
  // La prédiction du shva mobile (mark_vocal_shva) est sans effet dans l'original : son résultat n'est pas utilisé.
  text = text.replace(HE_PATTERN, (word, offset: number, whole: string) => {
    if (offset > 0 && whole[offset - 1] === "[") return word;
    if (!word.includes(HATAMA)) word = addMilraHatama(word);
    let ph = postNormalize(phonemizeHebrew(sortHatama(getLetters(word))).join(""));
    for (const [k, v] of MODERN_SCHEMA) ph = ph.replace(k, v);
    return ph;
  });
  text = text.replace(/\[(.+?)\]\(\/(.+?)\/\)/g, (_, _w, p: string) => p);
  return postClean(text);
}
