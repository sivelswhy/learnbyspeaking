import { complete, yesProbability, type LlmSettings, type Msg } from "./llm";
import { relevancePrompt } from "./placement";
import type { Scenario } from "./languages";
import { correctionsToWeakPoints, followUpMessages, openingPrompt, pickGender, replyFlaws, replyShots, replySystem, similar, tidyFollowUp, tidyReply, withFollowUp } from "./prompts";
import { ASK_TIME, BIZARRE, BYE, CLARIFY, DONT_KNOW, QUEUES, SAFE_LINE, SCENES, THANKS_ONLY, isQuestion, reaction, answersOnlyByAsking, badQuestions, dropBadQuestions, flat, isGreeting, lineText, sceneProgress, timeLine } from "./scenes";
import type { Correction, Profile } from "./types";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  /** Missions validées par le juge sur ce message de l'apprenant (dites autrement que prévu). */
  missions?: string[];
  /** Translittération et traduction de la réplique, si connues (pour la redire telle quelle). */
  tr?: string;
  fr?: string;
}

export interface DialogueReply {
  text: string;
  /** Translittération et traduction connues d'avance (répliques écrites à la main). */
  tr?: string;
  fr?: string;
  source: "script" | "llm" | "fallback";
  /** Défauts de la réplique retenue (vide = parfaite). */
  flaws: string[];
  /** Mission validée par le juge sur le dernier message de l'apprenant : à mémoriser sur ce message (Turn.missions). */
  mission?: string;
}

/** Poids des défauts : genre, alphabet latin, répétition et rôle inversé comptent plus qu'une question manquante. */
const cost = (flaws: string[]) => flaws.reduce((a, f) => a + (f === "sans question" || f === "long" ? 1 : f === "rôle inversé" ? 5 : 3), 0);

/**
 * La prochaine réplique du personnage (hébreu), pour l'interface comme pour les tests automatiques.
 *  1. Scène guidée : si le dernier message de l'apprenant accomplit une mission, la réplique écrite à la main répond.
 *  2. Sinon le modèle génère (jusqu'à 3 essais, on garde la meilleure) avec les faits de la scène ; les questions qui inversent
 *     les rôles sont repérées (lib/scenes.ts) et retirées ; s'il ne reste rien, phrase de secours.
 *  3. Conversations libres : une question de relance si la réplique n'en a pas.
 */
