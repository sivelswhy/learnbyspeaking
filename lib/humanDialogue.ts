"use client";
import { complete, yesProbability, type Msg } from "./llm";
import { relevancePrompt } from "./placement";
import { HE_LEVEL, HE_SCENE, openingPrompt, pickGender, replyFlaws, tidyReply } from "./prompts";
import { CLARIFY, SCENES, answersOnlyByAsking, flat, isGreeting, isQuestion, sceneProgress } from "./scenes";
import type { DialogueReply, Turn } from "./dialogue";
import type { Scenario } from "./languages";
import type { Profile } from "./types";

/**
 * Conversation libre, comme avec un humain (app Mac : Gemma 4 E2B sur llama.cpp).
 * Aucune réplique écrite d'avance : Shuli joue son rôle à partir de la situation et des faits de la scène.
 * Mesuré sur 15 répliques libres (aéroport, restaurant, voisin) : 0 défaut de genre, de longueur ou de rôle,
 * 6,6 mots par réplique, 0,5 s ; DictaLM 1,7B avec la même consigne : 3 trop longues et des sorties de rôle.
 */
export function humanSystem(p: Profile, sc: Scenario): string {
  const f = p.gender === "f";
  const he = HE_SCENE[sc.id];
  const script = SCENES[sc.id];
  const who = f ? "תלמידה שלומדת" : "תלמיד שלומד";
  const free = !script;
  return `אתה שולי, ישראלי אמיתי, ואתה מדבר בעל פה עם ${who} עברית (רמה ${p.level}: ${HE_LEVEL[p.level]}).
המצב: אתה ${he?.role ?? `${sc.role} (התיאור בצרפתית)`}.${script ? ` ${script.facts}` : ""}${he?.asks ? `\nבתפקיד שלך אתה שואל, לפי הסדר ושאלה אחת בכל פעם: ${he.asks}. אל תדלג על שלב ואל תיתן מידע לפני שהגיע הזמן.` : ""}${he?.learner ? `\nה${f ? "תלמידה" : "תלמיד"} הוא זה ש${he.learner}: אתה לא עושה את זה במקומו.` : ""}
דבר כמו בן אדם אמיתי: תגובה טבעית וחמה למה ש${f ? "היא אמרה" : "הוא אמר"}, משפט אחד או שניים קצרים, בעברית פשוטה.
${free ? `תתעניין ב${f ? "ה" : "ו"}: שאל שאלה קצרה אחת כדי שהשיחה תמשיך.` : "שאל שאלה רק כשזה טבעי בתפקיד שלך."}
זכור מה כבר נאמר בשיחה: אל תשאל שוב על משהו שכבר נענה.
כמו בן אדם אמיתי:
- אם ${f ? "היא לא אומרת" : "הוא לא אומר"} כלום, או רק "אממ" או "...": עודד בעדינות (לא נורא, קח${f ? "י" : ""} את הזמן) ושאל שוב את השאלה האחרונה בפשטות. אל תתקדם בשיחה.
- אם ${f ? "היא אומרת" : "הוא אומר"} משהו לא קשור: הגב לזה במשפט קצר וטבעי, ואז חזור למצב.
- אם יש מילה בצרפתית או באנגלית: תבין אותה, ותגיד את המילה בעברית בתוך התשובה שלך בטבעיות.
- אם ${f ? "היא לא הבינה" : "הוא לא הבין"}: תגיד שוב את אותו הדבר במילים פשוטות יותר.
- אם שואלים עליך: ענה בקצרה כמו בן אדם (אפשר פרטים אישיים פשוטים: מאיפה אתה, מה אתה אוהב), ואז חזור לשיחה.
- אם ${f ? "היא ממהרת" : "הוא ממהר"} או ${f ? "עצבנית" : "עצבני"}: תהיה רגוע ונחמד, ותתקדם מהר יותר.
- אם ${f ? "היא מבקשת" : "הוא מבקש"} ממך משהו שאפשר לעשות בתפקיד שלך (לנסוע מהר, להביא מים): תגיד כן ותעשה את זה.
אם שואלים משהו על המקום שאתה לא יודע, תגיד את זה בטבעיות ואל תמציא מחירים או שעות.
דוגמאות לתגובות טבעיות (בכל מצב, לפי התפקיד שלך):
- "אתמול ראיתי סרט" ← "${f ? "באמת? איזה סרט ראית" : "באמת? איזה סרט ראית"}? אני אוהב קומדיות. אז..." ואז חוזרים לשאלה של המצב.
- "אני מ France" ← "${f ? "את מצרפת" : "אתה מצרפת"}? יפה! צרפת זה פראנס בעברית." ואז ממשיכים.
- "אתה אוהב כדורגל?" ← "כן, אני אוהד מכבי! ${f ? "ואת" : "ואתה"}?" ואז חוזרים לשיחה.
- "אני רוצה un café" ← "קפה? בטח!" ואז ממשיכים.
${f ? "פנה אליה בלשון נקבה (את, רוצה, אוהבת)." : "פנה אליו בלשון זכר (אתה, רוצה, אוהב)."} בלי רשימות, בלי אימוג'י, בלי תרגום, בלי אנגלית.`;
}

