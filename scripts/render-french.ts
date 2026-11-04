// Pré-génère la voix française des consignes du cours (Phonon, voix Arnaud) : un fichier m4a par texte,
// nommé d'après le SHA-1 du texte (mac/native/Voice.swift lit le même nom). Les textes déjà générés sont sautés.
// Usage : HF_TOKEN=… npx jiti scripts/render-french.ts   (modèle dans ~/learnbyspeaking-models/phonon, `brew install gradium-ai/tap/ptts`)
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { COURSE } from "../lib/content/course-he";

const MODEL = process.env.PHONON_DIR ?? join(homedir(), "learnbyspeaking-models/phonon");
const VOICE = process.env.PHONON_VOICE ?? "Arnaud";
const OUT = new URL("../mac/native/Resources/fr/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

export const clipKey = (text: string) => createHash("sha1").update(text.trim()).digest("hex").slice(0, 16);

const texts = new Set<string>();
for (const lvl of COURSE) for (const u of lvl.units) for (const d of u.days) for (const st of d.steps) {
  if (st.kind !== "intro") continue;
  if (st.parts?.some((p) => p.he)) for (const p of st.parts) { if (!p.he && p.t.trim()) texts.add(p.t.trim()); }
  else texts.add(st.fr.trim());
}
// Fichiers devenus inutiles (texte modifié depuis) : supprimés.
const wanted = new Set([...texts].map((t) => clipKey(t) + ".m4a"));
for (const f of readdirSync(OUT)) if (f.endsWith(".m4a") && !wanted.has(f)) rmSync(join(OUT, f));
let done = 0, skipped = 0, failed = 0;
const tmp = join(tmpdir(), "render-french.wav");
for (const t of texts) {
  const out = join(OUT, clipKey(t) + ".m4a");
  if (existsSync(out)) { skipped++; continue; }
  const r = spawnSync("ptts", ["--model", MODEL, "--weights", "model.q8.gguf", "--lang", "fr", "--voice", VOICE, "--voice-catalog", "hf://gradium/phonon-voices", t, "-o", tmp], { stdio: "ignore" });
  const c = r.status === 0 ? spawnSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "56000", tmp, out], { stdio: "ignore" }) : r;
  if (c.status !== 0) { failed++; console.log("✗", t.slice(0, 60)); continue; }
  done++;
  if (done % 10 === 0) console.log(`${done} générés, ${skipped} déjà là, ${texts.size - done - skipped - failed} à faire`);
}
rmSync(tmp, { force: true });
console.log(`Terminé : ${done} générés, ${skipped} déjà présents, ${failed} échecs, ${texts.size} textes.`);