export async function nextReply(o: {
  llm: LlmSettings; profile: Profile; sc: Scenario; turns: Turn[]; weak?: string[];
  onToken?: (t: string) => void; signal?: AbortSignal;
  /** Sauter les répliques écrites à la main (réponse à la question annexe d'un message qui accomplit une mission). */
  freeOnly?: boolean;
}): Promise<DialogueReply | null> {
  const { llm, profile, sc, turns, signal } = o;
  // App Mac (Gemma 4 sur llama.cpp) : conversation libre, sans répliques écrites d'avance (lib/humanDialogue.ts).
  if (llm.provider === "llamacpp" && profile.target === "he" && !o.freeOnly) {
    const { humanReply } = await import("./humanDialogue");
    return humanReply(o);
  }
  const g = profile.gender ?? "m";
  const script = SCENES[sc.id];
  const userTexts = turns.filter((t) => t.role === "user").map((t) => t.text);

  if (script && profile.target === "he" && userTexts.length && !o.freeOnly) {
    const credited = turns.filter((t) => t.role === "user").map((t) => t.missions);
    const prog = sceneProgress(script, userTexts, credited);
    const hits = prog.newly;
    // Réponse dite autrement que prévu (« לברצלונה » au lieu de « לפריז », « רק תיק גב ») : si elle répond à la question
    // que le personnage vient de poser, le juge de pertinence valide la mission en cours. Mesuré sur 19 répliques de scène :
    // 16 justes, et aucun « oui » à tort (les ratés sont des refus) ; pas de question de l'apprenant (« איפה השירותים? »).
    const prevAi = turns.at(-2)?.role === "assistant" ? turns.at(-2)!.text : "";
    const said = userTexts.at(-1) ?? "";
    if (!hits.length && prog.next && !answersOnlyByAsking(prog.next) && prevAi.includes("?") && !isQuestion(said) && !isGreeting(said) && !CLARIFY.test(flat(said))) {
      const p = await yesProbability(llm, relevancePrompt(prevAi, said)).catch(() => 0);
      if (p >= 0.5) {
        const l = lineText(prog.next.reply, g);
        return { text: l.he, tr: l.tr, fr: l.fr, source: "script", flaws: [], mission: prog.next.id };
      }
    }
    const hit = hits.at(-1);
    if (hit) {
      const l = lineText(hit.reply, g);
      const done: DialogueReply = { text: l.he, tr: l.tr, fr: l.fr, source: "script", flaws: [] };
      // « אני רוצה חלון, אבל יש אוכל במטוס? » : la mission (hublot) est faite, mais la question annexe mérite une réponse,
      // placée avant la réplique écrite à la main.
      const extra = sideQuestion(userTexts.at(-1) ?? "", hits);
      if (!extra) return done;
      const ex = script.extras?.find((e) => e.detect.test(flat(extra)));
      let ans: { he: string; tr?: string; fr?: string } | null = ex ? lineText(ex.reply, g) : null;
      if (!ans) {
        const sub = await nextReply({ ...o, onToken: undefined, freeOnly: true, turns: [...turns.slice(0, -1), { role: "user", text: extra }] });
        // Un petit modèle répond souvent à côté : on garde sa réponse seulement si le juge (celui du test de niveau) la trouve pertinente.
        const ok = sub && sub.source === "llm" && !sub.flaws.length && (await yesProbability(llm, relevancePrompt(extra, sub.text)).catch(() => 0)) >= 0.5;
        ans = ok ? { he: sub.text } : lineText(DONT_KNOW, g);
      }
      const join = (a?: string, b?: string) => (a && b ? `${a} ${b}` : undefined);
      return { text: `${ans.he} ${l.he}`, tr: join(ans.tr, l.tr), fr: join(ans.fr, l.fr), source: ans.tr ? "script" : "llm", flaws: [] };
    }
  }

  const lastUser = userTexts.at(-1) ?? "";
  if (o.freeOnly) return generate();
  const lastAi = turns.filter((t) => t.role === "assistant").at(-1);
  const t = flat(lastUser);
  if (profile.target === "he" && t) {
    // Demande de répétition : le personnage redit sa dernière phrase (toutes les scènes).
    if (CLARIFY.test(t) && lastAi) return { text: lastAi.text, tr: lastAi.tr, fr: lastAi.fr, source: "script", flaws: [] };
    if (ASK_TIME.test(t)) {
      const l = lineText(timeLine(), g);
      return { text: l.he, tr: l.tr, fr: l.fr, source: "script", flaws: [] };
    }
    if (script) {
      // Demandes courantes hors missions (fenêtre, menu, piscine…) : réponse écrite à la main.
      const ex = script.extras?.find((e) => e.detect.test(t));
      if (ex) {
        const l = lineText(ex.reply, g);
        return { text: l.he, tr: l.tr, fr: l.fr, source: "script", flaws: [] };
      }
      // Simple salutation : le personnage reprend sa question d'ouverture.
      const start = sc.starters?.he;
      if (isGreeting(lastUser) && start) return { text: start.text[g], tr: start.transliteration[g], fr: start.translation[profile.native] ?? "", source: "script", flaws: [] };
    }
    // Conversations ouvertes : réaction d'un mot, puis la question suivante de la liste (jamais d'improvisation hors sujet).
    const queue = QUEUES[sc.id];
    if (queue) {
      const start = sc.starters?.he;
      if (isGreeting(lastUser) && start && userTexts.length <= 2) return { text: start.text[g], tr: start.transliteration[g], fr: start.translation[profile.native] ?? "", source: "script", flaws: [] };
      if (!isQuestion(lastUser) && !THANKS_ONLY.test(t) && !(BYE.test(t) && t.split(" ").length <= 4)) {
        const askedTexts = turns.filter((x) => x.role === "assistant").map((x) => x.text);
        const next = queue.find((q) => !askedTexts.some((a) => a.includes(lineText(q, g).he)));
        if (next) {
          const r = lineText(reaction(lastUser, userTexts.length, sc.id), g);
          const q = lineText(next, g);
          return { text: `${r.he} ${q.he}`, tr: `${r.tr} ${q.tr}`, fr: `${r.fr} ${q.fr}`, source: "script", flaws: [] };
        }
      }
    }
    // Remerciement ou au revoir : une réponse polie, sans question.
    if (THANKS_ONLY.test(t)) return { text: "בשמחה!", tr: "Be-simkha!", fr: "Avec plaisir !", source: "script", flaws: [] };
    if (BYE.test(t) && t.split(" ").length <= 4) return { text: "להתראות, יום טוב!", tr: "Lehitra'ot, yom tov!", fr: "Au revoir, bonne journée !", source: "script", flaws: [] };
  }

  return generate();

  async function generate(): Promise<DialogueReply | null> {
  const history: Msg[] = turns.map((t) => ({ role: t.role, content: t.text }));
  if (!history.length) history.push({ role: "user", content: openingPrompt() });
  const said = turns.filter((t) => t.role === "assistant").map((t) => t.text);
  const never = script?.never;
  let clean = "";
  let bestCost = Infinity;
  let bestFlaws: string[] = [];
  for (const temperature of [0.5, 0.8, 1]) {
    const out = await complete(llm, {
      messages: [{ role: "system", content: replySystem(profile, sc, o.weak ?? [], script) }, ...replyShots(profile, sc.id), ...history],
      onToken: o.onToken,
      signal,
      maxTokens: 50,
      temperature,
      antiRepeat: true,
    });
    const cand = pickGender(tidyReply(out), g);
    const flaws = replyFlaws(cand, g, said, { needQuestion: !script, never });
    // Chiffres, TVA, livraison… : invention d'un petit modèle. En scène guidée, une réponse de plus de 12 mots est aussi suspecte.
    // Écho : le personnage répète la question de l'apprenant au lieu d'y répondre.
    if (userTexts.length && similar(userTexts[userTexts.length - 1], cand) && !flaws.includes("répétition")) flaws.push("répétition");
    if (BIZARRE.test(cand) || (script && cand.split(/\s+/).length > 12)) flaws.push("rôle inversé");
    if (badQuestions(sc.id, cand).length && !flaws.includes("rôle inversé")) flaws.push("rôle inversé");
    const c = cost(flaws);
    if (c < bestCost) {
      bestCost = c;
      clean = cand;
      bestFlaws = flaws;
    }
    if (c === 0 || signal?.aborted) break;
  }
  if (!clean) return null;

  // Phrases au mauvais genre : retirées (« אתה » dit à une femme) ; s'il ne reste rien, phrase de secours.
  if (bestFlaws.includes("genre")) {
    const ok = (clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).filter((x) => !replyFlaws(x, g).includes("genre")).join(" ").trim();
    if (!ok) {
      const l = lineText(script?.fallback ?? SAFE_LINE, g);
      return { text: l.he, tr: l.tr, fr: l.fr, source: "fallback", flaws: bestFlaws };
    }
    clean = ok;
    bestFlaws = bestFlaws.filter((f) => f !== "genre");
  }

  // Invention (chiffres, TVA, texte trop long en scène guidée) : on avoue ne pas savoir plutôt que de mal répondre.
  if (BIZARRE.test(clean) || (script && clean.split(/\s+/).length > 12)) {
    const l = lineText(isQuestion(lastUser) ? DONT_KNOW : (script?.fallback ?? SAFE_LINE), g);
    return { text: l.he, tr: l.tr, fr: l.fr, source: "fallback", flaws: bestFlaws };
  }

  // Questions qui inversent les rôles : retirées. S'il ne reste rien, phrase de secours.
  const kept = dropBadQuestions(sc.id, clean);
  if (kept !== clean) {
    if (!kept) {
      const l = lineText(isQuestion(lastUser) ? DONT_KNOW : (script?.fallback ?? SAFE_LINE), g);
      return { text: l.he, tr: l.tr, fr: l.fr, source: "fallback", flaws: bestFlaws };
    }
    clean = kept;
    bestFlaws = bestFlaws.filter((f) => f !== "rôle inversé");
  }

  // Conversations libres : une question courte de relance (jamais en scène guidée, où l'apprenant pose ses questions).
  if (!script && !clean.includes("?") && lastUser && !signal?.aborted) {
    const q = tidyFollowUp(await complete(llm, { messages: followUpMessages(profile, lastUser, clean), temperature: 0.3, maxTokens: 25 }), g);
    if (q && !said.some((x) => x.includes(q)) && !badQuestions(sc.id, q).length) clean = withFollowUp(clean, q);
  }
  return { text: clean, source: "llm", flaws: bestFlaws };
  }
}

/**
 * Partie d'un message qui pose une autre question que la mission accomplie (« …, אבל יש אוכל במטוס? »), ou null.
 * Le message est coupé aux virgules, points et « אבל » ; un morceau qui ne déclenche aucune des missions et qui est une question est gardé.
 */
export function sideQuestion(raw: string, hits: { detect: (t: string, turn: number) => boolean }[]): string | null {
  const parts = raw.split(/[,.!;]+|\s+אבל\s+|(?<=\?)/).map((x) => x.trim()).filter((x) => flat(x).split(" ").length >= 2);
  if (parts.length < 2) return null;
  const fires = (x: string) => hits.some((m) => m.detect(flat(x), 99));
  // Une autre partie (non interrogative) accomplit déjà la mission : la question est annexe, même si elle contient un mot de la mission
  // (« מזוודה אחת, אפשר לקחת גם תיק יד? »).
  const missionElsewhere = parts.some((x) => !isQuestion(x) && fires(x));
  const q = parts.find((x) => isQuestion(x) && (missionElsewhere || !fires(x)));
  return q ?? null;
}

export { correctionsToWeakPoints };
export type { Correction };