/**
 * Consigne pour la réplique en cours, placée à la fin de la consigne générale (Gemma la suit mieux là).
 * Sans elle, au banc d'essai : « לא הבנתי » recevait une explication du mot « כדורגל », « כמה זה עולה? » la durée
 * du trajet, et la question annexe « יש אוכל במטוס? » était ignorée.
 */
export function turnHint(said: string, lastAi: string, f: boolean): string {
  if (!said) return "";
  if (CLARIFY.test(flat(said)) && lastAi) {
    return `\nעכשיו: ${f ? "היא לא הבינה" : "הוא לא הבין"} את מה שאמרת: "${lastAi}". תגיד את אותו הדבר שוב, קצר ובמילים פשוטות יותר. בלי נושא חדש ובלי הסבר על מילים.`;
  }
  if (isQuestion(said)) {
    return `\nעכשיו: ${f ? "היא שאלה" : "הוא שאל"}: "${said}". קודם כול ענה בדיוק על השאלה הזאת (לפי העובדות אם יש), ורק אחר כך המשך בתפקיד.`;
  }
  return "";
}

/**
 * Questions dont la réponse doit contenir un mot attendu : « כמה זה עולה? » recevait la durée du trajet.
 * Une réplique sans ce mot est notée « à côté » et refaite.
 */
