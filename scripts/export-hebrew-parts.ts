// Liste les textes hébreux dits à l'intérieur des consignes (morceaux `he` des étapes « intro ») pour les pré-générer avec BlueTTS.
// Écrit ~/learnbyspeaking-models/bluetts/texts.json (clés = SHA-1 du texte, comme scripts/render-french.ts).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { COURSE } from "../lib/content/course-he";

const key = (t: string) => createHash("sha1").update(t.trim()).digest("hex").slice(0, 16);
const texts = new Map<string, string>();
for (const lvl of COURSE) for (const u of lvl.units) for (const d of u.days) for (const st of d.steps) {
  if (st.kind !== "intro") continue;
  for (const p of st.parts ?? []) if (p.he) for (const t of [p.he.m, p.he.f]) texts.set(key(t), t.trim());
}
const dir = join(homedir(), "learnbyspeaking-models/bluetts");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "texts.json"), JSON.stringify(Object.fromEntries(texts), null, 1));
console.log(texts.size, "textes hébreux →", join(dir, "texts.json"));
