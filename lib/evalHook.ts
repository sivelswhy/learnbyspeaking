"use client";
import { DEFAULT_LLM, complete, isReady, loadWebLLM, yesProbability } from "./llm";
import { nextReply } from "./dialogue";
import { pickGender, replyFlaws, replyShots, replySystem, sceneRole, tidyReply } from "./prompts";
import { badQuestions, dropBadQuestions } from "./scenes";
import { SCENARIOS } from "./languages";
import { SCENES, sceneProgress } from "./scenes";

/** Outils de test exposés à la console (`window.__lbs`) : mesurer la qualité des réponses du modèle sans passer par l'interface. */
export function installEvalHook() {
  (window as unknown as { __lbs: unknown }).__lbs = {
    transcribe: async (audio: Float32Array, lang: string) => (await import("./whisper")).transcribe(audio, lang),
    reviewAnswer: async (...a: Parameters<typeof import("./feedback").reviewAnswer>) => (await import("./feedback")).reviewAnswer(...a),
    DEFAULT_LLM, complete, isReady, loadWebLLM, yesProbability, replySystem, replyShots, replyFlaws, tidyReply, pickGender, sceneRole, nextReply, badQuestions, dropBadQuestions, SCENES, sceneProgress, SCENARIOS,
  };
}