const MUST_ANSWER: [RegExp, RegExp][] = [
  [/כמה\s+(זה\s+)?(עולה|עולים)|מה\s+המחיר/, /שקל|ש"ח|₪|מחיר|עולה|עולים|חינם|מונה|יורו|דולר|לא בטוח|לא יודע/],
  [/כמה\s+זמן/, /דק(ה|ות)|שע(ה|ות|תיים)|זמן|רגע|לא בטוח|לא יודע/],
  [/באיזו\s+שעה|מתי/, /שעה|בשעה|ב-?\d|בבוקר|בערב|בצהריים|עכשיו|עוד|אחרי|לפני|מחר|היום|לא בטוח|לא יודע/],
];
const offAnswer = (said: string, reply: string) => MUST_ANSWER.some(([q, a]) => q.test(said) && !a.test(reply));

/** Rien de dit : silence, « אממ », « ... » (Whisper rend parfois juste une hésitation). */
const FILLER = /^[\s.…!?,\-]*((א|ה)+מ+|א+ה+|ה+מ+|אה|אמ)?[\s.…!?,\-]*$/;

/** « את » pronom (pas la particule de l'objet : « את ה… », « את זה ») dit à un homme : faute de genre. */
const AT_TO_MAN = /(^|[\s,.!?])את\s+(?!ה|זה|זאת|זו|כל|מה|מי|עצמ|ש)[א-ת]/;

/** Défauts pondérés : genre, latin, rôle inversé et répétition comptent plus que la longueur. */
const cost = (flaws: string[]) => flaws.reduce((a, x) => a + (x === "long" || x === "sans question" ? 1 : 3), 0);

export async function humanReply(o: {
  llm: Parameters<typeof complete>[0]; profile: Profile; sc: Scenario; turns: Turn[];
  onToken?: (t: string) => void; signal?: AbortSignal;
}): Promise<DialogueReply | null> {
  const { llm, profile, sc, turns, signal } = o;
  const g = profile.gender ?? "m";
  const script = SCENES[sc.id];
  const users = turns.filter((t) => t.role === "user");
  const said = users.at(-1)?.text ?? "";

  // Mission dite autrement que prévu : validée par le juge si elle répond à la question que Shuli vient de poser.
  let mission: string | undefined;
  if (script && users.length) {
    const prog = sceneProgress(script, users.map((t) => t.text), users.map((t) => t.missions));
    const prevAi = turns.at(-2)?.role === "assistant" ? turns.at(-2)!.text : "";
    if (!prog.newly.length && prog.next && !answersOnlyByAsking(prog.next) && prevAi.includes("?") && !isQuestion(said) && !isGreeting(said) && !CLARIFY.test(flat(said))) {
      const p = await yesProbability(llm, relevancePrompt(prevAi, said)).catch(() => 0);
      if (p >= 0.5) mission = prog.next.id;
    }
  }

  // Silence ou hésitation : comme un humain, on encourage et on repose la dernière question, sans avancer.
  if (users.length && FILLER.test(said)) {
    const lastAi = [...turns].reverse().find((t) => t.role === "assistant")?.text ?? "";
    const q = (lastAi.match(/[^.!?]*\?/g) ?? []).at(-1)?.trim();
    const take = g === "f" ? "לא נורא, קחי את הזמן." : "לא נורא, קח את הזמן.";
    return { text: q ? `${take} ${q}` : `${take} מה ${g === "f" ? "תרצי" : "תרצה"} להגיד?`, source: "script", flaws: [], mission };
  }

  const history: Msg[] = turns.map((t) => ({ role: t.role, content: t.text }));
  if (!history.length) history.push({ role: "user", content: openingPrompt() });
  const before = turns.filter((t) => t.role === "assistant").map((t) => t.text);
  const lastAi = [...turns].reverse().find((t) => t.role === "assistant")?.text ?? "";
  const system = humanSystem(profile, sc) + turnHint(users.length ? said : "", lastAi, g === "f");
  let best = "";
  let bestFlaws: string[] = [];
  let bestCost = Infinity;
  for (const temperature of [0.7, 0.9, 1.0]) {
    const out = await complete(llm, {
      messages: [{ role: "system", content: system }, ...history],
      onToken: o.onToken, signal, maxTokens: 90, temperature, antiRepeat: true,
    });
    const cand = pickGender(tidyReply(out), g);
    // Pas de contrôle d'écho : reprendre les mots de la question (« כן, אפשר לשלם באשראי ») est naturel.
    // Rôle inversé : seulement dans une question du personnage (« באיזו שעה העלייה? »), pas dans une affirmation.
    const flaws = replyFlaws(cand, g, before, { needQuestion: false });
    if (g === "m" && AT_TO_MAN.test(cand) && !flaws.includes("genre")) flaws.push("genre");
    const asks = (cand.match(/[^.!?]*\?/g) ?? []).join(" ");
    if (users.length && offAnswer(said, cand)) flaws.push("à côté");
    if (asks && script?.never.some((re) => re.test(asks))) flaws.push("rôle inversé");
    const c = cost(flaws);
    if (c < bestCost) [best, bestFlaws, bestCost] = [cand, flaws, c];
    if (c === 0 || signal?.aborted) break;
  }
  if (!best) return null;
  // Phrases au mauvais genre retirées (« אתה » dit à une femme) ; on garde le reste.
  if (bestFlaws.includes("genre")) {
    const ok = (best.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).filter((x) => !replyFlaws(x, g).includes("genre") && !(g === "m" && AT_TO_MAN.test(x))).join(" ").trim();
    if (ok) [best, bestFlaws] = [ok, bestFlaws.filter((x) => x !== "genre")];
  }
  return { text: best, source: "llm", flaws: bestFlaws, mission };
}
