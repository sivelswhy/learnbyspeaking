// Contrôle du cours : pour chaque jour, les mots hébreux (au genre masculin et féminin) qui n'ont jamais paru dans un jour
// précédent. Sert à repérer les mots utilisés sans avoir été appris et la charge de chaque journée.
// Usage : npx jiti scripts/check-course.ts [--all]
import { ALL_DAYS, linesOf } from "../lib/content/course-he";

const clean = (w: string) => w.replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");
/** Mot sans préfixes collés (ב ל מ ו ה ש כ), pour qu'« בפריז » rapproche « פריז ». */
const roots = (w: string) => {
  const out = new Set([w]);
  let cur = w;
  for (let k = 0; k < 3 && cur.length > 2 && "בלמוהשכ".includes(cur[0]); k++) { cur = cur.slice(1); out.add(cur); }
  return [...out];
};
const words = (t: string) => t.split(/\s+/).map(clean).filter((w) => w.length > 1);

const seen = new Set<string>();
const all = process.argv.includes("--all");
let flagged = 0;
for (const { day } of ALL_DAYS) {
  const lines = [day.key, ...day.steps.flatMap(linesOf)];
  // Le jeu de rôle (amorce) est vu après l'entraînement : ses mots ne comptent pas comme appris.
  const here = new Set<string>();
  for (const l of lines) for (const g of ["m", "f"] as const) for (const w of words(l.he[g])) here.add(w);
  const fresh = [...here].filter((w) => !roots(w).some((r) => seen.has(r)));
  for (const w of here) for (const r of roots(w)) seen.add(r);
  const flag = fresh.length > 12;
  if (flag) flagged++;
  if (all || flag) console.log(`${day.id.padEnd(6)} ${String(day.steps.length).padStart(2)} étapes · ${String(fresh.length).padStart(2)} mots nouveaux${flag ? "  ⚠ lourd" : ""}${all ? " : " + fresh.join(" ") : ""}`);
}
console.log(`${ALL_DAYS.length} jours, ${seen.size} racines vues, ${flagged} jour(s) trop chargé(s) (> 12 mots nouveaux).`);
