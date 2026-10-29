import { GOALS, LANGUAGES, SCENARIOS } from "./languages";
import type { Correction, Profile } from "./types";

const LEVEL_STYLE: Record<string, string> = {
  A1: "phrases de 3 à 6 mots, vocabulaire de survie, présent uniquement",
  A2: "phrases courtes et simples, vocabulaire courant",
  B1: "phrases de longueur moyenne, vocabulaire varié",
  B2: "phrases riches, expressions courantes",
  C1: "langage naturel et nuancé",
  C2: "langage natif sans simplification",
};

const str = { type: "string" };
const strArr = { type: "array", items: str };

/** Appel 1 : la réponse parlée, en streaming, texte brut (rapide). */
export function replySystem(p: Profile, scenarioId: string, weak: string[]) {
  const t = LANGUAGES[p.target];
  const sc = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  return `Tu es un partenaire de conversation orale en ${t.name}. Tu incarnes ${sc.role}. But de l'apprenant : ${sc.goal}.
Niveau de l'apprenant : ${p.level} → ${LEVEL_STYLE[p.level]}. ${t.tutorNotes}
Réponds UNIQUEMENT en ${t.name}, en 1 ou 2 phrases courtes (c'est de l'oral), puis pose une question de relance. Reste dans le rôle, réagis à ce que dit l'apprenant, sois naturel. Pas de traduction, pas de commentaire, pas de translittération, pas d'emoji.
Si l'apprenant écrit dans une autre langue, réponds quand même en ${t.name} avec des mots simples.${weak.length ? `\nFais discrètement travailler : ${weak.join(" ; ")}.` : ""}`;
}

export function openingPrompt() {
  return "(Commence la conversation en jouant ton rôle : accueille-moi avec une première phrase et une question.)";
}

/** Appel 2 : analyse en arrière-plan, JSON contraint. */
export const analysisSchema = {
  type: "object",
  properties: {
    transliteration: str,
    translation: str,
    correction: {
      type: "object",
      properties: {
        has_error: { type: "boolean" },
        corrected: str,
        explanation: str,
        natural: str,
        category: { type: "string", enum: ["grammaire", "vocabulaire", "fluidité", "autre"] },
      },
      required: ["has_error", "corrected", "explanation", "natural", "category"],
    },
    newWords: {
      type: "array",
      items: {
        type: "object",
        properties: { word: str, transliteration: str, meaning: str },
        required: ["word", "transliteration", "meaning"],
      },
    },
    suggestions: strArr,
  },
  required: ["transliteration", "translation", "correction", "newWords", "suggestions"],
};

export function analysisSystem(p: Profile) {
  const t = LANGUAGES[p.target];
  const n = LANGUAGES[p.native];
  return `Tu es un professeur de ${t.name} pour un apprenant dont la langue maternelle est : ${n.name}. Niveau : ${p.level}, objectif : ${GOALS[p.goal]}. ${t.tutorNotes}
On te donne le dernier message de l'apprenant (issu d'une reconnaissance vocale : ignore ponctuation et casse) et la réponse du partenaire. Réponds en JSON :
- transliteration : ${t.needsTransliteration ? `transcription latine de la réponse du partenaire, lisible pour un locuteur de ${n.name}` : "chaîne vide"}.
- translation : traduction de la réponse du partenaire en ${n.name}.
- correction : has_error=true UNIQUEMENT s'il y a une vraie erreur (grammaire, genre, vocabulaire, mot absent) dans le message de l'apprenant. Alors corrected = phrase corrigée, explanation = explication courte en ${n.name}, natural = formulation plus naturelle d'un natif, category. Sinon has_error=false et les autres champs vides. N'invente jamais d'erreur.
- newWords : 0 à 3 mots utiles de la réponse du partenaire (word en ${t.name}, translittération, sens en ${n.name}).
- suggestions : 2 réponses courtes en ${t.name} que l'apprenant pourrait dire ensuite.`;
}

/** Aides ponctuelles. */
export const assistSchema = {
  type: "object",
  properties: { result: str, transliteration: str, example: str },
  required: ["result", "transliteration", "example"],
};

export function assistSystem(p: Profile, kind: "translate" | "explain" | "rephrase" | "help") {
  const t = LANGUAGES[p.target];
  const n = LANGUAGES[p.native];
  const task = {
    translate: `Traduis en ${n.name} le texte en ${t.name}. result = traduction. example = "".`,
    explain: `Explique en ${n.name}, brièvement, le sens, la grammaire et l'usage du texte en ${t.name}. result = explication. example = un exemple en ${t.name}.`,
    rephrase: `Reformule le texte en ${t.name} de façon plus naturelle, comme un natif. result = reformulation. example = "".`,
    help: `L'apprenant ne sait pas quoi répondre au message du partenaire (le texte). result = une réponse simple en ${t.name}, adaptée au niveau ${p.level}. example = explication en ${n.name}.`,
  }[kind];
  return `Tu aides un apprenant (langue maternelle : ${n.name}) à apprendre ${t.name}. ${t.tutorNotes}\n${task}\ntransliteration : ${t.needsTransliteration ? `transcription latine du texte en ${t.name} (celui de result si c'est du ${t.name}, sinon du texte donné)` : '""'}.`;
}

/** Rapport de fin de session. */
export const reportSchema = {
  type: "object",
  properties: {
    grammar: { type: "integer" },
    vocabulary: { type: "integer" },
    fluency: { type: "integer" },
    mainErrors: strArr,
    tips: strArr,
    summary: str,
  },
  required: ["grammar", "vocabulary", "fluency", "mainErrors", "tips", "summary"],
};

export function reportSystem(p: Profile, userTurns: number) {
  const t = LANGUAGES[p.target];
  const n = LANGUAGES[p.native];
  return `Tu évalues une session de conversation en ${t.name} (niveau visé ${p.level}) d'après la transcription écrite. Réponds en ${n.name}, en JSON.
grammar, vocabulary, fluency : entiers de 0 à 100 (justesse, richesse du vocabulaire, longueur et enchaînement des réponses). Ne juge JAMAIS la prononciation : tu n'as pas l'audio. L'apprenant n'a fait que ${userTurns} réponse(s) : sois prudent, ne surestime pas.
mainErrors : 1 à 3 types d'erreurs récurrentes. tips : 2 à 3 conseils concrets. summary : 2 phrases honnêtes et encourageantes.`;
}

export function correctionsToWeakPoints(cs: Correction[]): string[] {
  const count = new Map<string, number>();
  for (const c of cs) count.set(c.category, (count.get(c.category) ?? 0) + 1);
  const hints = cs.slice(-6).map((c) => c.explanation).filter(Boolean);
  const cats = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => `erreurs de ${k}`);
  return [...cats.slice(0, 2), ...hints.slice(0, 2)];
}
