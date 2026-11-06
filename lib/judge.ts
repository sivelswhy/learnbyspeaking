"use client";
import { complete, hasWebGPU, isCached, isReady, loadWebLLM, yesProbability, type LlmSettings } from "./llm";
import { correctionPrompt, grammarPrompts, hebrewWords, relevancePrompt, type AiJudgement } from "./placement";
import { feminize } from "./sayInHebrew";

/** Jugements déjà faits (modèle, genre, question, réponse) : le bilan de séance ne refait pas ceux de la conversation. */
const judged = new Map<string, AiJudgement>();

/** Demande à l'IA si la réponse répond à la question et si elle est correcte. null si le modèle n'est pas disponible. */
export async function judge(llm: LlmSettings, question: string, answer: string, gender: "m" | "f"): Promise<AiJudgement | null> {
  if (!hebrewWords(answer).length) return null;
  // Même question, même réponse : même avis (température 0), sans refaire les 4 appels au modèle.
  const key = [llm.provider, llm.webllmModel, gender, question, answer].join("\u0001");
  const hit = judged.get(key);
  if (hit) return { ...hit };
  // Test ouvert juste après le démarrage : le modèle déjà sur l'appareil finit de se charger, on l'attend.
  if (!isReady(llm) && llm.provider === "webllm" && hasWebGPU() && (await isCached(llm.webllmModel))) await loadWebLLM(llm.webllmModel).catch(() => {});
  if (!isReady(llm)) {
    console.warn("Notation IA : modèle non chargé, notation par règles");
    return null;
  }
  try {
    const relevance = await yesProbability(llm, relevancePrompt(question, answer));
    const g = grammarPrompts(answer);
    const correct = await yesProbability(llm, g.correct);
    const mistake = await yesProbability(llm, g.mistake);
    let correction = (await complete(llm, { messages: correctionPrompt(answer), temperature: 0, maxTokens: 60 })).split("\n")[0];
    // Les exemples de correction sont surtout au masculin : pour une apprenante, « je » repasse au féminin.
    if (gender === "f") correction = await feminize(llm, correction);
    const r = { relevance, grammar: (correct + 1 - mistake) / 2, correction };
    if (judged.size > 300) judged.clear();
    judged.set(key, r);
    return { ...r };
  } catch (e) {
    console.warn("Notation IA impossible, notation par règles :", e);
    return null;
  }
}


