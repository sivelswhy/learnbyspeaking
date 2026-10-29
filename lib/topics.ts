import type { LangCode, Starter } from "./languages";

const T = (m: string, f: string, tm: string, tf: string, fr: string, en: string, es: string): Starter => ({
  text: { m, f },
  transliteration: { m: tm, f: tf },
  translation: { fr, en, es },
});

/** Sujets d'ouverture pour la discussion libre : le tuteur lance un thème au lieu d'un simple « ça va ? ». */
export const TOPICS: Partial<Record<LangCode, { id: string; label: string; starter: Starter }[]>> = {
  he: [
    { id: "food", label: "Nourriture", starter: T("בוא נדבר על אוכל! מה המאכל האהוב עליך?", "בואי נדבר על אוכל! מה המאכל האהוב עלייך?", "Bo nedaber al okhel! Ma ha-ma'akhal ha-ahuv alekha?", "Bo'i nedaber al okhel! Ma ha-ma'akhal ha-ahuv alayikh?", "Parlons de nourriture ! C'est quoi ton plat préféré ?", "Let's talk about food! What's your favourite dish?", "¡Hablemos de comida! ¿Cuál es tu plato favorito?") },
    { id: "weekend", label: "Week-end", starter: T("נדבר על סוף השבוע? מה עשית בשבת?", "נדבר על סוף השבוע? מה עשית בשבת?", "Nedaber al sof hashavua? Ma asita be-shabat?", "Nedaber al sof hashavua? Ma asit be-shabat?", "On parle du week-end ? Qu'est-ce que tu as fait samedi ?", "Shall we talk about the weekend? What did you do on Saturday?", "¿Hablamos del fin de semana? ¿Qué hiciste el sábado?") },
    { id: "travel", label: "Voyages", starter: T("בוא נדבר על טיולים. לאיזו מדינה אתה רוצה לטוס?", "בואי נדבר על טיולים. לאיזו מדינה את רוצה לטוס?", "Bo nedaber al tiyulim. Le-eizo medina ata rotse latus?", "Bo'i nedaber al tiyulim. Le-eizo medina at rotsa latus?", "Parlons voyages. Dans quel pays tu as envie d'aller ?", "Let's talk about travel. Which country do you want to fly to?", "Hablemos de viajes. ¿A qué país quieres viajar?") },
    { id: "music", label: "Musique", starter: T("יש לי שאלה: איזו מוזיקה אתה אוהב?", "יש לי שאלה: איזו מוזיקה את אוהבת?", "Yesh li she'ela: eizo muzika ata ohev?", "Yesh li she'ela: eizo muzika at ohevet?", "J'ai une question : quelle musique tu aimes ?", "I have a question: what music do you like?", "Tengo una pregunta: ¿qué música te gusta?") },
    { id: "family", label: "Famille", starter: T("ספר לי על המשפחה שלך. יש לך אחים?", "ספרי לי על המשפחה שלך. יש לך אחים?", "Saper li al ha-mishpakha shelkha. Yesh lekha akhim?", "Sapri li al ha-mishpakha shelakh. Yesh lakh akhim?", "Parle-moi de ta famille. Tu as des frères et sœurs ?", "Tell me about your family. Do you have siblings?", "Háblame de tu familia. ¿Tienes hermanos?") },
    { id: "morning", label: "Le matin", starter: T("מה אתה שותה בבוקר, קפה או תה?", "מה את שותה בבוקר, קפה או תה?", "Ma ata shote ba-boker, kafe o te?", "Ma at shota ba-boker, kafe o te?", "Tu bois quoi le matin, café ou thé ?", "What do you drink in the morning, coffee or tea?", "¿Qué tomas por la mañana, café o té?") },
    { id: "weather", label: "Météo", starter: T("איך מזג האוויר אצלך היום?", "איך מזג האוויר אצלך היום?", "Eikh mezeg ha-avir etslekha hayom?", "Eikh mezeg ha-avir etslekh hayom?", "Il fait quel temps chez toi aujourd'hui ?", "What's the weather like where you are today?", "¿Qué tiempo hace donde estás hoy?") },
    { id: "hobby", label: "Loisirs", starter: T("מה אתה אוהב לעשות בזמן הפנוי?", "מה את אוהבת לעשות בזמן הפנוי?", "Ma ata ohev la'asot ba-zman ha-panuy?", "Ma at ohevet la'asot ba-zman ha-panuy?", "Qu'est-ce que tu aimes faire pendant ton temps libre ?", "What do you like doing in your free time?", "¿Qué te gusta hacer en tu tiempo libre?") },
  ],
};
