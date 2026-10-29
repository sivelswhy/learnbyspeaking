// Ajouter une langue = ajouter une entrée ici (aucun autre code à toucher).
export type LangCode = "he" | "en" | "es" | "fr";

export interface Language {
  code: LangCode;
  name: string; // en français
  native: string;
  speech: string; // BCP-47 pour reconnaissance + synthèse vocale
  rtl: boolean;
  /** Consigne spécifique à la langue pour le tuteur IA. */
  tutorNotes: string;
  needsTransliteration: boolean;
}

export const LANGUAGES: Record<LangCode, Language> = {
  he: {
    code: "he",
    name: "Hébreu",
    native: "עברית",
    speech: "he-IL",
    rtl: true,
    needsTransliteration: true,
    tutorNotes:
      "Hébreu moderne parlé en Israël. Écris l'hébreu avec les voyelles (nikud) pour les niveaux A1-A2, sans nikud ensuite. Donne toujours une translittération latine lisible pour un francophone (ex: « chalom », « toda »). Attention au genre (masculin/féminin) des verbes et adjectifs : corrige-le et explique-le. Signale l'absence de copule au présent.",
  },
  en: {
    code: "en",
    name: "Anglais",
    native: "English",
    speech: "en-US",
    rtl: false,
    needsTransliteration: false,
    tutorNotes: "Anglais courant.",
  },
  es: {
    code: "es",
    name: "Espagnol",
    native: "Español",
    speech: "es-ES",
    rtl: false,
    needsTransliteration: false,
    tutorNotes: "Espagnol courant (Espagne).",
  },
  fr: {
    code: "fr",
    name: "Français",
    native: "Français",
    speech: "fr-FR",
    rtl: false,
    needsTransliteration: false,
    tutorNotes: "Français standard.",
  },
};

// Seules les langues cibles « prêtes » sont proposées. L'hébreu est le focus.
export const TARGET_LANGS: LangCode[] = ["he"];
export const NATIVE_LANGS: LangCode[] = ["fr", "en", "es"];

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

export const GOALS = {
  travel: "Voyage",
  work: "Travail",
  study: "Études",
  daily: "Conversation quotidienne",
} as const;
export type Goal = keyof typeof GOALS;

export interface Scenario {
  id: string;
  emoji: string;
  title: string;
  goal: string;
  role: string; // rôle de l'IA
  opening: string; // situation décrite à l'utilisateur
  difficulty: 1 | 2 | 3;
}

export const SCENARIOS: Scenario[] = [
  { id: "free", emoji: "💬", title: "Discussion libre", goal: "Parler de ce que tu veux", role: "un ami bienveillant qui discute naturellement", opening: "Discute librement avec ton tuteur.", difficulty: 1 },
  { id: "restaurant", emoji: "🍽️", title: "Restaurant", goal: "Commander un repas et demander l'addition", role: "un serveur dans un restaurant de Tel-Aviv", opening: "Tu entres dans un restaurant à Tel-Aviv.", difficulty: 1 },
  { id: "market", emoji: "🛍️", title: "Marché & shopping", goal: "Demander un prix et négocier", role: "un vendeur au marché Carmel", opening: "Tu es au marché Carmel.", difficulty: 1 },
  { id: "meet", emoji: "👋", title: "Rencontres", goal: "Te présenter et faire connaissance", role: "une personne sympathique que l'utilisateur rencontre pour la première fois", opening: "Tu rencontres quelqu'un lors d'une soirée.", difficulty: 1 },
  { id: "hotel", emoji: "🏨", title: "Hôtel", goal: "Enregistrer ta réservation et poser des questions", role: "un réceptionniste d'hôtel", opening: "Tu arrives à la réception de ton hôtel.", difficulty: 2 },
  { id: "airport", emoji: "✈️", title: "Aéroport", goal: "Enregistrement, sécurité, porte d'embarquement", role: "un agent d'enregistrement à l'aéroport Ben Gourion", opening: "Tu es au comptoir d'enregistrement.", difficulty: 2 },
  { id: "taxi", emoji: "🚕", title: "Taxi & transports", goal: "Donner une destination et demander ton chemin", role: "un chauffeur de taxi", opening: "Tu montes dans un taxi.", difficulty: 2 },
  { id: "daily", emoji: "🏠", title: "Vie quotidienne", goal: "Parler de ta journée, de ta famille, de tes habitudes", role: "un voisin curieux et chaleureux", opening: "Tu croises ton voisin dans l'escalier.", difficulty: 2 },
  { id: "study", emoji: "🎓", title: "Études", goal: "Parler de ton cursus et de tes cours", role: "un camarade d'université", opening: "Tu discutes avec un camarade à l'université.", difficulty: 3 },
  { id: "interview", emoji: "💼", title: "Entretien d'embauche", goal: "Présenter ton parcours et tes motivations", role: "un recruteur professionnel", opening: "Tu passes un entretien d'embauche.", difficulty: 3 },
];
