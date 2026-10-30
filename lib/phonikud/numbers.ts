/**
 * Chiffres → mots hébreux (sans nikud : le modèle de vocalisation l'ajoute ensuite).
 * Mêmes formes que num2words (lang="he") utilisé par Phonikud : féminin pour compter,
 * masculin pour le nombre de milliers au-delà de dix.
 */

const ONES_F = ["", "אחת", "שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע"];
const ONES_M = ["", "אחד", "שניים", "שלושה", "ארבעה", "חמישה", "שישה", "שבעה", "שמונה", "תשעה"];
const TENS = ["", "עשר", "עשרים", "שלושים", "ארבעים", "חמישים", "שישים", "שבעים", "שמונים", "תשעים"];
const THOUSANDS_CONSTRUCT = ["", "", "", "שלושת", "ארבעת", "חמשת", "ששת", "שבעת", "שמונת", "תשעת", "עשרת"];

/** Groupes d'un nombre < 1000 ; la conjonction ו se pose ensuite sur le dernier groupe. */
function below1000(n: number, masc: boolean): string[] {
  const ones = masc ? ONES_M : ONES_F;
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 1) parts.push("מאה");
  else if (h === 2) parts.push("מאתיים");
  else if (h > 2) parts.push(`${ONES_F[h]} מאות`);
  if (r === 0) return parts;
  if (r < 10) parts.push(ones[r]);
  else if (r === 10) parts.push(masc ? "עשרה" : "עשר");
  else if (r < 20) parts.push(masc ? `${r === 12 ? "שנים" : ones[r % 10]} עשר` : `${r === 12 ? "שתים" : ones[r % 10]} עשרה`);
  else parts.push(r % 10 ? `${TENS[Math.floor(r / 10)]} ו${ones[r % 10]}` : TENS[r / 10]);
  return parts;
}

export function numberToHebrew(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1_000_000) return String(n);
  if (n === 0) return "אפס";
  const parts: string[] = [];
  const th = Math.floor(n / 1000);
  if (th === 1) parts.push("אלף");
  else if (th === 2) parts.push("אלפיים");
  else if (th > 2 && th <= 10) parts.push(`${THOUSANDS_CONSTRUCT[th]} אלפים`);
  else if (th > 10) parts.push(`${withVav(below1000(th, true))} אלף`);
  parts.push(...below1000(n % 1000, false));
  return withVav(parts);
}

function withVav(parts: string[]) {
  const last = parts.length - 1;
  if (last > 0 && !parts[last].includes(" ו")) parts[last] = `ו${parts[last]}`;
  return parts.join(" ");
}

/** Remplace les nombres entiers d'un texte par leurs mots. */
export function expandNumbers(text: string) {
  return text.replace(/\d+/g, (d) => numberToHebrew(Number(d)));
}
