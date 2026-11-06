// Contrôle du cours : pour chaque jour, les mots hébreux (au genre masculin et féminin) qui n'ont jamais paru dans un jour
// précédent. Sert à repérer les mots utilisés sans avoir été appris et la charge de chaque journée.
// Usage : npx jiti scripts/check-course.ts [--all]
import { ALL_DAYS, blanked, linesOf } from "../lib/content/course-he";

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
  // Phrases seulement entendues (écoutes, histoires) : comprises sans être à dire, leurs mots ne comptent pas dans la charge du jour.
  const heardOnly = new Set(day.steps.flatMap((st) => (st.kind === "listen" ? [st.say.fr] : [])));
  const lines = [day.key, ...day.steps.flatMap(linesOf)];
  // Le jeu de rôle (amorce) est vu après l'entraînement : ses mots ne comptent pas comme appris.
  const here = new Set<string>();
  const heard = new Set<string>();
  for (const l of lines) for (const g of ["m", "f"] as const) for (const w of words(l.he[g])) (heardOnly.has(l.fr) ? heard : here).add(w);
  const fresh = [...here].filter((w) => !roots(w).some((r) => seen.has(r)));
  for (const w of [...here, ...heard]) for (const r of roots(w)) seen.add(r);
  const flag = fresh.length > 12 && fresh.length / day.steps.length > 1.3;
  if (flag) flagged++;
  if (all || flag) console.log(`${day.id.padEnd(6)} ${String(day.steps.length).padStart(2)} étapes · ${String(fresh.length).padStart(2)} mots nouveaux${flag ? "  ⚠ lourd" : ""}${all ? " : " + fresh.join(" ") : ""}`);
}
// Validité des étapes : une seule bonne réponse par écoute, un mot caché présent dans la phrase à trou, ids uniques.
let errors = 0;
const bad = (id: string, msg: string) => { errors++; console.log(`✗ ${id} : ${msg}`); };
const ids = new Set<string>();
for (const { day } of ALL_DAYS) {
  if (ids.has(day.id)) bad(day.id, "identifiant en double");
  ids.add(day.id);
  day.steps.forEach((st, k) => {
    const at = `${day.id}#${k + 1}`;
    if (st.kind === "listen") {
      if (st.options.filter((o) => o.ok).length !== 1) bad(at, "écoute : il faut exactement une bonne réponse");
      if (new Set(st.options.map((o) => o.fr)).size !== st.options.length) bad(at, "écoute : réponses en double");
    }
    if (st.kind === "fill") for (const g of ["m", "f"] as const) {
      if (!st.blank.he[g] || !st.line.he[g].includes(st.blank.he[g])) bad(at, `trou (${g}) : « ${st.blank.he[g]} » absent de « ${st.line.he[g]} »`);
      else if (!blanked(st.line, st.blank, g).he.includes("___")) bad(at, "trou non masqué");
    }
    if (st.kind === "swap" && st.from.he.m === st.to.he.m && st.from.he.f === st.to.he.f) bad(at, "transformation : départ et arrivée identiques");
    if (st.kind === "free" && !st.example) bad(at, "réponse libre sans exemple");
  });
}
console.log(errors ? `${errors} erreur(s).` : "Étapes valides.");
process.exitCode = errors ? 1 : 0;
console.log(`${ALL_DAYS.length} jours, ${seen.size} racines vues, ${flagged} jour(s) trop chargé(s) (> 12 mots nouveaux et > 1,3 par étape).`);
