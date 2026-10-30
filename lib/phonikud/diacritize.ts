/**
 * Vocalisation (nikud, accent, shva mobile, préfixes) par le modèle Phonikud (ONNX, MIT).
 * Portage de phonikud_onnx/model.py : tokenizer caractère par caractère de
 * dicta-il/dictabert-large-char-menaked (CC BY 4.0), puis décodage des sorties du modèle.
 */
import vocab from "./vocab.json";

const VOCAB = vocab as Record<string, number>;
const CLS = VOCAB["[CLS]"], SEP = VOCAB["[SEP]"], UNK = VOCAB["[UNK]"];

const NIKUD_CLASSES = [
  "", "<MAT_LECT>", "ּ", "ְ", "ֱ", "ֲ", "ֳ", "ִ", "ֵ", "ֶ", "ַ", "ָ",
  "ֹ", "ֺ", "ֻ", "ְּ", "ֱּ", "ֲּ", "ֳּ", "ִּ",
  "ֵּ", "ֶּ", "ַּ", "ָּ", "ֹּ", "ֺּ", "ֻּ",
  "ׇ", "ׇּ",
];
const SHIN_CLASSES = ["ׁ", "ׂ"];
const MATRES = "אוי";
const STRESS = "֫", VOCAL_SHVA = "ֽ", PREFIX = "|";

/** Caractères que le tokenizer garde ; une suite d'autres caractères devient un seul [UNK]. */
const ALLOWED = /[֐-׿\u0000-\u007f‌-‿₠-₿∀-⋿⅐-↋ﬀ-ﭏ]/;

export interface Encoded {
  chars: string[];
  /** Jetons sans [CLS]/[SEP] : position dans `chars` et identifiant. */
  tokens: { start: number; end: number; id: number }[];
  ids: BigInt64Array;
}

export function encode(text: string): Encoded {
  const chars = Array.from(text.replace(/[֐-ׇ|]/g, ""));
  const tokens: Encoded["tokens"] = [];
  chars.forEach((c, i) => {
    if (!ALLOWED.test(c)) {
      const prev = tokens[tokens.length - 1];
      if (prev?.id === UNK && prev.end === i && !ALLOWED.test(chars[i - 1])) prev.end = i + 1;
      else tokens.push({ start: i, end: i + 1, id: UNK });
      return;
    }
    const n = c.normalize("NFKC").toLowerCase();
    tokens.push({ start: i, end: i + 1, id: VOCAB[n] ?? VOCAB[n.normalize("NFD").replace(/\p{M}/gu, "")] ?? UNK });
  });
  const ids = BigInt64Array.from([CLS, ...tokens.map((t) => t.id), SEP].map(BigInt));
  return { chars, tokens, ids };
}

function argmax(a: Float32Array, off: number, n: number) {
  let best = 0;
  for (let k = 1; k < n; k++) if (a[off + k] > a[off + best]) best = k;
  return best;
}

/** Recompose le texte vocalisé à partir des sorties du modèle (batch de 1). */
export function decode(enc: Encoded, nikud: Float32Array, shin: Float32Array, extra: Float32Array): string {
  const out: string[] = [];
  let prev = 0;
  enc.tokens.forEach((t, k) => {
    const pos = k + 1; // décalage du [CLS]
    if (t.start > prev) out.push(enc.chars.slice(prev, t.start).join(""));
    if (t.end - t.start !== 1) return;
    const ch = enc.chars[t.start];
    prev = t.end;
    if (ch < "א" || ch > "ת") {
      out.push(ch);
      return;
    }
    let nk = NIKUD_CLASSES[argmax(nikud, pos * NIKUD_CLASSES.length, NIKUD_CLASSES.length)];
    const sh = ch === "ש" ? SHIN_CLASSES[argmax(shin, pos * 2, 2)] : "";
    if (nk === "<MAT_LECT>") {
      if (!MATRES.includes(ch)) nk = "";
      else {
        out.push(ch);
        return;
      }
    }
    const e = pos * 3;
    out.push(ch + sh + nk + (extra[e] > 0 ? STRESS : "") + (extra[e + 1] > 0 ? VOCAL_SHVA : "") + (extra[e + 2] > 0 ? PREFIX : ""));
  });
  out.push(enc.chars.slice(prev).join(""));
  return out.join("");
}
