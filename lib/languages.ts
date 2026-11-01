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
  /** La langue accorde le « tu » selon le genre (hébreu : לך = lekha / lakh). */
  genderedYou: boolean;
}

export const LANGUAGES: Record<LangCode, Language> = {
  he: {
    code: "he",
    name: "Hébreu",
    native: "עברית",
    speech: "he-IL",
    rtl: true,
    needsTransliteration: true,
    genderedYou: true,
    tutorNotes:
      "Hébreu moderne parlé en Israël, registre familier et naturel (comme on parle à Tel-Aviv), sans nikud. Translittération latine simple : kh pour כ/ח, ts pour צ, apostrophe pour א/ע entre voyelles (ex. « Ma nishma? », « Eifo ata gar? », « Toda raba »). Accorde verbes et adjectifs au genre de l'interlocuteur. Au présent il n'y a pas de verbe « être ».",
  },
  en: {
    code: "en",
    name: "Anglais",
    native: "English",
    speech: "en-US",
    rtl: false,
    needsTransliteration: false,
    genderedYou: false,
    tutorNotes: "Anglais courant.",
  },
  es: {
    code: "es",
    name: "Espagnol",
    native: "Español",
    speech: "es-ES",
    rtl: false,
    needsTransliteration: false,
    genderedYou: false,
    tutorNotes: "Espagnol courant (Espagne).",
  },
  fr: {
    code: "fr",
    name: "Français",
    native: "Français",
    speech: "fr-FR",
    rtl: false,
    needsTransliteration: false,
    genderedYou: false,
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
  family: "Famille et amis",
  move: "M'installer en Israël",
} as const;
export type Goal = keyof typeof GOALS;

/** Ce que l'apprenant veut améliorer (choix multiple, après le test de niveau). */
export const FOCUS = {
  speaking: "Oser parler, être fluide",
  listening: "Comprendre à l'oral",
  vocabulary: "Vocabulaire",
  grammar: "Grammaire",
  pronunciation: "Prononciation",
  reading: "Lire l'alphabet",
} as const;
export type Focus = keyof typeof FOCUS;

export type Gender = "m" | "f";

/** Première réplique écrite à la main : fiable, contrairement à un petit modèle local. */
export interface Starter {
  text: Record<Gender, string>;
  transliteration: Record<Gender, string>;
  translation: Partial<Record<LangCode, string>>;
}
const same = (v: string): Record<Gender, string> => ({ m: v, f: v });

export interface Scenario {
  id: string;
  title: string;
  goal: string;
  role: string; // rôle de l'IA
  opening: string; // situation décrite à l'utilisateur
  difficulty: 1 | 2 | 3;
  starters?: Partial<Record<LangCode, Starter>>;
}

const HE: Record<string, Starter> = {
  free: { text: same("שלום! מה נשמע?"), transliteration: same("Shalom! Ma nishma?"), translation: { fr: "Salut ! Comment ça va ?", en: "Hi! How's it going?", es: "¡Hola! ¿Qué tal?" } },
  restaurant: { text: same("ערב טוב, ברוכים הבאים! שולחן לכמה אנשים?"), transliteration: same("Erev tov, brukhim haba'im! Shulkhan le-kama anashim?"), translation: { fr: "Bonsoir, bienvenue ! Une table pour combien de personnes ?", en: "Good evening, welcome! A table for how many?", es: "¡Buenas noches, bienvenidos! ¿Mesa para cuántas personas?" } },
  market: { text: same("בוקר טוב! הכול טרי היום. מה צריך?"), transliteration: same("Boker tov! Hakol tari hayom. Ma tsarikh?"), translation: { fr: "Bonjour ! Tout est frais aujourd'hui. Qu'est-ce qu'il vous faut ?", en: "Good morning! Everything's fresh today. What do you need?", es: "¡Buenos días! Todo está fresco hoy. ¿Qué necesita?" } },
  meet: { text: same("היי, אני נועם. איך קוראים לך?"), transliteration: { m: "Hai, ani No'am. Eikh kor'im lekha?", f: "Hai, ani No'am. Eikh kor'im lakh?" }, translation: { fr: "Salut, moi c'est Noam. Comment tu t'appelles ?", en: "Hi, I'm Noam. What's your name?", es: "Hola, soy Noam. ¿Cómo te llamas?" } },
  hotel: { text: same("שלום, ברוכים הבאים למלון! יש לך הזמנה?"), transliteration: { m: "Shalom, brukhim haba'im la-malon! Yesh lekha hazmana?", f: "Shalom, brukhim haba'im la-malon! Yesh lakh hazmana?" }, translation: { fr: "Bonjour, bienvenue à l'hôtel ! Vous avez une réservation ?", en: "Hello, welcome to the hotel! Do you have a reservation?", es: "¡Hola, bienvenido al hotel! ¿Tiene una reserva?" } },
  airport: { text: same("שלום! אפשר דרכון, בבקשה?"), transliteration: same("Shalom! Efshar darkon, bevakasha?"), translation: { fr: "Bonjour ! Votre passeport, s'il vous plaît ?", en: "Hello! Passport, please?", es: "¡Hola! ¿Su pasaporte, por favor?" } },
  taxi: { text: same("שלום! לאן נוסעים?"), transliteration: same("Shalom! Le'an nos'im?"), translation: { fr: "Bonjour ! On va où ?", en: "Hi! Where are we going?", es: "¡Hola! ¿Adónde vamos?" } },
  daily: { text: same("בוקר טוב! איך היה סוף השבוע?"), transliteration: same("Boker tov! Eikh haya sof hashavua?"), translation: { fr: "Bonjour ! C'était comment, le week-end ?", en: "Good morning! How was the weekend?", es: "¡Buenos días! ¿Qué tal el fin de semana?" } },
  study: { text: same("היי! איזה קורס יש לך עכשיו?"), transliteration: { m: "Hai! Eize kurs yesh lekha akhshav?", f: "Hai! Eize kurs yesh lakh akhshav?" }, translation: { fr: "Salut ! Tu as quel cours maintenant ?", en: "Hey! What class do you have now?", es: "¡Hola! ¿Qué clase tienes ahora?" } },
  interview: { text: { m: "שלום, נעים מאוד. ספר לי קצת על עצמך.", f: "שלום, נעים מאוד. ספרי לי קצת על עצמך." }, transliteration: { m: "Shalom, na'im me'od. Saper li ktsat al atsmekha.", f: "Shalom, na'im me'od. Sapri li ktsat al atsmekh." }, translation: { fr: "Bonjour, enchanté. Parlez-moi un peu de vous.", en: "Hello, nice to meet you. Tell me a bit about yourself.", es: "Hola, encantado. Cuénteme un poco sobre usted." } },
};

export const SCENARIOS: Scenario[] = ([
  { id: "free", title: "Discussion libre", goal: "Parler de ce que tu veux", role: "un ami bienveillant qui discute naturellement", opening: "Discute librement avec ton tuteur.", difficulty: 1 },
  { id: "restaurant", title: "Restaurant", goal: "Commander un repas et demander l'addition", role: "un serveur dans un restaurant de Tel-Aviv", opening: "Tu entres dans un restaurant à Tel-Aviv.", difficulty: 1 },
  { id: "market", title: "Marché & shopping", goal: "Demander un prix et négocier", role: "un vendeur au marché Carmel", opening: "Tu es au marché Carmel.", difficulty: 1 },
  { id: "meet", title: "Rencontres", goal: "Te présenter et faire connaissance", role: "une personne sympathique que l'utilisateur rencontre pour la première fois", opening: "Tu rencontres quelqu'un lors d'une soirée.", difficulty: 1 },
  { id: "hotel", title: "Hôtel", goal: "Enregistrer ta réservation et poser des questions", role: "un réceptionniste d'hôtel", opening: "Tu arrives à la réception de ton hôtel.", difficulty: 2 },
  { id: "airport", title: "Aéroport", goal: "Enregistrement, sécurité, porte d'embarquement", role: "un agent d'enregistrement à l'aéroport Ben Gourion", opening: "Tu es au comptoir d'enregistrement.", difficulty: 2 },
  { id: "taxi", title: "Taxi & transports", goal: "Donner une destination et demander ton chemin", role: "un chauffeur de taxi", opening: "Tu montes dans un taxi.", difficulty: 2 },
  { id: "daily", title: "Vie quotidienne", goal: "Parler de ta journée, de ta famille, de tes habitudes", role: "un voisin curieux et chaleureux", opening: "Tu croises ton voisin dans l'escalier.", difficulty: 2 },
  { id: "study", title: "Études", goal: "Parler de ton cursus et de tes cours", role: "un camarade d'université", opening: "Tu discutes avec un camarade à l'université.", difficulty: 3 },
  { id: "interview", title: "Entretien d'embauche", goal: "Présenter ton parcours et tes motivations", role: "un recruteur professionnel", opening: "Tu passes un entretien d'embauche.", difficulty: 3 },
] satisfies Omit<Scenario, "starters">[]).map((sc): Scenario => ({ ...sc, starters: { he: HE[sc.id] } }));
