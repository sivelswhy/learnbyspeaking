// Liste les textes hébreux du cours à pré-générer avec BlueTTS (voix adam) :
//  - morceaux hébreux des consignes (étapes « intro »),
//  - toutes les phrases des étapes (au genre masculin et féminin), phrases clés, amorces de jeu de rôle,
//  - mots, phrases et exemples des ressources (alphabet, thèmes, phrases utiles, grammaire).
// Écrit ~/learnbyspeaking-models/bluetts/texts.json (clé = SHA-1 du texte, comme scripts/render-french.ts et Voice.swift).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { COURSE, linesOf } from "../lib/content/course-he";
import { ALPHABET, GRAMMAR, PHRASES, THEMES } from "../lib/content/resources-he";

export const key = (t: string) => createHash("sha1").update(t.trim()).digest("hex").slice(0, 16);
const texts = new Map<string, string>();
const add = (t: string | undefined) => { const s = (t ?? "").trim(); if (s && /[א-ת]/.test(s)) texts.set(key(s), s); };
for (const lvl of COURSE) for (const u of lvl.units) for (const d of u.days) {
  for (const l of [d.key, ...d.steps.flatMap(linesOf)]) { add(l.he.m); add(l.he.f); }
  add(d.scenario.starter.text.m); add(d.scenario.starter.text.f);
  for (const st of d.steps) if (st.kind === "intro") for (const p of st.parts ?? []) if (p.he) { add(p.he.m); add(p.he.f); }
}
for (const l of ALPHABET) add(l.example.he);
for (const t of THEMES) for (const w of t.words) add(w.he);
for (const w of PHRASES) add(w.he);
for (const g of GRAMMAR) for (const e of g.examples) add(e.he);
const dir = join(homedir(), "learnbyspeaking-models/bluetts");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "texts.json"), JSON.stringify(Object.fromEntries(texts), null, 1));
console.log(texts.size, "textes hébreux →", join(dir, "texts.json"));
