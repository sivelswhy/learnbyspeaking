// Audit pédagogique du cours : cohérence hébreu / translittération / français, genre, doublons, jours sans production libre.
// Usage : npx jiti scripts/lint-course.ts
import { ALL_DAYS, linesOf } from "../lib/content/course-he";

const HE = /[א-ת]/, LATIN = /[A-Za-z]/;
let problems = 0;
const bad = (where: string, msg: string) => { problems++; console.log(`✗ ${where} : ${msg}`); };
for (const { day } of ALL_DAYS) {
  const lines = [day.key, ...day.steps.flatMap(linesOf)];
  lines.forEach((l, k) => {
    const at = `${day.id} ligne ${k + 1} « ${l.fr.slice(0, 40)} »`;
    for (const g of ["m", "f"] as const) {
      if (!HE.test(l.he[g])) bad(at, `pas d'hébreu (${g})`);
      if (LATIN.test(l.he[g])) bad(at, `lettres latines dans l'hébreu (${g}) : ${l.he[g]}`);
      if (HE.test(l.tr[g])) bad(at, `lettres hébraïques dans la translittération (${g}) : ${l.tr[g]}`);
      if (!LATIN.test(l.tr[g])) bad(at, `translittération vide (${g})`);
      if (/\s{2,}|^\s|\s$/.test(l.he[g] + "|" + l.tr[g])) bad(at, "espaces en trop");
    }
    // Genre : si l'hébreu change entre masculin et féminin, la translittération doit changer aussi.
    if (l.he.m !== l.he.f && l.tr.m === l.tr.f && !/matsi'a/.test(l.tr.m)) bad(at, `hébreu genré (${l.he.m} / ${l.he.f}) mais translittération identique : ${l.tr.m}`);
    // Nombre de mots : hébreu et translittération doivent concorder (hors mots collés).
    const nh = l.he.m.replace(/[?!.,…]/g, "").split(/\s+/).filter(Boolean).length, nt = l.tr.m.replace(/[?!.,…]/g, "").split(/\s+/).filter(Boolean).length;
    if (Math.abs(nh - nt) > 1) bad(at, `${nh} mots en hébreu, ${nt} en translittération : ${l.he.m} / ${l.tr.m}`);
    if (!l.fr.trim()) bad(at, "traduction vide");
  });
  const prod = day.steps.filter((s) => s.kind === "free" || s.kind === "answer" || s.kind === "swap" || s.kind === "fill").length;
  if (prod < 1) bad(day.id, "aucune étape de production");
  if (!day.steps.some((s) => s.kind === "listen") && !day.id.endsWith("r")) bad(day.id, "aucune étape d'écoute");
}
console.log(problems ? `${problems} problème(s).` : "Aucun problème.");
process.exitCode = problems ? 1 : 0;
