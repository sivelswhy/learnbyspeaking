"use client";
import { complete, type LlmSettings, type Msg } from "./llm";
import { feminineMessages, translateMessages } from "./prompts";
import { canTranslateToHebrew, translateToHebrew } from "./translate";
import type { Profile } from "./types";

const LETTERS = /[^א-ת]/g;
/** « אני », aussi avec un petit mot collé : שאני (que je), ואני (et je), כשאני (quand je). */
const isAni = (w: string) => /^(ו|ש|כש|וש|וכש)?אני$/.test(w.replace(LETTERS, ""));

/**
 * Applique à la phrase d'origine les seuls changements « au féminin » proposés par le modèle :
 * mots situés juste après « אני » (en sautant « לא »), devenus leur forme féminine (même début, 0 à 2 lettres de plus).
 * Tout le reste de la phrase est gardé tel quel : le modèle a tendance à répondre à la phrase au lieu de la modifier.
 */
export function applyFeminine(orig: string, cand: string): string {
  const a = orig.split(/\s+/);
  const b = cand.trim().split(/\s+/);
  if (a.length !== b.length) return orig;
  const bare = (w: string) => w.replace(LETTERS, "");
  return a
    .map((w, i) => {
      let k = i - 1;
      while (k >= 0 && bare(a[k]) === "לא") k--;
      const afterAni = k >= 0 && i - k <= 2 && isAni(a[k]);
      const x = bare(w);
      const y = bare(b[i]);
      if (!afterAni || !x || x === y || !y.startsWith(x.slice(0, 2)) || y.length < x.length || y.length > x.length + 2) return w;
      return w.replace(x, y);
    })
    .join(" ");
}

/** Formes les plus courantes après « אני » : sûres, sans passer par le modèle. */
const FEM: Record<string, string> = {
  לומד: "לומדת", עובד: "עובדת", גר: "גרה", אוהב: "אוהבת", צריך: "צריכה", מחפש: "מחפשת", שמח: "שמחה", עייף: "עייפה",
  רעב: "רעבה", מבין: "מבינה", יכול: "יכולה", חושב: "חושבת", הולך: "הולכת", מבקר: "מבקרת", מדבר: "מדברת", יודע: "יודעת",
  נוסע: "נוסעת", כותב: "כותבת", קורא: "קוראת", אוכל: "אוכלת", מרגיש: "מרגישה", בא: "באה", חי: "חיה", מתכנן: "מתכננת",
  מוכן: "מוכנה", נשוי: "נשואה", סטודנט: "סטודנטית", חייב: "חייבת", מאחר: "מאחרת", טס: "טסה", משחק: "משחקת", מבשל: "מבשלת",
  שר: "שרה", רץ: "רצה", ישן: "ישנה", מתגעגע: "מתגעגעת", מצטער: "מצטערת", בטוח: "בטוחה", עסוק: "עסוקה", חולה: "חולה",
};

/** Remplace par la table les mots qui suivent « אני » (en sautant « לא »). */
export function feminizeKnown(he: string): string {
  const a = he.split(/\s+/);
  return a
    .map((w, i) => {
      let k = i - 1;
      while (k >= 0 && a[k].replace(LETTERS, "") === "לא") k--;
      if (k < 0 || i - k > 2 || !isAni(a[k])) return w;
      const x = w.replace(LETTERS, "");
      return FEM[x] ? w.replace(x, FEM[x]) : w;
    })
    .join(" ");
}

/** Met au féminin ce que dit « je » ; sans « אני » dans la phrase, rien à faire. */
export async function feminize(llm: LlmSettings, text: string, ask?: (m: Msg[]) => Promise<string>): Promise<string> {
  if (!text.split(/\s+/).some(isAni)) return text;
  const he = feminizeKnown(text);
  // Tous les mots après « אני » sont connus (ou déjà au féminin) : pas besoin du modèle.
  const after = [...he.matchAll(/(?:^|\s)(?:ו|ש|כש|וש|וכש)?אני\s+(?:לא\s+)?([\u05d0-\u05ea]+)/g)].map((m) => m[1]);
  if (after.every((w) => Object.values(FEM).includes(w) || /(ת|ה|ית)$/.test(w))) return he;
  const run = ask ?? ((m: Msg[]) => complete(llm, { messages: m, temperature: 0, maxTokens: 60 }));
  const out = (await run(feminineMessages(he))).split("\n")[0];
  return applyFeminine(he, out);
}

/**
 * Langue maternelle → hébreu, au genre de l'apprenant.
 * Traducteur dédié (opus-mt) d'abord : il traduit fidèlement, là où DictaLM répond souvent à la phrase.
 */
export async function sayInHebrew(llm: LlmSettings, p: Profile, text: string): Promise<string> {
  let he = "";
  if (canTranslateToHebrew(p.native)) he = await translateToHebrew(text, p.native).catch(() => "");
  if (!he) he = (await complete(llm, { messages: translateMessages(p, text, true), temperature: 0.1, maxTokens: 120 })).split("\n")[0];
  return p.gender === "f" ? feminize(llm, he) : he;
}
