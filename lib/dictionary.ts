/**
 * Dictionnaire français ↔ hébreu tiré du Wiktionnaire (CC BY-SA 4.0), chargé à la première recherche (≈ 200 Ko compressé).
 * Fichier : public/dict-fr-he.json, produit par ~/learnbyspeaking-models/dict/extract_dict.py.
 */

/** [hébreu, nikud, transcription, genre m/f, pluriel, nature] */
export type FrEntry = [string, string, string, string, string, string];
/** [nikud, transcription, genre, pluriel, nature, sens en français] */
export type HeEntry = [string, string, string, string, string, string[]];
export interface Dict {
  fr: Record<string, FrEntry[]>;
  he: Record<string, HeEntry>;
}

let dictP: Promise<Dict | null> | null = null;
let plainIndex: Map<string, string> | null = null;

export function loadDict(): Promise<Dict | null> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  dictP ??= fetch(`${base}/dict-fr-he.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Dict>) : null))
    .catch(() => {
      dictP = null; // hors ligne : on réessaiera
      return null;
    });
  return dictP;
}

/** Minuscules, sans accents ni ponctuation : « Hôpital » → « hopital ». */
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’]/g, "'").replace(/[^a-z' -]/g, "").trim();

/** Le mot français, essayé tel quel, sans accents, sans article, au singulier. */
export function lookupFrench(d: Dict, word: string): { key: string; entries: FrEntry[] } | null {
  plainIndex ??= new Map(Object.keys(d.fr).map((k) => [fold(k), k]));
  const w = word.trim().toLowerCase();
  const bare = w.replace(/^(le |la |les |l'|l’|un |une |des |du |de la |se |s'|s’)/, "");
  for (const c of [w, bare, bare.replace(/s$/, ""), bare.replace(/x$/, "")]) {
    const k = d.fr[c] ? c : plainIndex.get(fold(c));
    if (k && d.fr[k]?.length) return { key: k, entries: d.fr[k] };
  }
  return null;
}

/** Le mot hébreu, sans nikud, puis sans article ה. */
export function lookupHebrew(d: Dict, word: string): HeEntry | null {
  const w = word.replace(/[֑-ׇ]/g, "").replace(/[^א-ת ]/g, "").trim();
  return d.he[w] ?? (w.startsWith("ה") ? d.he[w.slice(1)] : undefined) ?? null;
}

const POS_FR: Record<string, string> = { m: "masculin", f: "féminin" };

/** « Nom masculin · pluriel : בתים » */
export function grammarLine(pos: string, gender: string, plural: string): string {
  if (pos === "nom propre") return ""; // homographe d'un nom commun (שלום) : pas fiable
  const parts = [[pos ? pos[0].toUpperCase() + pos.slice(1) : "", POS_FR[gender] ?? ""].filter(Boolean).join(" ")];
  if (plural) parts.push(`pluriel : ${plural}`);
  return parts.filter(Boolean).join(" · ");
}
