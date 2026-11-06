import { FEM } from "./sayInHebrew";
import type { Gender } from "./languages";
import type { Correction } from "./types";

/** Une faute précise : le mot de l'apprenant, le mot juste, et pourquoi. */
export interface Fix {
  from: string;
  to: string;
  why: string;
}

const strip = (w: string) => w.replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");
const words = (s: string) => s.split(/\s+/).map(strip).filter(Boolean);
const MASC_OF = Object.fromEntries(Object.entries(FEM).filter(([m, f]) => m !== f).map(([m, f]) => [f, m]));

/** Pourquoi `from` devient `to` : lu sur la forme des deux mots (suffixe, préfixe), jamais deviné par le modèle. */
export function whyChanged(from: string, to: string): string {
  const f = from.replace(/^[והבלמכש]/, "");
  const t = to.replace(/^[והבלמכש]/, "");
  if (to === from + "ת" || to === from + "ה" || to === from.replace(/ה$/, "ת") || to === from.replace(/ה$/, "ית") || to === from + "ית")
    return "accord au féminin";
  if (from === to + "ת" || from === to + "ה") return "accord au masculin";
  if (/(ים|ות)$/.test(to) && !/(ים|ות)$/.test(from) && to.startsWith(from.slice(0, 2))) return "il faut le pluriel";
  if (/(ים|ות)$/.test(from) && !/(ים|ות)$/.test(to) && to.startsWith(from.slice(0, 2))) return "il faut le singulier";
  if (/^ל/.test(to) && !/^ל/.test(from) && to.length >= 4) return "infinitif : après « רוצה / יכול / צריך », le verbe prend ל";
  if (/תי$/.test(from) && /^[אינת]/.test(to) && !/תי$/.test(to)) return "futur : la 1re personne prend le préfixe א";
  if (/תי$/.test(to) && !/תי$/.test(from)) return "passé, 1re personne : terminaison ־תי";
  if (/תי$/.test(from) && !/תי$/.test(to)) return `le verbe n'est pas au passé ici (${to})`;
  if (/^[אינת]/.test(to) && !/^[אינת]/.test(from) && Math.abs(to.length - from.length) <= 1 && to.slice(1, 3) === from.slice(0, 2)) return "futur : préfixe du verbe (א / י / נ / ת)";
  if (/^[אינת]/.test(from) && !/^[אינת]/.test(to) && from.slice(1, 3) === to.slice(0, 2)) return "ce n'est pas le futur ici : forme du présent ou du passé";
  if (f === t && from[0] !== to[0] && /^[בלמכ]/.test(from) && /^[בלמכ]/.test(to)) return `préposition : « ${to[0]} » au lieu de « ${from[0]} »`;
  if (f === t) return "article ou préfixe collé différent";
  if (f.slice(0, 3) === t.slice(0, 3) || t.includes(f) || f.includes(t)) return "autre forme du même mot (personne, temps ou nombre)";
  return "autre mot plus naturel ici";
}

/** Écarts mot à mot entre la réponse et la correction (plus longue sous-suite commune), avec la raison de chacun. */
export function explainFixes(answer: string, correction: string): Fix[] {
  const x = words(answer);
  const y = words(correction);
  const d: number[][] = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) d[i][j] = x[i] === y[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const out: Fix[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { i++; j++; continue; }
    const a: string[] = [];
    const c: string[] = [];
    while ((i < x.length || j < y.length) && !(i < x.length && j < y.length && x[i] === y[j])) {
      if (j >= y.length || (i < x.length && d[i + 1][j] >= d[i][j + 1])) a.push(x[i++]);
      else c.push(y[j++]);
    }
    if (a.length === c.length) a.forEach((w, k) => out.push({ from: w, to: c[k], why: whyChanged(w, c[k]) }));
    else if (!c.length) a.forEach((w) => out.push({ from: w, to: "", why: "mot en trop : on peut l'enlever" }));
    else if (!a.length) out.push({ from: "", to: c.join(" "), why: "mot manquant" });
    else out.push({ from: a.join(" "), to: c.join(" "), why: a.length === 2 && c.length === 1 ? "un seul mot suffit : la forme conjuguée" : "à reformuler" });
  }
  return out.slice(0, 4);
}

/** Fautes d'accord avec le genre de l'apprenant, repérées par la table des formes courantes après « אני » (sans modèle). */
export function genderSlips(answer: string, gender: Gender): Fix[] {
  const w = words(answer);
  const out: Fix[] = [];
  w.forEach((x, i) => {
    let k = i - 1;
    while (k >= 0 && w[k] === "לא") k--;
    if (k < 0 || i - k > 2 || !/^(ו|ש|כש)?אני$/.test(w[k])) return;
    if (gender === "f" && FEM[x] && FEM[x] !== x) out.push({ from: x, to: FEM[x], why: "tu parles au féminin : ajoute la terminaison féminine" });
    if (gender === "m" && MASC_OF[x]) out.push({ from: x, to: MASC_OF[x], why: "tu parles au masculin : forme masculine" });
  });
  return out;
}

/** Texte français d'une faute : « אוהב → אוהבת (accord au féminin) ». */
export const fixText = (f: Fix) => `${f.from || "…"} → ${f.to || "(rien)"} : ${f.why}`;

/** Fautes précises d'une réponse : celles du genre d'abord, puis les écarts avec la correction de l'IA. */
export function concreteFixes(answer: string, gender: Gender, correction?: string): Fix[] {
  const slips = genderSlips(answer, gender);
  const rest = correction ? explainFixes(answer, correction).filter((f) => !slips.some((s) => f.from.split(" ").includes(s.from))) : [];
  return [...slips, ...rest].slice(0, 4);
}

/** Famille d'une faute, pour le bilan (« Erreurs fréquentes »). */
export function fixCategory(f: Fix): Correction["category"] {
  if (/autre mot/.test(f.why)) return "vocabulaire";
  if (/mot en trop|mot manquant|reformuler|un seul mot/.test(f.why)) return "fluidité";
  if (/accord|féminin|masculin|futur|passé|infinitif|préposition|article|pluriel|singulier|forme/.test(f.why)) return "grammaire";
  return "autre";
}

/** Correction gardée dans l'historique d'une séance : la phrase, sa correction et la première faute expliquée. */
export function correctionOf(answer: string, gender: Gender, correction?: string): Correction | null {
  if (!correction || correction.trim() === answer.trim()) return null;
  const fixes = concreteFixes(answer, gender, correction);
  const f = fixes[0];
  return { original: answer, corrected: correction, natural: correction, explanation: f ? fixText(f) : "", category: f ? fixCategory(f) : "autre" };
}
