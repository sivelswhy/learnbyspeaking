import type { Gender, Level, Starter } from "../languages";

/** Parcours de cours en hébreu. Contenu écrit à la main. Formes m/f = genre de l'apprenant. */
type G = Record<Gender, string>;
const s = (v: string): G => ({ m: v, f: v });
const g = (m: string, f: string): G => ({ m, f });

export interface Line { he: G; tr: G; fr: string }
/** Étapes d'une journée d'entraînement.
 *  - intro : Shuli explique (français).
 *  - repeat : écoute puis répète.
 *  - answer : une question, la réponse modèle est donnée en aide.
 *  - listen : compréhension, Shuli dit une phrase sans l'écrire, l'apprenant choisit son sens (pas de micro).
 *  - fill : phrase à trou, l'apprenant dit la phrase entière de mémoire.
 *  - free : question ouverte, l'apprenant répond avec ses vraies infos (l'exemple n'est qu'une aide).
 *  - swap : transformer une phrase (changer de genre, de mot) et la dire. */
export type Step =
  | { kind: "intro"; fr: string }
  | { kind: "repeat"; line: Line }
  | { kind: "answer"; q: Line; a: Line }
  | { kind: "listen"; say: Line; ask: string; options: { fr: string; ok?: boolean }[] }
  | { kind: "fill"; line: Line; blank: { he: G; tr: G } }
  | { kind: "free"; q: Line; example: Line }
  | { kind: "swap"; instr: string; from: Line; to: Line };

/** Toutes les phrases d'une étape (pour le vocabulaire, la recherche « Comment dire… ? »). */
export function linesOf(s: Step): Line[] {
  switch (s.kind) {
    case "repeat": case "fill": return [s.line];
    case "answer": return [s.q, s.a];
    case "listen": return [s.say];
    case "free": return [s.q, s.example];
    case "swap": return [s.from, s.to];
    default: return [];
  }
}

/** Phrases à retenir d'un jour (clé, phrases répétées, trous, réponses modèles) : elles entrent dans les cartes de révision espacée. */
export function dayCards(day: Day): Line[] {
  const out: Line[] = [day.key];
  for (const s of day.steps) {
    if (s.kind === "repeat" || s.kind === "fill") out.push(s.line);
    else if (s.kind === "answer") out.push(s.a);
    else if (s.kind === "swap") out.push(s.to);
  }
  const seen = new Set<string>();
  return out.filter((l) => (seen.has(l.fr) ? false : (seen.add(l.fr), true)));
}

/** Phrase à trou : le mot caché devient « ___ » (hébreu et translittération). */
export function blanked(line: Line, blank: { he: G; tr: G }, gender: Gender): { he: string; tr: string } {
  const cut = (text: string, word: string) => (word && text.includes(word) ? text.replace(word, "___") : text);
  return { he: cut(line.he[gender], blank.he[gender]), tr: cut(line.tr[gender], blank.tr[gender]) };
}

export interface Day {
  id: string;
  title: string;
  key: Line;
  steps: Step[];
  scenario: { role: string; goal: string; starter: Starter };
}
export interface Unit { id: string; title: string; days: Day[] }
export interface CourseLevel { id: string; title: string; cefr: Level; units: Unit[] }

const L = (he: G | string, tr: G | string, fr: string): Line => ({
  he: typeof he === "string" ? s(he) : he,
  tr: typeof tr === "string" ? s(tr) : tr,
  fr,
});
const intro = (fr: string): Step => ({ kind: "intro", fr });
const rep = (line: Line): Step => ({ kind: "repeat", line });
const ask = (q: Line, a: Line): Step => ({ kind: "answer", q, a });
/** Compréhension : la bonne réponse d'abord, puis les mauvaises (l'ordre est mélangé à l'affichage). */
const listen = (say: Line, ask: string, good: string, ...bad: string[]): Step => ({ kind: "listen", say, ask, options: [{ fr: good, ok: true }, ...bad.map((fr) => ({ fr }))] });
const fill = (line: Line, he: G | string, tr: G | string): Step => ({ kind: "fill", line, blank: { he: typeof he === "string" ? s(he) : he, tr: typeof tr === "string" ? s(tr) : tr } });
const free = (q: Line, example: Line): Step => ({ kind: "free", q, example });
const swap = (instr: string, from: Line, to: Line): Step => ({ kind: "swap", instr, from, to });
const st = (l: Line): Starter => ({ text: l.he, transliteration: l.tr, translation: { fr: l.fr } });

const day = (id: string, title: string, key: Line, steps: Step[], role: string, goal: string, starter: Line): Day => ({
  id, title, key, steps: [...steps, intro("Bravo ! Passe au jeu de rôle pour l'utiliser en vraie conversation.")], scenario: { role, goal, starter: st(starter) },
});

export const COURSE: CourseLevel[] = [
  {
    id: "beg1", title: "Débutant 1", cefr: "A1",
    units: [
      {
        id: "u0", title: "Survie",
        days: [
          day("u0d1", "Je ne comprends pas", L(g("אני לא מבין", "אני לא מבינה"), g("Ani lo mevin", "Ani lo mevina"), "Je ne comprends pas"), [
            intro("Avant de parler, apprends à te tirer d'affaire. Dire « je ne comprends pas » n'est pas une honte : les Israéliens parlent vite, tout le monde le dit."),
            rep(L(g("אני לא מבין", "אני לא מבינה"), g("Ani lo mevin", "Ani lo mevina"), "Je ne comprends pas")),
            rep(L("לאט, בבקשה", "Le'at, bevakasha", "Lentement, s'il te plaît")),
            rep(L("עוד פעם, בבקשה", "Od pa'am, bevakasha", "Encore une fois, s'il te plaît")),
            listen(L(g("אתה מדבר אנגלית?", "את מדברת אנגלית?"), g("Ata medaber anglit?", "At medaberet anglit?"), "Tu parles anglais ?"), "Que te demande-t-on ?", "Si tu parles anglais", "Où est l'arrêt de bus", "Comment tu t'appelles", "Quelle heure il est"),
            ask(L(g("אתה מדבר עברית?", "את מדברת עברית?"), g("Ata medaber ivrit?", "At medaberet ivrit?"), "Tu parles hébreu ?"), L(g("אני מדבר קצת עברית", "אני מדברת קצת עברית"), g("Ani medaber ktsat ivrit", "Ani medaberet ktsat ivrit"), "Je parle un peu hébreu")),
            swap("Dis-le avec « lentement » à la place de « encore une fois ».", L("עוד פעם, בבקשה", "Od pa'am, bevakasha", "Encore une fois, s'il te plaît"), L("לאט, בבקשה", "Le'at, bevakasha", "Lentement, s'il te plaît")),
          ], "un passant pressé qui parle très vite", "Dire que tu ne comprends pas et demander de répéter plus lentement", L(g("סליחה, אתה יודע איפה התחנה? אני ממהרת!", "סליחה, את יודעת איפה התחנה? אני ממהרת!"), g("Slikha, ata yode'a eifo ha-takhana? Ani memaheret!", "Slikha, at yoda'at eifo ha-takhana? Ani memaheret!"), "Pardon, tu sais où est l'arrêt ? Je suis pressée !")),
          day("u0d2", "Comment dit-on… ?", L("איך אומרים … בעברית?", "Eikh omrim … be-ivrit?", "Comment dit-on … en hébreu ?"), [
            intro("Cette phrase vaut de l'or : « eikh omrim … be-ivrit ? ». Avec elle, tu peux apprendre n'importe quel mot sur le terrain."),
            rep(L("איך אומרים … בעברית?", "Eikh omrim … be-ivrit?", "Comment dit-on … en hébreu ?")),
            rep(L("מה זה אומר?", "Ma ze omer?", "Qu'est-ce que ça veut dire ?")),
            rep(L("איך כותבים את זה?", "Eikh kotvim et ze?", "Comment ça s'écrit ?")),
            listen(L("זה אומר מים", "Ze omer mayim", "Ça veut dire « eau »"), "Que t'explique-t-on ?", "Ça veut dire « eau »", "Ça veut dire « pain »", "Ça veut dire « café »", "Ça veut dire « maison »"),
            ask(L(g("אתה מבין?", "את מבינה?"), g("Ata mevin?", "At mevina?"), "Tu comprends ?"), L("לא, לא הבנתי. עוד פעם, בבקשה", "Lo, lo hevanti. Od pa'am, bevakasha", "Non, je n'ai pas compris. Encore une fois, s'il te plaît")),
            fill(L("איך אומרים … בעברית?", "Eikh omrim … be-ivrit?", "Comment dit-on … en hébreu ?"), "אומרים", "omrim"),
          ], "un chauffeur de bus qui t'explique le trajet", "Demander de répéter et de traduire un mot", L("זה אוטובוס מספר ארבע, ויורדים בתחנה השלישית.", "Ze otobus mispar arba, ve-yordim ba-takhana ha-shlishit.", "C'est le bus numéro quatre, et on descend au troisième arrêt.")),
          day("u0d3", "Toilettes et aide", L("איפה השירותים?", "Eifo ha-sherutim?", "Où sont les toilettes ?"), [
            intro("Trois besoins de base : les toilettes, de l'aide, et un merci poli. « Sherutim » veut dire « services », donc toilettes."),
            rep(L("איפה השירותים?", "Eifo ha-sherutim?", "Où sont les toilettes ?")),
            rep(L(g("אני צריך עזרה", "אני צריכה עזרה"), g("Ani tsarikh ezra", "Ani tsrikha ezra"), "J'ai besoin d'aide")),
            rep(L(g("אתה יכול לעזור לי?", "את יכולה לעזור לי?"), g("Ata yakhol la'azor li?", "At yekhola la'azor li?"), "Tu peux m'aider ?")),
            rep(L("אין בעיה", "Ein be'aya", "Pas de problème")),
            listen(L("השירותים בקומה למעלה", "Ha-sherutim ba-koma lemala", "Les toilettes sont à l'étage"), "Que t'indique-t-on ?", "Les toilettes sont à l'étage", "Les toilettes sont à droite", "Le café est fermé", "Il n'y a pas de toilettes"),
            ask(L("אפשר לעזור?", "Efshar la'azor?", "Je peux vous aider ?"), L("כן, איפה השירותים?", "Ken, eifo ha-sherutim?", "Oui, où sont les toilettes ?")),
            fill(L(g("אני צריך עזרה", "אני צריכה עזרה"), g("Ani tsarikh ezra", "Ani tsrikha ezra"), "J'ai besoin d'aide"), "עזרה", "ezra"),
          ], "une employée à l'accueil d'un centre commercial", "Demander les toilettes et de l'aide", L("שלום וברוכים הבאים! במה אפשר לעזור?", "Shalom u-vruchim ha-ba'im! Ba-me efshar la'azor?", "Bonjour et bienvenue ! En quoi puis-je vous aider ?")),
        ],
      },
      {
        id: "u1", title: "Se présenter",
        days: [
          day("u1d1", "Bonjour !", L("שלום! מה נשמע?", "Shalom! Ma nishma?", "Salut ! Ça va ?"), [
            intro("En Israël, on dit « shalom » pour bonjour et pour au revoir. Répète après moi."),
            rep(L("שלום", "Shalom", "Bonjour")),
            rep(L("מה נשמע?", "Ma nishma?", "Ça va ?")),
            ask(L("מה נשמע?", "Ma nishma?", "Ça va ?"), L("הכול בסדר, תודה!", "Hakol beseder, toda!", "Tout va bien, merci !")),
            intro("Pour renvoyer la question, « et toi ? » change selon la personne : « ve-ata » à un homme, « ve-at » à une femme."),
            rep(L("ואתה?", "Ve-ata?", "Et toi ? (à un homme)")),
            rep(L("ואת?", "Ve-at?", "Et toi ? (à une femme)")),
            rep(L("בוקר טוב", "Boker tov", "Bonjour (le matin)")),
            rep(L("ערב טוב", "Erev tov", "Bonsoir")),
            rep(L("להתראות", "Lehitra'ot", "Au revoir")),
            listen(L("ערב טוב", "Erev tov", "Bonsoir"), "À quel moment de la journée ?", "Le soir", "Le matin", "La nuit", "Midi"),
            swap("Dis bonsoir au lieu de bonjour.", L("בוקר טוב", "Boker tov", "Bonjour"), L("ערב טוב", "Erev tov", "Bonsoir")),
            fill(L("הכול בסדר, תודה!", "Hakol beseder, toda!", "Tout va bien, merci !"), "בסדר", "beseder"),
            free(L("מה נשמע?", "Ma nishma?", "Ça va ?"), L("לא רע, תודה!", "Lo ra, toda!", "Pas mal, merci !")),
          ], "un voisin sympathique que tu croises le matin", "Saluer et demander comment ça va", L("בוקר טוב! מה נשמע?", "Boker tov! Ma nishma?", "Bonjour ! Ça va ?")),
          day("u1d2", "Je m'appelle…", L("קוראים לי…", "Kor'im li…", "Je m'appelle…"), [
            intro("Pour dire ton prénom, on dit « kor'im li », littéralement « on m'appelle ». Remplace Dana par ton prénom."),
            rep(L("קוראים לי…", "Kor'im li…", "Je m'appelle…")),
            free(L("איך קוראים לך?", g("Eikh kor'im lekha?", "Eikh kor'im lakh?"), "Comment tu t'appelles ?"), L("קוראים לי דנה", "Kor'im li Dana", "Je m'appelle Dana")),
            rep(L("נעים מאוד!", "Na'im me'od!", "Enchanté(e) !")),
            rep(L("ואיך קוראים לך?", "Ve-eikh kor'im lakh?", "Et toi, comment tu t'appelles ? (à une femme)")),
            rep(L("היי, אני דנה", "Hai, ani Dana", "Salut, moi c'est Dana")),
            rep(L("נעים להכיר", "Na'im lehakir", "Ravi de te rencontrer")),
            listen(L("איך קוראים לך?", g("Eikh kor'im lekha?", "Eikh kor'im lakh?"), "Comment tu t'appelles ?"), "Que te demande-t-on ?", "Ton prénom", "Ton âge", "Ta ville", "Ton métier"),
            fill(L("נעים מאוד!", "Na'im me'od!", "Enchanté(e) !"), "נעים", "Na'im"),
            swap("Présente-toi avec « ani » au lieu de « kor'im li ».", L("קוראים לי דנה", "Kor'im li Dana", "Je m'appelle Dana"), L("אני דנה", "Ani Dana", "Moi, c'est Dana")),
          ], "une personne que tu rencontres à une soirée", "Te présenter", L("היי! אני דנה. איך קוראים לך?", g("Hai! Ani Dana. Eikh kor'im lekha?", "Hai! Ani Dana. Eikh kor'im lakh?"), "Salut ! Moi c'est Dana. Comment tu t'appelles ?")),
          day("u1d3", "D'où viens-tu ?", L("אני מצרפת", "Ani mi-Tsarfat", "Je viens de France"), [
            intro("Pour dire d'où tu viens : « ani » puis la lettre mem, qui veut dire « de », collée au pays."),
            rep(L("אני מצרפת", "Ani mi-Tsarfat", "Je viens de France")),
            rep(L("אני מבלגיה", "Ani mi-Belgya", "Je viens de Belgique")),
            ask(L(g("מאיפה אתה?", "מאיפה את?"), g("Me'eifo ata?", "Me'eifo at?"), "Tu viens d'où ?"), L("אני מצרפת", "Ani mi-Tsarfat", "Je viens de France")),
            rep(L("ואת, מאיפה את?", "Ve-at, me'eifo at?", "Et toi, tu viens d'où ? (à une femme)")),
            rep(L("אני מישראל", "Ani mi-Israel", "Je viens d'Israël")),
            rep(L("אני מאיטליה", "Ani me-Italya", "Je viens d'Italie")),
            rep(L("אני מספרד", "Ani mi-Sfarad", "Je viens d'Espagne")),
            listen(L("מאיפה אתה?", g("Me'eifo ata?", "Me'eifo at?"), "Tu viens d'où ?"), "Que te demande-t-on ?", "D'où tu viens", "Où tu habites", "Où tu vas", "Ce que tu veux"),
            fill(L("אני מצרפת", "Ani mi-Tsarfat", "Je viens de France"), "מצרפת", "mi-Tsarfat"),
            swap("Dis que tu viens d'Italie.", L("אני מצרפת", "Ani mi-Tsarfat", "Je viens de France"), L("אני מאיטליה", "Ani me-Italya", "Je viens d'Italie")),
            free(L(g("מאיפה אתה?", "מאיפה את?"), g("Me'eifo ata?", "Me'eifo at?"), "Tu viens d'où ?"), L("אני מצרפת", "Ani mi-Tsarfat", "Je viens de France")),
          ], "un voyageur rencontré dans une auberge de jeunesse", "Dire d'où tu viens et demander d'où il vient", L(g("היי! מאיפה אתה?", "היי! מאיפה את?"), g("Hai! Me'eifo ata?", "Hai! Me'eifo at?"), "Salut ! Tu viens d'où ?")),
          day("u1d4", "J'habite à…", L(g("אני גר בפריז", "אני גרה בפריז"), g("Ani gar be-Pariz", "Ani gara be-Pariz"), "J'habite à Paris"), [
            intro("Le verbe habiter change selon ton genre : « gar » pour un homme, « gara » pour une femme."),
            rep(L(g("אני גר בפריז", "אני גרה בפריז"), g("Ani gar be-Pariz", "Ani gara be-Pariz"), "J'habite à Paris")),
            rep(L(g("אני גר בתל אביב", "אני גרה בתל אביב"), g("Ani gar be-Tel Aviv", "Ani gara be-Tel Aviv"), "J'habite à Tel-Aviv")),
            ask(L(g("איפה אתה גר?", "איפה את גרה?"), g("Eifo ata gar?", "Eifo at gara?"), "Tu habites où ?"), L(g("אני גר בפריז", "אני גרה בפריז"), g("Ani gar be-Pariz", "Ani gara be-Pariz"), "J'habite à Paris")),
            rep(L("ואת, איפה את גרה?", "Ve-at, eifo at gara?", "Et toi, tu habites où ? (à une femme)")),
            rep(L(g("אני גר ליד הים", "אני גרה ליד הים"), g("Ani gar leyad ha-yam", "Ani gara leyad ha-yam"), "J'habite près de la mer")),
            rep(L(g("אני גר עם חברים", "אני גרה עם חברים"), g("Ani gar im khaverim", "Ani gara im khaverim"), "J'habite avec des amis")),
            listen(L(g("איפה אתה גר?", "איפה את גרה?"), g("Eifo ata gar?", "Eifo at gara?"), "Tu habites où ?"), "Que te demande-t-on ?", "Où tu habites", "D'où tu viens", "Ce que tu fais", "Comment tu t'appelles"),
            fill(L(g("אני גר בפריז", "אני גרה בפריז"), g("Ani gar be-Pariz", "Ani gara be-Pariz"), "J'habite à Paris"), "בפריז", "be-Pariz"),
            swap("Dis que tu habites à Tel-Aviv.", L(g("אני גר בפריז", "אני גרה בפריז"), g("Ani gar be-Pariz", "Ani gara be-Pariz"), "J'habite à Paris"), L(g("אני גר בתל אביב", "אני גרה בתל אביב"), g("Ani gar be-Tel Aviv", "Ani gara be-Tel Aviv"), "J'habite à Tel-Aviv")),
            free(L(g("איפה אתה גר?", "איפה את גרה?"), g("Eifo ata gar?", "Eifo at gara?"), "Tu habites où ?"), L(g("אני גר בפריז", "אני גרה בפריז"), g("Ani gar be-Pariz", "Ani gara be-Pariz"), "J'habite à Paris")),
          ], "un nouveau collègue curieux", "Dire où tu habites", L(g("איפה אתה גר?", "איפה את גרה?"), g("Eifo ata gar?", "Eifo at gara?"), "Tu habites où ?")),
          day("u1d5", "Dire non", L("לא, תודה", "Lo, toda", "Non, merci"), [
            intro("Pour refuser, mets « lo » juste avant le verbe : « ani lo rotse », je ne veux pas. « Lo, toda » suffit pour dire non poliment."),
            rep(L("לא, תודה", "Lo, toda", "Non, merci")),
            rep(L("אני לא רוצה", g("Ani lo rotse", "Ani lo rotsa"), "Je ne veux pas")),
            rep(L(g("אני לא יודע", "אני לא יודעת"), g("Ani lo yode'a", "Ani lo yoda'at"), "Je ne sais pas")),
            rep(L("זה לא נכון", "Ze lo nakhon", "Ce n'est pas vrai")),
            listen(L(g("אתה רוצה לקנות?", "את רוצה לקנות?"), g("Ata rotse liknot?", "At rotsa liknot?"), "Tu veux acheter ?"), "Que te demande-t-on ?", "Si tu veux acheter", "Si tu as faim", "Où tu habites", "Comment tu t'appelles"),
            ask(L(g("אתה רוצה לקנות?", "את רוצה לקנות?"), g("Ata rotse liknot?", "At rotsa liknot?"), "Tu veux acheter ?"), L("לא, תודה", "Lo, toda", "Non, merci")),
            swap("Mets la phrase à la forme négative.", L("אני רוצה", g("Ani rotse", "Ani rotsa"), "Je veux"), L("אני לא רוצה", g("Ani lo rotse", "Ani lo rotsa"), "Je ne veux pas")),
          ], "un vendeur insistant dans la rue", "Refuser poliment", L(g("היי! בוא, בוא, יש מבצע!", "היי! בואי, בואי, יש מבצע!"), g("Hai! Bo, bo, yesh mivtsa!", "Hai! Bo'i, bo'i, yesh mivtsa!"), "Hé ! Viens, viens, il y a une promo !")),
          day("u1d6", "Réponses de tous les jours", L("סבבה", "Sababa", "Cool, ça marche"), [
            intro("Les Israéliens répondent rarement « hakol beseder » à « ma nishma ? ». Ils disent « sababa » (cool), « beseder » (ça va), « lo ra » (pas mal), « ahla » (super)."),
            rep(L("סבבה", "Sababa", "Cool, ça marche")),
            rep(L("אחלה", "Ahla", "Super")),
            rep(L("לא רע", "Lo ra", "Pas mal")),
            rep(L("יאללה", "Yalla", "Allez, on y va")),
            listen(L("אחלה", "Ahla", "Super"), "Comment va cette personne ?", "Très bien", "Mal", "Fatiguée", "Pressée"),
            swap("Réponds autrement : dis que ça va « pas mal ».", L("סבבה", "Sababa", "Cool"), L("לא רע", "Lo ra", "Pas mal")),
            free(L("מה נשמע?", "Ma nishma?", "Ça va ?"), L("אחלה, תודה!", "Ahla, toda!", "Super, merci !")),
          ], "un ami qui te croise dans la rue", "Répondre naturellement à « ça va ? » de plusieurs façons", L("היי! מה העניינים?", "Hai! Ma ha-inyanim?", "Salut ! Quoi de neuf ?")),
        ],
      },
      {
        id: "u2", title: "Au café",
        days: [
          day("u2d1", "Commander", L("אני רוצה קפה, בבקשה", g("Ani rotse kafe, bevakasha", "Ani rotsa kafe, bevakasha"), "Je voudrais un café, s'il te plaît"), [
            intro("Pour commander, on utilise « vouloir » : rotse pour un homme, rotsa pour une femme. Ça s'écrit pareil."),
            rep(L("אני רוצה קפה, בבקשה", g("Ani rotse kafe, bevakasha", "Ani rotsa kafe, bevakasha"), "Je voudrais un café, s'il te plaît")),
            rep(L("קפה הפוך", "Kafe hafukh", "Un café au lait (un « hafoukh »)")),
            ask(L(g("מה אתה רוצה?", "מה את רוצה?"), g("Ma ata rotse?", "Ma at rotsa?"), "Qu'est-ce que tu veux ?"), L("אני רוצה תה, בבקשה", g("Ani rotse te, bevakasha", "Ani rotsa te, bevakasha"), "Je voudrais un thé, s'il te plaît")),
            rep(L("ועוגה, בבקשה", "Ve-uga, bevakasha", "Et un gâteau, s'il te plaît")),
            rep(L("אפשר מים, בבקשה?", "Efshar mayim, bevakasha?", "Je peux avoir de l'eau, s'il vous plaît ?")),
            rep(L("אני אקח תה", "Ani ekakh te", "Je prends un thé")),
            listen(L(g("מה תרצה?", "מה תרצי?"), g("Ma tirtse?", "Ma tirtsi?"), "Qu'est-ce que tu veux ?"), "Que te demande le serveur ?", "Ce que tu veux boire ou manger", "Combien ça coûte", "Où tu habites", "Quelle heure il est"),
            fill(L("אני רוצה קפה, בבקשה", g("Ani rotse kafe, bevakasha", "Ani rotsa kafe, bevakasha"), "Je voudrais un café, s'il te plaît"), "קפה", "kafe"),
            swap("Commande un thé au lieu d'un café.", L("אני רוצה קפה, בבקשה", g("Ani rotse kafe, bevakasha", "Ani rotsa kafe, bevakasha"), "Je voudrais un café"), L("אני רוצה תה, בבקשה", g("Ani rotse te, bevakasha", "Ani rotsa te, bevakasha"), "Je voudrais un thé")),
            free(L(g("מה אתה רוצה?", "מה את רוצה?"), g("Ma ata rotse?", "Ma at rotsa?"), "Qu'est-ce que tu veux ?"), L("אני רוצה תה, בבקשה", g("Ani rotse te, bevakasha", "Ani rotsa te, bevakasha"), "Je voudrais un thé, s'il te plaît")),
          ], "un serveur dans un café de Tel-Aviv", "Commander une boisson et quelque chose à manger", L(g("שלום! מה תרצה?", "שלום! מה תרצי?"), g("Shalom! Ma tirtse?", "Shalom! Ma tirtsi?"), "Bonjour ! Qu'est-ce que vous désirez ?")),
          day("u2n1", "Compter", L("אחת, שתיים, שלוש", "Akhat, shtayim, shalosh", "Un, deux, trois"), [
            intro("Pour compter « dans l'abstrait » (numéros, prix, heure), on dit akhat, shtayim, shalosh. Répète après moi."),
            rep(L("אחת, שתיים, שלוש, ארבע, חמש", "Akhat, shtayim, shalosh, arba, khamesh", "Un, deux, trois, quatre, cinq")),
            rep(L("שש, שבע, שמונה, תשע, עשר", "Shesh, sheva, shmone, tesha, eser", "Six, sept, huit, neuf, dix")),
            listen(L("שמונה", "Shmone", "Huit"), "Quel nombre entends-tu ?", "Huit", "Trois", "Cinq", "Neuf"),
            intro("Pour compter des objets, on change un peu : un seul, le nombre vient après (« kafe ekhad »). Plusieurs, le nombre vient avant (« shtei ugot », deux gâteaux)."),
            rep(L("קפה אחד, בבקשה", "Kafe ekhad, bevakasha", "Un café, s'il te plaît")),
            rep(L("שתי עוגות, בבקשה", "Shtei ugot, bevakasha", "Deux gâteaux, s'il te plaît")),
            rep(L("שלושה קפה, בבקשה", "Shlosha kafe, bevakasha", "Trois cafés, s'il te plaît")),
            ask(L("כמה קפה?", "Kama kafe?", "Combien de cafés ?"), L("שני קפה, בבקשה", "Shnei kafe, bevakasha", "Deux cafés, s'il te plaît")),
            fill(L("שלושה קפה, בבקשה", "Shlosha kafe, bevakasha", "Trois cafés, s'il te plaît"), "שלושה", "Shlosha"),
          ], "un serveur de café pressé", "Commander plusieurs boissons et gâteaux en donnant les quantités", L("שלום! כמה קפה?", "Shalom! Kama kafe?", "Bonjour ! Combien de cafés ?")),
          day("u2n2", "Il y a, il n'y a pas", L("יש קפה?", "Yesh kafe?", "Il y a du café ?"), [
            intro("« Yesh » veut dire « il y a », « ein » veut dire « il n'y a pas ». Avec « li » (à moi), ça donne « j'ai » et « je n'ai pas » : yesh li, ein li."),
            rep(L("יש קפה?", "Yesh kafe?", "Il y a du café ?")),
            rep(L("אין קפה", "Ein kafe", "Il n'y a pas de café")),
            rep(L("יש לי זמן", "Yesh li zman", "J'ai du temps")),
            rep(L("אין לי זמן", "Ein li zman", "Je n'ai pas le temps")),
            listen(L("אין חלב", "Ein khalav", "Il n'y a pas de lait"), "Que te dit-on ?", "Il n'y a pas de lait", "Il y a du lait", "Le lait est cher", "Je voudrais du lait"),
            ask(L("יש לך זמן?", g("Yesh lekha zman?", "Yesh lakh zman?"), "Tu as du temps ?"), L("אין לי זמן עכשיו", "Ein li zman akhshav", "Je n'ai pas le temps maintenant")),
            swap("Dis le contraire : « il y a » devient « il n'y a pas ».", L("יש לי זמן", "Yesh li zman", "J'ai du temps"), L("אין לי זמן", "Ein li zman", "Je n'ai pas le temps")),
          ], "un serveur qui énumère le menu", "Demander ce qu'il y a et dire ce que tu n'as pas", L(g("יש לנו קפה, תה ולימונדה. מה תרצה?", "יש לנו קפה, תה ולימונדה. מה תרצי?"), g("Yesh lanu kafe, te ve-limonada. Ma tirtse?", "Yesh lanu kafe, te ve-limonada. Ma tirtsi?"), "On a du café, du thé et de la limonade. Qu'est-ce que tu veux ?")),
          day("u2n3", "Les dizaines", L("עשרים שקל", "Esrim shekel", "Vingt shekels"), [
            intro("Pour les prix, apprends les dizaines : esrim (20), shloshim (30), arba'im (40), khamishim (50), me'a (100). À l'oral, « shekel » reste au singulier."),
            rep(L("עשרים שקל", "Esrim shekel", "Vingt shekels")),
            rep(L("שלושים וחמש שקל", "Shloshim ve-khamesh shekel", "Trente-cinq shekels")),
            rep(L("חמישים שקל", "Khamishim shekel", "Cinquante shekels")),
            rep(L("מאה שקל", "Me'a shekel", "Cent shekels")),
            listen(L("ארבעים שקל", "Arba'im shekel", "Quarante shekels"), "Combien ça coûte ?", "Quarante shekels", "Quatorze shekels", "Quatre shekels", "Quatre-vingts shekels"),
            ask(L("כמה זה עולה?", "Kama ze ole?", "Combien ça coûte ?"), L("חמישים שקל", "Khamishim shekel", "Cinquante shekels")),
            fill(L("שלושים וחמש שקל", "Shloshim ve-khamesh shekel", "Trente-cinq shekels"), "שלושים", "Shloshim"),
          ], "un vendeur de souvenirs au marché", "Demander un prix et comprendre le montant", L("שלום! הכול במבצע. זה עולה שלושים שקל.", "Shalom! Ha-kol ba-mivtsa. Ze ole shloshim shekel.", "Bonjour ! Tout est en promo. Ça coûte trente shekels.")),
          day("u2d2", "Combien ça coûte ?", L("כמה זה עולה?", "Kama ze ole?", "Combien ça coûte ?"), [
            intro("Pour demander un prix : « kama ze ole ». La monnaie est le shekel."),
            rep(L("כמה זה עולה?", "Kama ze ole?", "Combien ça coûte ?")),
            rep(L("זה יקר", "Ze yakar", "C'est cher")),
            rep(L("זה זול", "Ze zol", "Ce n'est pas cher")),
            ask(L("זה עשרים שקל. בסדר?", "Ze esrim shekel. Beseder?", "C'est vingt shekels. D'accord ?"), L("כן, בסדר. תודה!", "Ken, beseder. Toda!", "Oui, d'accord. Merci !")),
            rep(L("זה יקר מדי", "Ze yakar midai", "C'est trop cher")),
            rep(L("יש משהו יותר זול?", "Yesh mashehu yoter zol?", "Il y a quelque chose de moins cher ?")),
            listen(L("זה זול", "Ze zol", "Ce n'est pas cher"), "Que dit le vendeur ?", "Ce n'est pas cher", "C'est trop cher", "C'est gratuit", "C'est fermé"),
            swap("Dis que c'est cher, pas bon marché.", L("זה זול", "Ze zol", "Ce n'est pas cher"), L("זה יקר", "Ze yakar", "C'est cher")),
            fill(L("כמה זה עולה?", "Kama ze ole?", "Combien ça coûte ?"), "כמה", "Kama"),
          ], "un vendeur au marché Carmel", "Demander les prix et acheter des fruits", L("בוקר טוב! יש תפוחים טריים. כמה לשים?", "Boker tov! Yesh tapukhim triyim. Kama lasim?", "Bonjour ! Il y a des pommes fraîches. J'en mets combien ?")),
          day("u2d3", "J'ai faim", L(g("אני רעב", "אני רעבה"), g("Ani ra'ev", "Ani re'eva"), "J'ai faim"), [
            intro("En hébreu, on dit « je suis affamé » : ra'ev pour un homme, re'eva pour une femme. Pareil pour la soif."),
            rep(L(g("אני רעב", "אני רעבה"), g("Ani ra'ev", "Ani re'eva"), "J'ai faim")),
            rep(L(g("אני צמא", "אני צמאה"), g("Ani tsame", "Ani tsme'a"), "J'ai soif")),
            ask(L(g("אתה רעב?", "את רעבה?"), g("Ata ra'ev?", "At re'eva?"), "Tu as faim ?"), L(g("כן, אני מאוד רעב", "כן, אני מאוד רעבה"), g("Ken, ani me'od ra'ev", "Ken, ani me'od re'eva"), "Oui, j'ai très faim")),
            rep(L("בואי נאכל משהו!", "Bo'i nokhal mashehu!", "Viens, on mange quelque chose ! (à une femme)")),
            rep(L(g("אני מת מרעב", "אני מתה מרעב"), g("Ani met me-ra'av", "Ani meta me-ra'av"), "Je meurs de faim")),
            rep(L("נזמין פיצה?", "Nazmin pitsa?", "On commande une pizza ?")),
            listen(L(g("אתה צמא?", "את צמאה?"), g("Ata tsame?", "At tsme'a?"), "Tu as soif ?"), "Que te demande-t-on ?", "Si tu as soif", "Si tu as faim", "Si tu es fatigué(e)", "Si tu as froid"),
            swap("Dis que tu as soif au lieu de faim.", L(g("אני רעב", "אני רעבה"), g("Ani ra'ev", "Ani re'eva"), "J'ai faim"), L(g("אני צמא", "אני צמאה"), g("Ani tsame", "Ani tsme'a"), "J'ai soif")),
            fill(L(g("אני רעב", "אני רעבה"), g("Ani ra'ev", "Ani re'eva"), "J'ai faim"), g("רעב", "רעבה"), g("ra'ev", "re'eva")),
            free(L(g("אתה רעב?", "את רעבה?"), g("Ata ra'ev?", "At re'eva?"), "Tu as faim ?"), L(g("כן, אני מאוד רעב", "כן, אני מאוד רעבה"), g("Ken, ani me'od ra'ev", "Ken, ani me'od re'eva"), "Oui, j'ai très faim")),
          ], "un ami qui te propose d'aller manger", "Dire que tu as faim et choisir où manger", L(g("אתה רעב? בוא נאכל משהו!", "את רעבה? בואי נאכל משהו!"), g("Ata ra'ev? Bo nokhal mashehu!", "At re'eva? Bo'i nokhal mashehu!"), "Tu as faim ? Viens, on mange quelque chose !")),
          day("u2d4", "L'addition", L("אפשר את החשבון, בבקשה?", "Efshar et ha-kheshbon, bevakasha?", "L'addition, s'il vous plaît ?"), [
            intro("Pour demander l'addition : « efshar et ha-kheshbon ». « Efshar » veut dire « c'est possible »."),
            intro("Attention au petit mot « et » : il n'a pas de traduction, il marque un objet précis (« l'addition »). Ne le confonds pas avec « at », qui veut dire « tu » au féminin."),
            rep(L("אפשר את החשבון, בבקשה?", "Efshar et ha-kheshbon, bevakasha?", "L'addition, s'il vous plaît ?")),
            rep(L("אפשר לשלם בכרטיס?", "Efshar leshalem be-kartis?", "Je peux payer par carte ?")),
            ask(L("הכול היה בסדר?", "Hakol haya beseder?", "Tout s'est bien passé ?"), L("כן, היה טעים מאוד!", "Ken, haya ta'im me'od!", "Oui, c'était très bon !")),
            rep(L("תודה, היה מעולה!", "Toda, haya me'ule!", "Merci, c'était excellent !")),
            rep(L("אפשר חשבון נפרד?", "Efshar kheshbon nifrad?", "On peut avoir des additions séparées ?")),
            listen(L("אפשר לשלם בכרטיס?", "Efshar leshalem be-kartis?", "Je peux payer par carte ?"), "Que demande le client ?", "S'il peut payer par carte", "S'il veut le menu", "S'il veut un café", "S'il veut partir"),
            swap("Demande à payer en espèces au lieu de la carte.", L("אפשר לשלם בכרטיס?", "Efshar leshalem be-kartis?", "Je peux payer par carte ?"), L("אפשר לשלם במזומן?", "Efshar leshalem be-mezuman?", "Je peux payer en espèces ?")),
            fill(L("אפשר את החשבון, בבקשה?", "Efshar et ha-kheshbon, bevakasha?", "L'addition, s'il vous plaît ?"), "החשבון", "ha-kheshbon"),
          ], "un serveur à la fin du repas", "Demander l'addition et payer", L("היה טעים? רוצה עוד משהו?", g("Haya ta'im? Rotse od mashehu?", "Haya ta'im? Rotsa od mashehu?"), "C'était bon ? Autre chose ?")),
        ],
      },
      {
        id: "u3", title: "En ville",
        days: [
          day("u3d1", "Où est… ?", L("סליחה, איפה התחנה?", "Slikha, eifo ha-takhana?", "Pardon, où est l'arrêt ?"), [
            intro("Pour demander ton chemin : « slikha » (pardon), « eifo » (où), puis le lieu."),
            rep(L("סליחה, איפה התחנה?", "Slikha, eifo ha-takhana?", "Pardon, où est l'arrêt ?")),
            rep(L("איפה הים?", "Eifo ha-yam?", "Où est la mer ?")),
            ask(L(g("מה אתה מחפש?", "מה את מחפשת?"), g("Ma ata mekhapes?", "Ma at mekhapeset?"), "Tu cherches quoi ?"), L(g("אני מחפש את המלון", "אני מחפשת את המלון"), g("Ani mekhapes et ha-malon", "Ani mekhapeset et ha-malon"), "Je cherche l'hôtel")),
            rep(L("איפה הבנק?", "Eifo ha-bank?", "Où est la banque ?")),
            rep(L("איפה בית המרקחת?", "Eifo beit ha-merkakhat?", "Où est la pharmacie ?")),
            listen(L("איפה התחנה?", "Eifo ha-takhana?", "Où est l'arrêt ?"), "Que cherche cette personne ?", "L'arrêt", "L'hôtel", "La plage", "Un taxi"),
            fill(L("סליחה, איפה התחנה?", "Slikha, eifo ha-takhana?", "Pardon, où est l'arrêt ?"), "איפה", "eifo"),
            swap("Demande où est l'hôtel.", L("איפה התחנה?", "Eifo ha-takhana?", "Où est l'arrêt ?"), L("איפה המלון?", "Eifo ha-malon?", "Où est l'hôtel ?")),
            free(L(g("מה אתה מחפש?", "מה את מחפשת?"), g("Ma ata mekhapes?", "Ma at mekhapeset?"), "Tu cherches quoi ?"), L(g("אני מחפש את הבנק", "אני מחפשת את הבנק"), g("Ani mekhapes et ha-bank", "Ani mekhapeset et ha-bank"), "Je cherche la banque")),
          ], "un passant dans une rue de Jérusalem", "Demander ton chemin", L("כן? אפשר לעזור?", "Ken? Efshar la'azor?", "Oui ? Je peux vous aider ?")),
          day("u3d2", "Droite, gauche", L("ימינה ואז שמאלה", "Yamina ve-az smola", "À droite puis à gauche"), [
            intro("Les directions : yamina (à droite), smola (à gauche), yashar (tout droit)."),
            rep(L("ימינה", "Yamina", "À droite")),
            rep(L("שמאלה", "Smola", "À gauche")),
            rep(L("ישר, ואז ימינה", "Yashar, ve-az yamina", "Tout droit, puis à droite")),
            ask(L("זה רחוק?", "Ze rakhok?", "C'est loin ?"), L("לא, זה קרוב", "Lo, ze karov", "Non, c'est près")),
            rep(L("ישר עד הרמזור", "Yashar ad ha-ramzor", "Tout droit jusqu'au feu")),
            rep(L("בפנייה הראשונה", "Ba-pniya ha-rishona", "Au premier croisement")),
            rep(L("זה ליד הבנק", "Ze leyad ha-bank", "C'est à côté de la banque")),
            listen(L("שמאלה", "Smola", "À gauche"), "Quelle direction ?", "À gauche", "À droite", "Tout droit", "Demi-tour"),
            swap("Dis à droite au lieu de à gauche.", L("שמאלה", "Smola", "À gauche"), L("ימינה", "Yamina", "À droite")),
            fill(L("ישר, ואז ימינה", "Yashar, ve-az yamina", "Tout droit, puis à droite"), "ימינה", "yamina"),
          ], "un touriste perdu qui te demande son chemin", "Donner des directions simples", L("סליחה, איפה התחנה המרכזית?", "Slikha, eifo ha-takhana ha-merkazit?", "Pardon, où est la gare routière centrale ?")),
          day("u3d3", "Prendre un taxi", L("לרחוב דיזנגוף, בבקשה", "Li-rekhov Dizengof, bevakasha", "Rue Dizengoff, s'il vous plaît"), [
            intro("Dans un taxi, donne la destination avec la lettre lamed, qui veut dire « vers »."),
            rep(L("לרחוב דיזנגוף, בבקשה", "Li-rekhov Dizengof, bevakasha", "Rue Dizengoff, s'il vous plaît")),
            rep(L("כמה זה יעלה?", "Kama ze ya'ale?", "Combien ça va coûter ?")),
            rep(L("עם מונה, בבקשה", "Im mone, bevakasha", "Avec le compteur, s'il vous plaît")),
            ask(L("לאן נוסעים?", "Le'an nos'im?", "On va où ?"), L("לשדה התעופה, בבקשה", "Li-sde ha-te'ufa, bevakasha", "À l'aéroport, s'il vous plaît")),
            rep(L("תעצור כאן, בבקשה", "Ta'atsor kan, bevakasha", "Arrêtez-vous ici, s'il vous plaît")),
            rep(L(g("כמה אני חייב?", "כמה אני חייבת?"), g("Kama ani khayav?", "Kama ani khayevet?"), "Combien je vous dois ?")),
            listen(L("לאן נוסעים?", "Le'an nos'im?", "On va où ?"), "Que demande le chauffeur ?", "Où on va", "Combien je te dois", "Quel âge tu as", "Si tu as une carte"),
            fill(L("לרחוב דיזנגוף, בבקשה", "Li-rekhov Dizengof, bevakasha", "Rue Dizengoff, s'il vous plaît"), "לרחוב", "li-rekhov"),
            swap("Demande la gare routière au lieu de l'aéroport.", L("לשדה התעופה, בבקשה", "Li-sde ha-te'ufa, bevakasha", "À l'aéroport, s'il vous plaît"), L("לתחנה המרכזית, בבקשה", "La-takhana ha-merkazit, bevakasha", "À la gare routière, s'il vous plaît")),
          ], "un chauffeur de taxi", "Donner ta destination et demander le prix", L("שלום! לאן נוסעים?", "Shalom! Le'an nos'im?", "Bonjour ! On va où ?")),
          day("u3d4", "Quelle heure est-il ?", L("מה השעה?", "Ma ha-sha'a?", "Quelle heure est-il ?"), [
            intro("Pour l'heure, on utilise les nombres féminins : « ha-sha'a shalosh », il est trois heures."),
            rep(L("מה השעה?", "Ma ha-sha'a?", "Quelle heure est-il ?")),
            rep(L("השעה שלוש", "Ha-sha'a shalosh", "Il est trois heures")),
            rep(L("השעה חמש וחצי", "Ha-sha'a khamesh va-khetsi", "Il est cinq heures et demie")),
            ask(L("מתי האוטובוס?", "Matai ha-otobus?", "Le bus est à quelle heure ?"), L("בשעה שמונה", "Be-sha'a shmone", "À huit heures")),
            rep(L("השעה שמונה וחצי", "Ha-sha'a shmone va-khetsi", "Il est huit heures et demie")),
            rep(L("בשעה תשע", "Be-sha'a tesha", "À neuf heures")),
            rep(L("רבע לשתיים", "Reva le-shtayim", "Deux heures moins le quart")),
            listen(L("השעה חמש וחצי", "Ha-sha'a khamesh va-khetsi", "Il est cinq heures et demie"), "Quelle heure est-il ?", "Cinq heures et demie", "Cinq heures", "Six heures et demie", "Quatre heures et demie"),
            swap("Dis trois heures au lieu de cinq.", L("השעה חמש", "Ha-sha'a khamesh", "Il est cinq heures"), L("השעה שלוש", "Ha-sha'a shalosh", "Il est trois heures")),
            fill(L("השעה שלוש", "Ha-sha'a shalosh", "Il est trois heures"), "שלוש", "shalosh"),
            free(L("מה השעה?", "Ma ha-sha'a?", "Quelle heure est-il ?"), L("השעה שלוש", "Ha-sha'a shalosh", "Il est trois heures")),
          ], "un ami qui organise un rendez-vous", "Fixer une heure", L("נפגשים מחר? באיזו שעה נוח לך?", g("Nifgashim makhar? Be-eizo sha'a no'akh lekha?", "Nifgashim makhar? Be-eizo sha'a no'akh lakh?"), "On se voit demain ? À quelle heure ça t'arrange ?")),
        ],
      },
    ],
  },
  {
    id: "beg2", title: "Débutant 2", cefr: "A2",
    units: [
      {
        id: "u4", title: "Ma journée",
        days: [
          day("u4d1", "Le matin", L(g("אני קם בשבע", "אני קמה בשבע"), g("Ani kam be-sheva", "Ani kama be-sheva"), "Je me lève à sept heures"), [
            intro("Pour raconter ta routine, le présent suffit. Se lever : kam pour un homme, kama pour une femme."),
            rep(L(g("אני קם בשבע", "אני קמה בשבע"), g("Ani kam be-sheva", "Ani kama be-sheva"), "Je me lève à sept heures")),
            rep(L(g("אני שותה קפה ויוצא מהבית", "אני שותה קפה ויוצאת מהבית"), g("Ani shote kafe ve-yotse me-ha-bayit", "Ani shota kafe ve-yotset me-ha-bayit"), "Je bois un café et je sors de la maison")),
            ask(L(g("מתי אתה קם בבוקר?", "מתי את קמה בבוקר?"), g("Matai ata kam ba-boker?", "Matai at kama ba-boker?"), "Tu te lèves quand le matin ?"), L(g("אני קם בשבע", "אני קמה בשבע"), g("Ani kam be-sheva", "Ani kama be-sheva"), "Je me lève à sept heures")),
            rep(L(g("אני אוכל ארוחת בוקר", "אני אוכלת ארוחת בוקר"), g("Ani okhel arukhat boker", "Ani okhelet arukhat boker"), "Je prends le petit-déjeuner")),
            rep(L(g("אני נוסע לעבודה", "אני נוסעת לעבודה"), g("Ani nose'a la-avoda", "Ani nosa'at la-avoda"), "Je vais au travail")),
            listen(L(g("מתי אתה קם?", "מתי את קמה?"), g("Matai ata kam?", "Matai at kama?"), "Tu te lèves quand ?"), "Que te demande-t-on ?", "À quelle heure tu te lèves", "À quelle heure tu travailles", "Où tu habites", "Ce que tu manges"),
            fill(L(g("אני קם בשבע", "אני קמה בשבע"), g("Ani kam be-sheva", "Ani kama be-sheva"), "Je me lève à sept heures"), g("קם", "קמה"), g("kam", "kama")),
            swap("Dis six heures au lieu de sept.", L(g("אני קם בשבע", "אני קמה בשבע"), g("Ani kam be-sheva", "Ani kama be-sheva"), "Je me lève à sept heures"), L(g("אני קם בשש", "אני קמה בשש"), g("Ani kam be-shesh", "Ani kama be-shesh"), "Je me lève à six heures")),
            free(L(g("מתי אתה קם בבוקר?", "מתי את קמה בבוקר?"), g("Matai ata kam ba-boker?", "Matai at kama ba-boker?"), "Tu te lèves quand le matin ?"), L(g("אני קם בשבע", "אני קמה בשבע"), g("Ani kam be-sheva", "Ani kama be-sheva"), "Je me lève à sept heures")),
          ], "une amie qui te parle de sa routine", "Décrire ta matinée", L(g("אני קמה כל יום בשש! ואתה, מתי אתה קם?", "אני קמה כל יום בשש! ואת, מתי את קמה?"), g("Ani kama kol yom be-shesh! Ve-ata, matai ata kam?", "Ani kama kol yom be-shesh! Ve-at, matai at kama?"), "Je me lève tous les jours à six heures ! Et toi, tu te lèves quand ?")),
          day("u4d2", "Au travail", L(g("אני עובד במשרד", "אני עובדת במשרד"), g("Ani oved ba-misrad", "Ani ovedet ba-misrad"), "Je travaille dans un bureau"), [
            intro("Travailler : oved pour un homme, ovedet pour une femme. Pour ton métier : « ani » plus le métier, sans verbe être."),
            rep(L(g("אני עובד במשרד", "אני עובדת במשרד"), g("Ani oved ba-misrad", "Ani ovedet ba-misrad"), "Je travaille dans un bureau")),
            rep(L(g("אני מורה", "אני מורה"), g("Ani more", "Ani mora"), "Je suis prof")),
            ask(L(g("במה אתה עובד?", "במה את עובדת?"), g("Ba-ma ata oved?", "Ba-ma at ovedet?"), "Tu fais quoi comme travail ?"), L(g("אני עובד בהייטק", "אני עובדת בהייטק"), g("Ani oved be-haitek", "Ani ovedet be-haitek"), "Je travaille dans la tech")),
            rep(L(g("אני עובד בבית", "אני עובדת בבית"), g("Ani oved ba-bayit", "Ani ovedet ba-bayit"), "Je travaille à la maison")),
            rep(L(g("אני מהנדס", "אני מהנדסת"), g("Ani mehandes", "Ani mehandeset"), "Je suis ingénieur(e)")),
            rep(L(g("אני עובד מתשע עד חמש", "אני עובדת מתשע עד חמש"), g("Ani oved mi-tesha ad khamesh", "Ani ovedet mi-tesha ad khamesh"), "Je travaille de neuf heures à cinq heures")),
            listen(L(g("במה אתה עובד?", "במה את עובדת?"), g("Ba-ma ata oved?", "Ba-ma at ovedet?"), "Tu fais quoi comme travail ?"), "Que te demande-t-on ?", "Ton métier", "Ta ville", "Ton âge", "Ton nom"),
            fill(L(g("אני עובד במשרד", "אני עובדת במשרד"), g("Ani oved ba-misrad", "Ani ovedet ba-misrad"), "Je travaille dans un bureau"), g("עובד", "עובדת"), g("oved", "ovedet")),
            swap("Dis que tu travailles à la maison, pas au bureau.", L(g("אני עובד במשרד", "אני עובדת במשרד"), g("Ani oved ba-misrad", "Ani ovedet ba-misrad"), "Je travaille dans un bureau"), L(g("אני עובד בבית", "אני עובדת בבית"), g("Ani oved ba-bayit", "Ani ovedet ba-bayit"), "Je travaille à la maison")),
            free(L(g("במה אתה עובד?", "במה את עובדת?"), g("Ba-ma ata oved?", "Ba-ma at ovedet?"), "Tu fais quoi comme travail ?"), L(g("אני עובד בהייטק", "אני עובדת בהייטק"), g("Ani oved be-haitek", "Ani ovedet be-haitek"), "Je travaille dans la tech")),
          ], "un collègue à la pause café", "Parler de ton travail", L(g("אז במה אתה עובד בדיוק?", "אז במה את עובדת בדיוק?"), g("Az ba-ma ata oved be-diyuk?", "Az ba-ma at ovedet be-diyuk?"), "Alors, tu fais quoi exactement comme travail ?")),
          day("u4d3", "Hier", L("אתמול הלכתי לים", "Etmol halakhti la-yam", "Hier, je suis allé(e) à la plage"), [
            intro("Au passé, la terminaison « ti » veut dire « je » : halakhti, je suis allé ; akhalti, j'ai mangé."),
            rep(L("אתמול הלכתי לים", "Etmol halakhti la-yam", "Hier, je suis allé(e) à la plage")),
            rep(L("אכלתי פלאפל", "Akhalti falafel", "J'ai mangé un falafel")),
            ask(L("מה עשית אתמול?", g("Ma asita etmol?", "Ma asit etmol?"), "Tu as fait quoi hier ?"), L("אתמול עבדתי ואז ראיתי סרט", "Etmol avadti ve-az ra'iti seret", "Hier j'ai travaillé, puis j'ai vu un film")),
            rep(L("אתמול שתיתי קפה", "Etmol shatiti kafe", "Hier, j'ai bu un café")),
            rep(L("אתמול נפגשתי עם חברים", "Etmol nifgashti im khaverim", "Hier, j'ai retrouvé des amis")),
            rep(L("לא יצאתי אתמול", "Lo yatsati etmol", "Je ne suis pas sorti(e) hier")),
            listen(L("אכלתי פלאפל", "Akhalti falafel", "J'ai mangé un falafel"), "Que s'est-il passé ?", "Il a mangé un falafel", "Il va manger un falafel", "Il aime le falafel", "Il cuisine un falafel"),
            swap("Mets au passé : « je mange » devient « j'ai mangé ».", L(g("אני אוכל", "אני אוכלת"), g("Ani okhel", "Ani okhelet"), "Je mange"), L("אכלתי", "Akhalti", "J'ai mangé")),
            fill(L("אתמול הלכתי לים", "Etmol halakhti la-yam", "Hier, je suis allé(e) à la plage"), "הלכתי", "halakhti"),
            free(L("מה עשית אתמול?", g("Ma asita etmol?", "Ma asit etmol?"), "Tu as fait quoi hier ?"), L("אתמול עבדתי ואז ראיתי סרט", "Etmol avadti ve-az ra'iti seret", "Hier j'ai travaillé, puis j'ai vu un film")),
          ], "un ami curieux", "Raconter ta journée d'hier", L("נו, מה עשית אתמול?", g("No, ma asita etmol?", "No, ma asit etmol?"), "Alors, tu as fait quoi hier ?")),
          day("u4d4", "Le week-end", L("בסוף השבוע נסעתי לירושלים", "Be-sof ha-shavua nasati li-Yerushalayim", "Ce week-end, je suis allé(e) à Jérusalem"), [
            intro("Pour raconter un trajet : nasati, je suis allé en véhicule."),
            rep(L("בסוף השבוע נסעתי לירושלים", "Be-sof ha-shavua nasati li-Yerushalayim", "Ce week-end, je suis allé(e) à Jérusalem")),
            rep(L("היה כיף!", "Haya kef!", "C'était super !")),
            ask(L("איך היה סוף השבוע?", "Eikh haya sof ha-shavua?", "C'était comment, le week-end ?"), L("היה נהדר, נחתי הרבה", "Haya nehedar, nakhti harbe", "C'était génial, je me suis bien reposé(e)")),
            rep(L("הלכנו לים", "Halakhnu la-yam", "Nous sommes allés à la plage")),
            rep(L("ישנתי עד מאוחר", "Yashanti ad me'ukhar", "J'ai dormi tard")),
            rep(L("בילינו עם המשפחה", "Bilinu im ha-mishpakha", "Nous avons passé du temps en famille")),
            listen(L("היה כיף!", "Haya kef!", "C'était super !"), "Que dit-on du week-end ?", "C'était super", "C'était long", "C'était fatigant", "C'était cher"),
            swap("Dis « nous » au lieu de « je ».", L("הלכתי לים", "Halakhti la-yam", "Je suis allé(e) à la plage"), L("הלכנו לים", "Halakhnu la-yam", "Nous sommes allés à la plage")),
            fill(L("היה כיף!", "Haya kef!", "C'était super !"), "כיף", "kef"),
            free(L("איך היה סוף השבוע?", "Eikh haya sof ha-shavua?", "C'était comment, le week-end ?"), L("היה נהדר, נחתי הרבה", "Haya nehedar, nakhti harbe", "C'était génial, je me suis bien reposé(e)")),
          ], "un voisin chaleureux", "Raconter ton week-end", L("בוקר טוב! איך היה סוף השבוע?", "Boker tov! Eikh haya sof hashavua?", "Bonjour ! C'était comment, le week-end ?")),
        ],
      },
      {
        id: "u5", title: "Goûts et envies",
        days: [
          day("u5d1", "J'aime…", L(g("אני אוהב מוזיקה", "אני אוהבת מוזיקה"), g("Ani ohev muzika", "Ani ohevet muzika"), "J'aime la musique"), [
            intro("Aimer : ohev pour un homme, ohevet pour une femme. Pour aimer faire quelque chose, ajoute un infinitif."),
            rep(L(g("אני אוהב מוזיקה", "אני אוהבת מוזיקה"), g("Ani ohev muzika", "Ani ohevet muzika"), "J'aime la musique")),
            rep(L(g("אני אוהב לבשל", "אני אוהבת לבשל"), g("Ani ohev levashel", "Ani ohevet levashel"), "J'aime cuisiner")),
            ask(L(g("מה אתה אוהב לעשות?", "מה את אוהבת לעשות?"), g("Ma ata ohev la'asot?", "Ma at ohevet la'asot?"), "Qu'est-ce que tu aimes faire ?"), L(g("אני אוהב לטייל", "אני אוהבת לטייל"), g("Ani ohev letayel", "Ani ohevet letayel"), "J'aime me balader, voyager")),
            rep(L(g("אני אוהב לקרוא", "אני אוהבת לקרוא"), g("Ani ohev likro", "Ani ohevet likro"), "J'aime lire")),
            rep(L(g("אני לא אוהב לחכות", "אני לא אוהבת לחכות"), g("Ani lo ohev lekhakot", "Ani lo ohevet lekhakot"), "Je n'aime pas attendre")),
            listen(L(g("מה אתה אוהב?", "מה את אוהבת?"), g("Ma ata ohev?", "Ma at ohevet?"), "Qu'est-ce que tu aimes ?"), "Que te demande-t-on ?", "Ce que tu aimes", "Ce que tu détestes", "Où tu vas", "Ce que tu veux"),
            fill(L(g("אני אוהב מוזיקה", "אני אוהבת מוזיקה"), g("Ani ohev muzika", "Ani ohevet muzika"), "J'aime la musique"), g("אוהב", "אוהבת"), g("ohev", "ohevet")),
            swap("Dis que tu n'aimes pas la musique.", L(g("אני אוהב מוזיקה", "אני אוהבת מוזיקה"), g("Ani ohev muzika", "Ani ohevet muzika"), "J'aime la musique"), L(g("אני לא אוהב מוזיקה", "אני לא אוהבת מוזיקה"), g("Ani lo ohev muzika", "Ani lo ohevet muzika"), "Je n'aime pas la musique")),
            free(L(g("מה אתה אוהב לעשות?", "מה את אוהבת לעשות?"), g("Ma ata ohev la'asot?", "Ma at ohevet la'asot?"), "Qu'est-ce que tu aimes faire ?"), L(g("אני אוהב לטייל", "אני אוהבת לטייל"), g("Ani ohev letayel", "Ani ohevet letayel"), "J'aime voyager")),
          ], "une amie qui parle de musique", "Parler de tes goûts", L(g("איזו מוזיקה אתה אוהב?", "איזו מוזיקה את אוהבת?"), g("Eizo muzika ata ohev?", "Eizo muzika at ohevet?"), "Quelle musique tu aimes ?")),
          day("u5d2", "Je préfère…", L(g("אני מעדיף תה", "אני מעדיפה תה"), g("Ani ma'adif te", "Ani ma'adifa te"), "Je préfère le thé"), [
            intro("Préférer : ma'adif pour un homme, ma'adifa pour une femme. Pour proposer un choix : « o », qui veut dire « ou »."),
            rep(L(g("אני מעדיף תה", "אני מעדיפה תה"), g("Ani ma'adif te", "Ani ma'adifa te"), "Je préfère le thé")),
            rep(L("קפה או תה?", "Kafe o te?", "Café ou thé ?")),
            ask(L("ים או הרים?", "Yam o harim?", "La mer ou la montagne ?"), L(g("אני מעדיף ים", "אני מעדיפה ים"), g("Ani ma'adif yam", "Ani ma'adifa yam"), "Je préfère la mer")),
            rep(L(g("אני מעדיף לטייל", "אני מעדיפה לטייל"), g("Ani ma'adif letayel", "Ani ma'adifa letayel"), "Je préfère voyager")),
            rep(L("זה יותר טוב", "Ze yoter tov", "C'est mieux")),
            rep(L("הכי טוב", "Ha-khi tov", "Le meilleur")),
            listen(L("קפה או תה?", "Kafe o te?", "Café ou thé ?"), "Que propose-t-on ?", "Café ou thé", "Thé ou lait", "Café ou gâteau", "Eau ou jus"),
            swap("Choisis le café au lieu du thé.", L(g("אני מעדיף תה", "אני מעדיפה תה"), g("Ani ma'adif te", "Ani ma'adifa te"), "Je préfère le thé"), L(g("אני מעדיף קפה", "אני מעדיפה קפה"), g("Ani ma'adif kafe", "Ani ma'adifa kafe"), "Je préfère le café")),
            fill(L("קפה או תה?", "Kafe o te?", "Café ou thé ?"), "או", "o"),
            free(L("ים או הרים?", "Yam o harim?", "La mer ou la montagne ?"), L(g("אני מעדיף ים", "אני מעדיפה ים"), g("Ani ma'adif yam", "Ani ma'adifa yam"), "Je préfère la mer")),
          ], "un ami qui te prépare un petit-déjeuner", "Exprimer tes préférences", L(g("מה אתה שותה בבוקר, קפה או תה?", "מה את שותה בבוקר, קפה או תה?"), g("Ma ata shote ba-boker, kafe o te?", "Ma at shota ba-boker, kafe o te?"), "Tu bois quoi le matin, café ou thé ?")),
          day("u5d3", "Inviter quelqu'un", L("רוצה לבוא איתי לסרט?", "Rotsa lavo iti le-seret?", "Tu veux venir au cinéma avec moi ? (à une femme)"), [
            intro("Pour inviter : « rotse » ou « rotsa », puis « lavo », venir, et « iti », avec moi."),
            rep(L("רוצה לבוא איתי לסרט?", "Rotsa lavo iti le-seret?", "Tu veux venir au cinéma avec moi ? (à une femme)")),
            rep(L("בשמחה!", "Be-simkha!", "Avec plaisir !")),
            rep(L("מתי נוח לך?", "Matai no'akh lakh?", "Quand est-ce que ça t'arrange ? (à une femme)")),
            ask(L("רוצה לבוא איתי לים מחר?", g("Rotse lavo iti la-yam makhar?", "Rotsa lavo iti la-yam makhar?"), "Tu veux venir à la plage avec moi demain ?"), L("כן, בשמחה! באיזו שעה?", "Ken, be-simkha! Be-eizo sha'a?", "Oui, avec plaisir ! À quelle heure ?")),
            rep(L("מה דעתך על סרט?", g("Ma da'atkha al seret?", "Ma da'atekh al seret?"), "Ça te dit d'aller voir un film ?")),
            rep(L("לא מתאים לי היום", "Lo mat'im li ha-yom", "Ça ne m'arrange pas aujourd'hui")),
            rep(L("אולי בפעם אחרת", "Ulai be-pa'am akheret", "Peut-être une autre fois")),
            listen(L("בשמחה!", "Be-simkha!", "Avec plaisir !"), "Que répond-il ?", "Il accepte avec plaisir", "Il refuse", "Il hésite", "Il est en retard"),
            swap("Refuse poliment au lieu d'accepter.", L("בשמחה!", "Be-simkha!", "Avec plaisir !"), L("לא מתאים לי היום", "Lo mat'im li ha-yom", "Ça ne m'arrange pas aujourd'hui")),
            fill(L("בשמחה!", "Be-simkha!", "Avec plaisir !"), "בשמחה", "be-simkha"),
            free(L(g("מה אתה עושה בערב?", "מה את עושה בערב?"), g("Ma ata ose ba-erev?", "Ma at osa ba-erev?"), "Tu fais quoi ce soir ?"), L("אני לא עושה כלום. רוצה לבוא איתי לסרט?", "Ani lo ose klum. Rotse lavo iti le-seret?", "Je ne fais rien. Tu veux venir au cinéma avec moi ?")),
          ], "un ami avec qui tu organises une sortie", "Proposer une sortie et fixer un moment", L(g("מה אתה עושה בערב?", "מה את עושה בערב?"), g("Ma ata ose ba-erev?", "Ma at osa ba-erev?"), "Tu fais quoi ce soir ?")),
          day("u5d4", "Faire des projets", L("מחר אני רוצה ללכת לים", g("Makhar ani rotse lalekhet la-yam", "Makhar ani rotsa lalekhet la-yam"), "Demain, je veux aller à la plage"), [
            intro("Pour parler de tes projets : « rotse » plus un infinitif, ou le futur : « ani esa », j'irai."),
            rep(L("מחר אני רוצה ללכת לים", g("Makhar ani rotse lalekhet la-yam", "Makhar ani rotsa lalekhet la-yam"), "Demain, je veux aller à la plage")),
            rep(L("בשבוע הבא אני אסע לאילת", "Ba-shavua ha-ba ani esa le-Eilat", "La semaine prochaine, j'irai à Eilat")),
            ask(L("מה התוכניות שלך לסוף השבוע?", g("Ma ha-tokhniyot shelkha le-sof ha-shavua?", "Ma ha-tokhniyot shelakh le-sof ha-shavua?"), "C'est quoi tes projets pour le week-end ?"), L("אני רוצה לנוח ולראות חברים", g("Ani rotse lanu'akh ve-lir'ot khaverim", "Ani rotsa lanu'akh ve-lir'ot khaverim"), "Je veux me reposer et voir des amis")),
            rep(L(g("בקיץ אני רוצה לטוס ליוון", "בקיץ אני רוצה לטוס ליוון"), g("Ba-kaitz ani rotse latus le-Yavan", "Ba-kaitz ani rotsa latus le-Yavan"), "En été, je veux aller en Grèce")),
            rep(L("עוד לא החלטתי", "Od lo hekhlatti", "Je n'ai pas encore décidé")),
            listen(L("בשבוע הבא אני אסע לאילת", "Ba-shavua ha-ba ani esa le-Eilat", "La semaine prochaine, j'irai à Eilat"), "Quand part-il ?", "La semaine prochaine", "Demain", "Hier", "Ce soir"),
            swap("Dis demain au lieu de la semaine prochaine.", L("בשבוע הבא אני אסע לאילת", "Ba-shavua ha-ba ani esa le-Eilat", "La semaine prochaine, j'irai à Eilat"), L("מחר אני אסע לאילת", "Makhar ani esa le-Eilat", "Demain, j'irai à Eilat")),
            fill(L("בשבוע הבא אני אסע לאילת", "Ba-shavua ha-ba ani esa le-Eilat", "La semaine prochaine, j'irai à Eilat"), "אסע", "esa"),
            free(L("מה התוכניות שלך לסוף השבוע?", g("Ma ha-tokhniyot shelkha le-sof ha-shavua?", "Ma ha-tokhniyot shelakh le-sof ha-shavua?"), "C'est quoi tes projets pour le week-end ?"), L("אני רוצה לנוח ולראות חברים", g("Ani rotse lanu'akh ve-lir'ot khaverim", "Ani rotsa lanu'akh ve-lir'ot khaverim"), "Je veux me reposer et voir des amis")),
          ], "une amie qui prépare un voyage", "Parler de tes projets", L(g("בוא נדבר על טיולים. לאיזו מדינה אתה רוצה לטוס?", "בואי נדבר על טיולים. לאיזו מדינה את רוצה לטוס?"), g("Bo nedaber al tiyulim. Le-eizo medina ata rotse latus?", "Bo'i nedaber al tiyulim. Le-eizo medina at rotsa latus?"), "Parlons voyages. Dans quel pays tu as envie d'aller ?")),
        ],
      },
      {
        id: "u5g", title: "Les petits mots",
        days: [
          day("u5g1", "À moi, à toi, à lui", L("יש לי, יש לך, יש לו", g("Yesh li, yesh lekha, yesh lo", "Yesh li, yesh lakh, yesh lo"), "J'ai, tu as, il a"), [
            intro("Le petit mot « le » (à) se colle aux pronoms : li (à moi), lekha ou lakh (à toi), lo (à lui), la (à elle), lanu (à nous). On les retrouve partout : yesh li, ko'ev li, no'akh lakh."),
            rep(L("יש לי", "Yesh li", "J'ai")),
            rep(L("יש לך כסף?", g("Yesh lekha kesef?", "Yesh lakh kesef?"), "Tu as de l'argent ?")),
            rep(L("יש לו זמן", "Yesh lo zman", "Il a du temps")),
            rep(L("יש לה בית", "Yesh la bayit", "Elle a une maison")),
            rep(L("יש לנו זמן", "Yesh lanu zman", "On a le temps")),
            listen(L("יש לה אח", "Yesh la akh", "Elle a un frère"), "Qui a un frère ?", "Elle", "Moi", "Toi", "Lui"),
            swap("Parle de lui au lieu de parler de toi.", L("יש לי אח", "Yesh li akh", "J'ai un frère"), L("יש לו אח", "Yesh lo akh", "Il a un frère")),
            ask(L("יש לך אחים?", g("Yesh lekha akhim?", "Yesh lakh akhim?"), "Tu as des frères et sœurs ?"), L("יש לי אח ואחות", "Yesh li akh ve-akhot", "J'ai un frère et une sœur")),
          ], "un nouveau voisin curieux", "Parler de ta famille et de ce que tu as", L("יש לך משפחה גדולה?", g("Yesh lekha mishpakha gdola?", "Yesh lakh mishpakha gdola?"), "Tu as une grande famille ?")),
          day("u5g2", "Avec moi, à moi", L("זה שלי", "Ze sheli", "C'est à moi"), [
            intro("Les prépositions prennent aussi des terminaisons : iti (avec moi), itkha ou itakh (avec toi), ito (avec lui). Pour dire « à moi » : sheli, shelkha ou shelakh, shelo, shela."),
            rep(L("אפשר לבוא איתך?", g("Efshar lavo itkha?", "Efshar lavo itakh?"), "Je peux venir avec toi ?")),
            rep(L("הספר שלי", "Ha-sefer sheli", "Mon livre")),
            rep(L("זה הטלפון שלך", g("Ze ha-telefon shelkha", "Ze ha-telefon shelakh"), "C'est ton téléphone")),
            rep(L("הבית שלו גדול", "Ha-bayit shelo gadol", "Sa maison est grande (à lui)")),
            rep(L("הדירה שלה יפה", "Ha-dira shela yafa", "Son appartement est beau (à elle)")),
            listen(L("זה שלו", "Ze shelo", "C'est à lui"), "À qui est-ce ?", "À lui", "À moi", "À elle", "À toi"),
            swap("Dis que c'est à toi, pas à lui.", L("זה שלו", "Ze shelo", "C'est à lui"), L("זה שלי", "Ze sheli", "C'est à moi")),
            ask(L("זה הטלפון שלך?", g("Ze ha-telefon shelkha?", "Ze ha-telefon shelakh?"), "C'est ton téléphone ?"), L("כן, זה שלי", "Ken, ze sheli", "Oui, c'est le mien")),
          ], "un employé des objets trouvés", "Reconnaître ce qui est à toi", L("מצאנו תיק. זה התיק שלך?", g("Matsanu tik. Ze ha-tik shelkha?", "Matsanu tik. Ze ha-tik shelakh?"), "On a trouvé un sac. C'est le tien ?")),
          day("u5g3", "Deux noms collés", L("בית ספר", "Beit sefer", "Une école"), [
            intro("En hébreu, on colle deux noms pour en faire un : « beit sefer » (maison du livre) veut dire école. L'article « ha » se met devant le deuxième nom seulement : « beit ha-sefer », l'école."),
            rep(L("בית ספר", "Beit sefer", "Une école")),
            rep(L("בית הספר", "Beit ha-sefer", "L'école")),
            rep(L("בית קפה", "Beit kafe", "Un café (le lieu)")),
            rep(L("שירות לקוחות", "Sherut lakokhot", "Service client")),
            intro("Autre astuce : « be » plus « ha » donne « ba », et « le » plus « ha » donne « la ». On dit ba-misrad (au bureau) et la-yam (à la mer)."),
            rep(L("אני במשרד", "Ani ba-misrad", "Je suis au bureau")),
            listen(L("בית קפה", "Beit kafe", "Un café"), "Quel lieu entends-tu ?", "Un café (le lieu)", "Une école", "Un bureau", "Un hôtel"),
            fill(L("אני במשרד", "Ani ba-misrad", "Je suis au bureau"), "במשרד", "ba-misrad"),
            ask(L(g("איפה אתה?", "איפה את?"), g("Eifo ata?", "Eifo at?"), "Tu es où ?"), L("אני במשרד", "Ani ba-misrad", "Je suis au bureau")),
          ], "un collègue au téléphone", "Dire où tu es", L(g("איפה אתה עכשיו?", "איפה את עכשיו?"), g("Eifo ata akhshav?", "Eifo at akhshav?"), "Tu es où maintenant ?")),
          day("u5g4", "Parler comme un Israélien", L("ממש טוב", "Mamash tov", "Vraiment bien"), [
            intro("Pour sonner naturel : « mamash » (vraiment), « pashut » (tout simplement), « nu » (alors ? allez !), « ya'ni » (genre, c'est-à-dire)."),
            rep(L("ממש טוב", "Mamash tov", "Vraiment bien")),
            rep(L("זה פשוט מעולה", "Ze pashut me'ule", "C'est tout simplement excellent")),
            rep(L(g("נו, תגיד", "נו, תגידי"), g("Nu, tagid", "Nu, tagidi"), "Alors, dis-moi !")),
            rep(L("בכיף", "Be-kef", "Avec plaisir, volontiers")),
            listen(L("ממש יקר", "Mamash yakar", "Vraiment cher"), "Que penser du prix ?", "Très cher", "Pas cher", "Un peu cher", "Gratuit"),
            swap("Renforce : ajoute « mamash » avant l'adjectif.", L("זה טוב", "Ze tov", "C'est bien"), L("זה ממש טוב", "Ze mamash tov", "C'est vraiment bien")),
            fill(L("זה ממש טוב", "Ze mamash tov", "C'est vraiment bien"), "ממש", "mamash"),
            ask(L("איך היה הסרט?", "Eikh haya ha-seret?", "Il était comment, le film ?"), L("ממש טוב!", "Mamash tov!", "Vraiment bien !")),
          ], "un ami qui sort du cinéma", "Réagir avec naturel", L("נו, איך היה הסרט?", "Nu, eikh haya ha-seret?", "Alors, il était comment le film ?")),
        ],
      },
    ],
  },
  {
    id: "int1", title: "Intermédiaire 1", cefr: "B1",
    units: [
      {
        id: "u6", title: "Raconter et donner son avis",
        days: [
          day("u6d1", "Quand j'étais petit…", L(g("כשהייתי ילד, גרתי בכפר", "כשהייתי ילדה, גרתי בכפר"), g("Ke-she-hayiti yeled, garti ba-kfar", "Ke-she-hayiti yalda, garti ba-kfar"), "Quand j'étais petit(e), j'habitais à la campagne"), [
            intro("Pour raconter ton passé : « ke-she » (quand) collé au verbe, puis le passé en « ti » : hayiti, j'étais ; garti, j'habitais."),
            rep(L(g("כשהייתי ילד, גרתי בכפר", "כשהייתי ילדה, גרתי בכפר"), g("Ke-she-hayiti yeled, garti ba-kfar", "Ke-she-hayiti yalda, garti ba-kfar"), "Quand j'étais petit(e), j'habitais à la campagne")),
            rep(L("הלכתי לבית הספר ברגל", "Halakhti le-veit ha-sefer ba-regel", "J'allais à l'école à pied")),
            ask(L("איפה גדלת?", g("Eifo gadalta?", "Eifo gadalt?"), "Tu as grandi où ?"), L("גדלתי בליון, בצרפת", "Gadalti be-Lyon, be-Tsarfat", "J'ai grandi à Lyon, en France")),
            rep(L("זה היה מזמן!", "Ze haya mizman!", "C'était il y a longtemps !")),
            rep(L("היינו גרים ליד הים", "Hayinu garim leyad ha-yam", "Nous habitions près de la mer")),
            rep(L("שיחקתי כדורגל עם חברים", "Sikakhti kaduregel im khaverim", "Je jouais au foot avec des amis")),
            listen(L("גדלתי בליון", "Gadalti be-Lyon", "J'ai grandi à Lyon"), "Où a-t-il grandi ?", "À Lyon", "À Paris", "À Tel-Aviv", "À Haïfa"),
            swap("Mets au présent : « j'habitais » devient « j'habite ».", L("גרתי בכפר", "Garti ba-kfar", "J'habitais à la campagne"), L(g("אני גר בכפר", "אני גרה בכפר"), g("Ani gar ba-kfar", "Ani gara ba-kfar"), "J'habite à la campagne")),
            fill(L("הלכתי לבית הספר ברגל", "Halakhti le-veit ha-sefer ba-regel", "J'allais à l'école à pied"), "ברגל", "ba-regel"),
            free(L("איפה גדלת?", g("Eifo gadalta?", "Eifo gadalt?"), "Tu as grandi où ?"), L("גדלתי בליון, בצרפת", "Gadalti be-Lyon, be-Tsarfat", "J'ai grandi à Lyon, en France")),
          ], "un ami qui te pose des questions sur ton enfance", "Raconter où et comment tu as grandi", L(g("ספר לי, איפה גדלת?", "ספרי לי, איפה גדלת?"), g("Saper li, eifo gadalta?", "Sapri li, eifo gadalt?"), "Raconte-moi, tu as grandi où ?")),
          day("u6d2", "Demain, je…", L("מחר אני אלך לעבודה", "Makhar ani elekh la-avoda", "Demain, j'irai au travail"), [
            intro("Au futur, « je » commence par la lettre alef : elekh (j'irai à pied), esa (j'irai en véhicule), e'ese (je ferai)."),
            rep(L("מחר אני אלך לעבודה", "Makhar ani elekh la-avoda", "Demain, j'irai au travail")),
            rep(L("בערב אני אבשל ארוחה", "Ba-erev ani avashel arukha", "Ce soir, je cuisinerai un repas")),
            ask(L(g("מה תעשה בסוף השבוע?", "מה תעשי בסוף השבוע?"), g("Ma ta'ase be-sof ha-shavua?", "Ma ta'asi be-sof ha-shavua?"), "Qu'est-ce que tu feras ce week-end ?"), L("אני אפגוש חברים בתל אביב", "Ani efgosh khaverim be-Tel Aviv", "Je verrai des amis à Tel-Aviv")),
            rep(L("נראה!", "Nir'e!", "On verra !")),
            rep(L("בשבוע הבא אני אתחיל לעבוד", "Ba-shavua ha-ba ani atkhil la'avod", "La semaine prochaine, je commence à travailler")),
            rep(L("אולי אלך לים", "Ulai elekh la-yam", "Peut-être que j'irai à la plage")),
            listen(L("מחר אני אלך לעבודה", "Makhar ani elekh la-avoda", "Demain, j'irai au travail"), "Que fera-t-il ?", "Il ira au travail", "Il est allé au travail", "Il aime le travail", "Il cherche du travail"),
            swap("Dis ce soir au lieu de demain.", L("מחר אני אלך לעבודה", "Makhar ani elekh la-avoda", "Demain, j'irai au travail"), L("הערב אני אלך לעבודה", "Ha-erev ani elekh la-avoda", "Ce soir, j'irai au travail")),
            fill(L("בערב אני אבשל ארוחה", "Ba-erev ani avashel arukha", "Ce soir, je cuisinerai un repas"), "אבשל", "avashel"),
            free(L(g("מה תעשה בסוף השבוע?", "מה תעשי בסוף השבוע?"), g("Ma ta'ase be-sof ha-shavua?", "Ma ta'asi be-sof ha-shavua?"), "Qu'est-ce que tu feras ce week-end ?"), L("אני אפגוש חברים בתל אביב", "Ani efgosh khaverim be-Tel Aviv", "Je verrai des amis à Tel-Aviv")),
          ], "une amie qui organise le week-end", "Dire ce que tu feras", L(g("יש לך תוכניות למחר?", "יש לך תוכניות למחר?"), g("Yesh lekha tokhniyot le-makhar?", "Yesh lakh tokhniyot le-makhar?"), "Tu as des projets pour demain ?")),
          day("u6d3", "Parce que…", L(g("אני לומד עברית כי אני רוצה לגור בישראל", "אני לומדת עברית כי אני רוצה לגור בישראל"), g("Ani lomed ivrit ki ani rotse lagur be-Israel", "Ani lomedet ivrit ki ani rotsa lagur be-Israel"), "J'apprends l'hébreu parce que je veux vivre en Israël"), [
            intro("Pour expliquer : « ki » (parce que) devant une phrase, « biglal » (à cause de) devant un nom, « kedei » (pour) devant un infinitif."),
            rep(L(g("אני לומד עברית כי אני רוצה לגור בישראל", "אני לומדת עברית כי אני רוצה לגור בישראל"), g("Ani lomed ivrit ki ani rotse lagur be-Israel", "Ani lomedet ivrit ki ani rotsa lagur be-Israel"), "J'apprends l'hébreu parce que je veux vivre en Israël")),
            rep(L("בגלל הגשם נשארתי בבית", "Biglal ha-geshem nisharti ba-bayit", "À cause de la pluie, je suis resté(e) à la maison")),
            rep(L(g("אני חוסך כסף כדי לטייל", "אני חוסכת כסף כדי לטייל"), g("Ani khosekh kesef kedei letayel", "Ani khosekhet kesef kedei letayel"), "J'économise de l'argent pour voyager")),
            ask(L(g("למה אתה לומד עברית?", "למה את לומדת עברית?"), g("Lama ata lomed ivrit?", "Lama at lomedet ivrit?"), "Pourquoi tu apprends l'hébreu ?"), L("כי יש לי משפחה בישראל", "Ki yesh li mishpakha be-Israel", "Parce que j'ai de la famille en Israël")),
            rep(L(g("אני לא יוצא כי יורד גשם", "אני לא יוצאת כי יורד גשם"), g("Ani lo yotse ki yored geshem", "Ani lo yotset ki yored geshem"), "Je ne sors pas parce qu'il pleut")),
            listen(L("בגלל הגשם נשארתי בבית", "Biglal ha-geshem nisharti ba-bayit", "À cause de la pluie, je suis resté(e) à la maison"), "Pourquoi est-il resté ?", "À cause de la pluie", "À cause du travail", "À cause de la fatigue", "À cause du froid"),
            swap("Dis « parce que » au lieu de « à cause de ».", L("בגלל הגשם נשארתי בבית", "Biglal ha-geshem nisharti ba-bayit", "À cause de la pluie, je suis resté(e) à la maison"), L("נשארתי בבית כי ירד גשם", "Nisharti ba-bayit ki yarad geshem", "Je suis resté(e) à la maison parce qu'il a plu")),
            fill(L("כי יש לי משפחה בישראל", "Ki yesh li mishpakha be-Israel", "Parce que j'ai de la famille en Israël"), "כי", "ki"),
            free(L(g("למה אתה לומד עברית?", "למה את לומדת עברית?"), g("Lama ata lomed ivrit?", "Lama at lomedet ivrit?"), "Pourquoi tu apprends l'hébreu ?"), L("כי יש לי משפחה בישראל", "Ki yesh li mishpakha be-Israel", "Parce que j'ai de la famille en Israël")),
          ], "un camarade de cours d'hébreu", "Expliquer tes raisons", L(g("למה בחרת ללמוד עברית?", "למה בחרת ללמוד עברית?"), g("Lama bakharta lilmod ivrit?", "Lama bakhart lilmod ivrit?"), "Pourquoi tu as choisi d'apprendre l'hébreu ?")),
          day("u6d4", "À mon avis", L("לדעתי, זה רעיון טוב", "Le-da'ati, ze ra'ayon tov", "À mon avis, c'est une bonne idée"), [
            intro("Pour donner ton avis : « le-da'ati » (à mon avis) ou « ani khoshev / khoshevet she… » (je pense que…)."),
            rep(L("לדעתי, זה רעיון טוב", "Le-da'ati, ze ra'ayon tov", "À mon avis, c'est une bonne idée")),
            rep(L(g("אני חושב שזה יקר מדי", "אני חושבת שזה יקר מדי"), g("Ani khoshev she-ze yakar midai", "Ani khoshevet she-ze yakar midai"), "Je pense que c'est trop cher")),
            rep(L(g("אני מסכים", "אני מסכימה"), g("Ani maskim", "Ani maskima"), "Je suis d'accord")),
            ask(L(g("מה אתה חושב על תל אביב?", "מה את חושבת על תל אביב?"), g("Ma ata khoshev al Tel Aviv?", "Ma at khoshevet al Tel Aviv?"), "Qu'est-ce que tu penses de Tel-Aviv ?"), L("לדעתי, היא עיר יפה ומלאת חיים", "Le-da'ati, hi ir yafa u-mle'at khayim", "À mon avis, c'est une ville belle et pleine de vie")),
            rep(L(g("אני לא מסכים", "אני לא מסכימה"), g("Ani lo maskim", "Ani lo maskima"), "Je ne suis pas d'accord")),
            rep(L("זה תלוי", "Ze talui", "Ça dépend")),
            rep(L("בעיניי, זה מוגזם", "Be-einai, ze mugzam", "À mes yeux, c'est exagéré")),
            listen(L(g("אני מסכים", "אני מסכימה"), g("Ani maskim", "Ani maskima"), "Je suis d'accord"), "Quelle opinion entends-tu ?", "Il est d'accord", "Il n'est pas d'accord", "Il hésite", "Il pose une question"),
            swap("Dis que tu n'es pas d'accord.", L(g("אני מסכים", "אני מסכימה"), g("Ani maskim", "Ani maskima"), "Je suis d'accord"), L(g("אני לא מסכים", "אני לא מסכימה"), g("Ani lo maskim", "Ani lo maskima"), "Je ne suis pas d'accord")),
            fill(L("לדעתי, זה רעיון טוב", "Le-da'ati, ze ra'ayon tov", "À mon avis, c'est une bonne idée"), "לדעתי", "le-da'ati"),
            free(L(g("מה אתה חושב על תל אביב?", "מה את חושבת על תל אביב?"), g("Ma ata khoshev al Tel Aviv?", "Ma at khoshevet al Tel Aviv?"), "Qu'est-ce que tu penses de Tel-Aviv ?"), L("לדעתי, היא עיר יפה ומלאת חיים", "Le-da'ati, hi ir yafa u-mle'at khayim", "À mon avis, c'est une belle ville pleine de vie")),
          ], "un ami qui te demande ton avis", "Donner et défendre ton avis", L(g("מה דעתך, נלך למסעדה או נבשל בבית?", "מה דעתך, נלך למסעדה או נבשל בבית?"), g("Ma da'atkha, nelekh la-mis'ada o nevashel ba-bayit?", "Ma da'atekh, nelekh la-mis'ada o nevashel ba-bayit?"), "Qu'en penses-tu, on va au restaurant ou on cuisine à la maison ?")),
        ],
      },
      {
        id: "u7", title: "La vie pratique",
        days: [
          day("u7d1", "Chez le médecin", L("כואב לי הראש", "Ko'ev li ha-rosh", "J'ai mal à la tête"), [
            intro("Pour dire où tu as mal : « ko'ev li » + la partie du corps ; « ko'evet li » si elle est féminine (ha-beten, le ventre)."),
            rep(L("כואב לי הראש", "Ko'ev li ha-rosh", "J'ai mal à la tête")),
            rep(L("כואבת לי הבטן", "Ko'evet li ha-beten", "J'ai mal au ventre")),
            rep(L(g("אני מרגיש לא טוב", "אני מרגישה לא טוב"), g("Ani margish lo tov", "Ani margisha lo tov"), "Je ne me sens pas bien")),
            ask(L("מה כואב לך?", g("Ma ko'ev lekha?", "Ma ko'ev lakh?"), "Où as-tu mal ?"), L("כואב לי הגרון", "Ko'ev li ha-garon", "J'ai mal à la gorge")),
            rep(L("יש לי חום", "Yesh li khom", "J'ai de la fièvre")),
            rep(L("כואבות לי הרגליים", "Ko'avot li ha-raglayim", "J'ai mal aux jambes")),
            listen(L("כואב לי הראש", "Ko'ev li ha-rosh", "J'ai mal à la tête"), "Où a-t-il mal ?", "À la tête", "Au ventre", "À la gorge", "Aux jambes"),
            swap("Dis le ventre au lieu de la tête.", L("כואב לי הראש", "Ko'ev li ha-rosh", "J'ai mal à la tête"), L("כואבת לי הבטן", "Ko'evet li ha-beten", "J'ai mal au ventre")),
            fill(L("כואב לי הראש", "Ko'ev li ha-rosh", "J'ai mal à la tête"), "הראש", "ha-rosh"),
            free(L("מה כואב לך?", g("Ma ko'ev lekha?", "Ma ko'ev lakh?"), "Où as-tu mal ?"), L("כואב לי הגרון", "Ko'ev li ha-garon", "J'ai mal à la gorge")),
          ], "un médecin dans un dispensaire", "Expliquer ce qui ne va pas", L("שלום, מה הבעיה?", "Shalom, ma ha-be'aya?", "Bonjour, quel est le problème ?")),
          day("u7d2", "Louer un appartement", L(g("אני מחפש דירה להשכרה", "אני מחפשת דירה להשכרה"), g("Ani mekhapes dira le-haskara", "Ani mekhapeset dira le-haskara"), "Je cherche un appartement à louer"), [
            intro("Pour un appartement : « dira » (appartement), « kheder » (pièce), « skhar dira » (le loyer)."),
            rep(L(g("אני מחפש דירה להשכרה", "אני מחפשת דירה להשכרה"), g("Ani mekhapes dira le-haskara", "Ani mekhapeset dira le-haskara"), "Je cherche un appartement à louer")),
            rep(L("כמה חדרים יש בדירה?", "Kama khadarim yesh ba-dira?", "Combien de pièces il y a dans l'appartement ?")),
            rep(L("כמה עולה שכר הדירה?", "Kama ole skhar ha-dira?", "Combien coûte le loyer ?")),
            ask(L(g("איזו דירה אתה מחפש?", "איזו דירה את מחפשת?"), g("Eizo dira ata mekhapes?", "Eizo dira at mekhapeset?"), "Quel appartement tu cherches ?"), L("דירה עם שני חדרים, קרוב לים", "Dira im shnei khadarim, karov la-yam", "Un appartement de deux pièces, près de la mer")),
            rep(L("יש מעלית?", "Yesh ma'alit?", "Il y a un ascenseur ?")),
            rep(L("מתי אפשר לראות את הדירה?", "Matai efshar lir'ot et ha-dira?", "Quand peut-on visiter l'appartement ?")),
            listen(L("כמה עולה שכר הדירה?", "Kama ole skhar ha-dira?", "Combien coûte le loyer ?"), "Que demande-t-on ?", "Le prix du loyer", "Le nombre de pièces", "L'étage", "La date"),
            swap("Demande le nombre de pièces au lieu du loyer.", L("כמה עולה שכר הדירה?", "Kama ole skhar ha-dira?", "Combien coûte le loyer ?"), L("כמה חדרים יש בדירה?", "Kama khadarim yesh ba-dira?", "Combien de pièces il y a dans l'appartement ?")),
            fill(L(g("אני מחפש דירה להשכרה", "אני מחפשת דירה להשכרה"), g("Ani mekhapes dira le-haskara", "Ani mekhapeset dira le-haskara"), "Je cherche un appartement à louer"), "דירה", "dira"),
          ], "un agent immobilier", "Décrire l'appartement que tu cherches et demander le prix", L(g("שלום! אתה מחפש דירה?", "שלום! את מחפשת דירה?"), g("Shalom! Ata mekhapes dira?", "Shalom! At mekhapeset dira?"), "Bonjour ! Vous cherchez un appartement ?")),
          day("u7d3", "Au téléphone", L("אפשר לדבר עם דני?", "Efshar ledaber im Dani?", "Je peux parler à Dani ?"), [
            intro("Au téléphone, on répond « halo ». Pour demander quelqu'un : « efshar ledaber im… » (je peux parler à…)."),
            rep(L("הלו, מי מדבר?", "Halo, mi medaber?", "Allô, qui est à l'appareil ?")),
            rep(L("אפשר לדבר עם דני?", "Efshar ledaber im Dani?", "Je peux parler à Dani ?")),
            rep(L("אני אתקשר אחר כך", "Ani etkasher akhar kakh", "Je rappellerai plus tard")),
            ask(L("הוא לא כאן. רוצה להשאיר הודעה?", g("Hu lo kan. Rotse lehash'ir hoda'a?", "Hu lo kan. Rotsa lehash'ir hoda'a?"), "Il n'est pas là. Tu veux laisser un message ?"), L("כן, תגידי לו שהתקשרתי", "Ken, tagidi lo she-hitkasharti", "Oui, dis-lui que j'ai appelé (à une femme)")),
            rep(L(g("תגיד לו שהתקשרתי", "תגידי לו שהתקשרתי"), g("Tagid lo she-hitkasharti", "Tagidi lo she-hitkasharti"), "Dis-lui que j'ai appelé")),
            rep(L("אתקשר אליך מחר", g("Etkasher elekha makhar", "Etkasher elaikh makhar"), "Je t'appellerai demain")),
            listen(L("הוא לא כאן", "Hu lo kan", "Il n'est pas là"), "Que dit-on ?", "Il n'est pas là", "Il arrive", "Il est occupé", "Il a appelé"),
            swap("Dis « plus tard » au lieu de « demain ».", L("אתקשר מחר", "Etkasher makhar", "Je rappellerai demain"), L("אני אתקשר אחר כך", "Ani etkasher akhar kakh", "Je rappellerai plus tard")),
            fill(L("אפשר לדבר עם דני?", "Efshar ledaber im Dani?", "Je peux parler à Dani ?"), "לדבר", "ledaber"),
          ], "une collègue de Dani qui répond au téléphone", "Demander quelqu'un et laisser un message", L("הלו, משרד של דני, שלום.", "Halo, misrad shel Dani, shalom.", "Allô, bureau de Dani, bonjour.")),
          day("u7d4", "Au supermarché", L(g("איפה אני יכול למצוא חלב?", "איפה אני יכולה למצוא חלב?"), g("Eifo ani yakhol limtso khalav?", "Eifo ani yekhola limtso khalav?"), "Où est-ce que je peux trouver du lait ?"), [
            intro("Pour chercher un produit : « eifo ani yakhol / yekhola limtso… » (où est-ce que je peux trouver…)."),
            rep(L(g("איפה אני יכול למצוא חלב?", "איפה אני יכולה למצוא חלב?"), g("Eifo ani yakhol limtso khalav?", "Eifo ani yekhola limtso khalav?"), "Où est-ce que je peux trouver du lait ?")),
            rep(L("יש לכם לחם טרי?", "Yesh lakhem lekhem tari?", "Vous avez du pain frais ?")),
            rep(L(g("אני צריך שקית, בבקשה", "אני צריכה שקית, בבקשה"), g("Ani tsarikh sakit, bevakasha", "Ani tsrikha sakit, bevakasha"), "J'ai besoin d'un sac, s'il vous plaît")),
            ask(L("משהו נוסף?", "Mashehu nosaf?", "Autre chose ?"), L("לא, זה הכול. תודה!", "Lo, ze hakol. Toda!", "Non, c'est tout. Merci !")),
            rep(L("כמה זה עולה לקילו?", "Kama ze ole la-kilo?", "Combien ça coûte le kilo ?")),
            rep(L("אפשר שקית?", "Efshar sakit?", "Je peux avoir un sac ?")),
            rep(L("יש הנחה?", "Yesh hanakha?", "Il y a une réduction ?")),
            listen(L("משהו נוסף?", "Mashehu nosaf?", "Autre chose ?"), "Que demande la caissière ?", "Si tu veux autre chose", "Si tu as une carte", "Si tu veux un sac", "Combien tu paies"),
            swap("Dis que c'est tout.", L("משהו נוסף?", "Mashehu nosaf?", "Autre chose ?"), L("לא, זה הכול. תודה!", "Lo, ze hakol. Toda!", "Non, c'est tout. Merci !")),
            fill(L("לא, זה הכול. תודה!", "Lo, ze hakol. Toda!", "Non, c'est tout. Merci !"), "הכול", "hakol"),
          ], "un caissier de supermarché", "Trouver des produits et payer", L("שלום! מצאת הכול?", g("Shalom! Matsata hakol?", "Shalom! Matsat hakol?"), "Bonjour ! Vous avez tout trouvé ?")),
          day("u7d5", "Comme à Tel-Aviv", L("אני אקח קפה", "Ani ekakh kafe", "Je prends un café"), [
            intro("Au café, on dit plus volontiers « efshar kafe ? » ou « ani ekakh kafe » (je prends un café) que « ani rotse ». Et pour un futur proche, on utilise souvent le présent : « makhar ani nose'a », demain je pars."),
            rep(L("אפשר קפה הפוך?", "Efshar kafe hafukh?", "Je peux avoir un café au lait ?")),
            rep(L("אני אקח קפה", "Ani ekakh kafe", "Je prends un café")),
            rep(L("פה או לקחת?", "Po o lakakhat?", "Sur place ou à emporter ?")),
            rep(L(g("מחר אני נוסע לחיפה", "מחר אני נוסעת לחיפה"), g("Makhar ani nose'a le-Khaifa", "Makhar ani nosa'at le-Khaifa"), "Demain je pars à Haïfa")),
            listen(L("פה או לקחת?", "Po o lakakhat?", "Sur place ou à emporter ?"), "Que te demande le serveur ?", "Sur place ou à emporter", "Avec ou sans sucre", "Petit ou grand", "Chaud ou froid"),
            ask(L("פה או לקחת?", "Po o lakakhat?", "Sur place ou à emporter ?"), L("לקחת, בבקשה", "Lakakhat, bevakasha", "À emporter, s'il vous plaît")),
            swap("Passe de « je veux » à la façon polie.", L("אני רוצה קפה", g("Ani rotse kafe", "Ani rotsa kafe"), "Je veux un café"), L("אפשר קפה?", "Efshar kafe?", "Je peux avoir un café ?")),
          ], "un barista dans un café de Tel-Aviv", "Commander naturellement et répondre à « sur place ou à emporter ? »", L("היי, מה אפשר להביא לך?", g("Hai, ma efshar lehavi lekha?", "Hai, ma efshar lehavi lakh?"), "Salut, qu'est-ce que je peux t'apporter ?")),
        ],
      },
    ],
  },
  {
    id: "int2", title: "Intermédiaire 2", cefr: "B2",
    units: [
      {
        id: "u8", title: "Hypothèses et nuances",
        days: [
          day("u8d1", "Si j'étais…", L(g("אם הייתי עשיר, הייתי נוסע לכל העולם", "אם הייתי עשירה, הייתי נוסעת לכל העולם"), g("Im hayiti ashir, hayiti nose'a le-khol ha-olam", "Im hayiti ashira, hayiti nosa'at le-khol ha-olam"), "Si j'étais riche, je voyagerais dans le monde entier"), [
            intro("Le conditionnel se forme avec « hayiti » suivi du verbe au présent : hayiti nose'a, je voyagerais. « Im » veut dire « si »."),
            rep(L(g("אם הייתי עשיר, הייתי נוסע לכל העולם", "אם הייתי עשירה, הייתי נוסעת לכל העולם"), g("Im hayiti ashir, hayiti nose'a le-khol ha-olam", "Im hayiti ashira, hayiti nosa'at le-khol ha-olam"), "Si j'étais riche, je voyagerais dans le monde entier")),
            rep(L(g("הייתי שמח לעזור", "הייתי שמחה לעזור"), g("Hayiti same'akh la'azor", "Hayiti smekha la'azor"), "Je serais content(e) d'aider")),
            rep(L(g("אילו ידעתי, הייתי בא", "אילו ידעתי, הייתי באה"), g("Ilu yadati, hayiti ba", "Ilu yadati, hayiti ba'a"), "Si j'avais su, je serais venu(e)")),
            ask(L(g("מה היית עושה עם מיליון שקל?", "מה היית עושה עם מיליון שקל?"), g("Ma hayita ose im milyon shekel?", "Ma hayit osa im milyon shekel?"), "Qu'est-ce que tu ferais avec un million de shekels ?"), L("הייתי קונה דירה ליד הים", g("Hayiti kone dira leyad ha-yam", "Hayiti kona dira leyad ha-yam"), "J'achèterais un appartement près de la mer")),
            rep(L(g("אם היה לי זמן, הייתי מטייל יותר", "אם היה לי זמן, הייתי מטיילת יותר"), g("Im haya li zman, hayiti metayel yoter", "Im haya li zman, hayiti metayelet yoter"), "Si j'avais du temps, je voyagerais plus")),
            listen(L(g("הייתי שמח לעזור", "הייתי שמחה לעזור"), g("Hayiti same'akh la'azor", "Hayiti smekha la'azor"), "Je serais content(e) d'aider"), "Que dit-il ?", "Qu'il serait content d'aider", "Qu'il refuse d'aider", "Qu'il a aidé hier", "Qu'il demande de l'aide"),
            swap("Mets au conditionnel : « je voyage » devient « je voyagerais ».", L(g("אני נוסע לכל העולם", "אני נוסעת לכל העולם"), g("Ani nose'a le-khol ha-olam", "Ani nosa'at le-khol ha-olam"), "Je voyage dans le monde entier"), L(g("הייתי נוסע לכל העולם", "הייתי נוסעת לכל העולם"), g("Hayiti nose'a le-khol ha-olam", "Hayiti nosa'at le-khol ha-olam"), "Je voyagerais dans le monde entier")),
            fill(L(g("הייתי שמח לעזור", "הייתי שמחה לעזור"), g("Hayiti same'akh la'azor", "Hayiti smekha la'azor"), "Je serais content(e) d'aider"), "הייתי", "hayiti"),
            free(L("מה היית עושה עם מיליון שקל?", g("Ma hayita ose im milyon shekel?", "Ma hayit osa im milyon shekel?"), "Qu'est-ce que tu ferais avec un million de shekels ?"), L("הייתי קונה דירה ליד הים", g("Hayiti kone dira leyad ha-yam", "Hayiti kona dira leyad ha-yam"), "J'achèterais un appartement près de la mer")),
          ], "un ami qui rêve à voix haute", "Imaginer et faire des hypothèses", L(g("אם היית יכול לגור בכל מקום, איפה היית גר?", "אם היית יכולה לגור בכל מקום, איפה היית גרה?"), g("Im hayita yakhol lagur be-khol makom, eifo hayita gar?", "Im hayit yekhola lagur be-khol makom, eifo hayit gara?"), "Si tu pouvais vivre n'importe où, où est-ce que tu vivrais ?")),
          day("u8d2", "Nuancer", L("מצד אחד זה נוח, מצד שני זה יקר", "Mi-tsad ekhad ze no'akh, mi-tsad sheni ze yakar", "D'un côté c'est pratique, de l'autre c'est cher"), [
            intro("Pour nuancer : « mi-tsad ekhad… mi-tsad sheni… » (d'un côté… de l'autre…), « lamrot she… » (bien que…), « be-sakh ha-kol » (dans l'ensemble)."),
            rep(L("מצד אחד זה נוח, מצד שני זה יקר", "Mi-tsad ekhad ze no'akh, mi-tsad sheni ze yakar", "D'un côté c'est pratique, de l'autre c'est cher")),
            rep(L("למרות שירד גשם, יצאנו לטייל", "Lamrot she-yarad geshem, yatsanu letayel", "Bien qu'il ait plu, nous sommes sortis nous promener")),
            rep(L(g("בסך הכול, אני מרוצה", "בסך הכול, אני מרוצה"), g("Be-sakh ha-kol, ani merutse", "Be-sakh ha-kol, ani merutsa"), "Dans l'ensemble, je suis satisfait(e)")),
            ask(L("מה דעתך על עבודה מהבית?", g("Ma da'atkha al avoda me-ha-bayit?", "Ma da'atekh al avoda me-ha-bayit?"), "Qu'est-ce que tu penses du travail à la maison ?"), L("מצד אחד זה נוח, מצד שני חסרים לי האנשים", "Mi-tsad ekhad ze no'akh, mi-tsad sheni khaserim li ha-anashim", "D'un côté c'est pratique, de l'autre les gens me manquent")),
            rep(L("אמנם זה יקר, אבל זה שווה את זה", "Omnam ze yakar, aval ze shave et ze", "Certes c'est cher, mais ça vaut le coup")),
            rep(L("זה תלוי בכמה זמן יש לך", g("Ze talui be-kama zman yesh lekha", "Ze talui be-kama zman yesh lakh"), "Ça dépend du temps que tu as")),
            listen(L("למרות שירד גשם, יצאנו לטייל", "Lamrot she-yarad geshem, yatsanu letayel", "Bien qu'il ait plu, nous sommes sortis nous promener"), "Qu'ont-ils fait ?", "Ils sont sortis malgré la pluie", "Ils sont restés à cause de la pluie", "Ils n'ont pas voyagé", "Il n'a pas plu"),
            swap("Remplace « mais » par « bien que ».", L("ירד גשם אבל יצאנו", "Yarad geshem aval yatsanu", "Il a plu mais nous sommes sortis"), L("למרות שירד גשם, יצאנו", "Lamrot she-yarad geshem, yatsanu", "Bien qu'il ait plu, nous sommes sortis")),
            fill(L("מצד אחד זה נוח, מצד שני זה יקר", "Mi-tsad ekhad ze no'akh, mi-tsad sheni ze yakar", "D'un côté c'est pratique, de l'autre c'est cher"), "שני", "sheni"),
            free(L("מה דעתך על עבודה מהבית?", g("Ma da'atkha al avoda me-ha-bayit?", "Ma da'atekh al avoda me-ha-bayit?"), "Qu'est-ce que tu penses du travail à la maison ?"), L("מצד אחד זה נוח, מצד שני חסרים לי האנשים", "Mi-tsad ekhad ze no'akh, mi-tsad sheni khaserim li ha-anashim", "D'un côté c'est pratique, de l'autre les gens me manquent")),
          ], "une collègue qui hésite à travailler de chez elle", "Peser le pour et le contre", L("אני חושבת לעבוד מהבית. מה דעתך?", g("Ani khoshevet la'avod me-ha-bayit. Ma da'atkha?", "Ani khoshevet la'avod me-ha-bayit. Ma da'atekh?"), "Je pense travailler de chez moi. Qu'est-ce que tu en penses ?")),
          day("u8d3", "Regrets et souhaits", L(g("הלוואי שהייתי מדבר עברית שוטפת", "הלוואי שהייתי מדברת עברית שוטפת"), g("Halevai she-hayiti medaber ivrit shotefet", "Halevai she-hayiti medaberet ivrit shotefet"), "Si seulement je parlais couramment hébreu"), [
            intro("Pour un souhait : « halevai » (si seulement). Pour un regret : « khaval she… » (dommage que…) ou « ani mitsta'er / mitsta'eret she… » (je regrette que…)."),
            rep(L(g("הלוואי שהייתי מדבר עברית שוטפת", "הלוואי שהייתי מדברת עברית שוטפת"), g("Halevai she-hayiti medaber ivrit shotefet", "Halevai she-hayiti medaberet ivrit shotefet"), "Si seulement je parlais couramment hébreu")),
            rep(L("חבל שלא הספקתי לראות את הכול", "Khaval she-lo hispakti lir'ot et ha-kol", "Dommage que je n'aie pas eu le temps de tout voir")),
            ask(L(g("על מה אתה מצטער?", "על מה את מצטערת?"), g("Al ma ata mitsta'er?", "Al ma at mitsta'eret?"), "Qu'est-ce que tu regrettes ?"), L(g("אני מצטער שלא למדתי עברית קודם", "אני מצטערת שלא למדתי עברית קודם"), g("Ani mitsta'er she-lo lamadti ivrit kodem", "Ani mitsta'eret she-lo lamadti ivrit kodem"), "Je regrette de ne pas avoir appris l'hébreu plus tôt")),
            rep(L("חבל שלא באתי", "Khaval she-lo bati", "Dommage que je ne sois pas venu(e)")),
            rep(L("הלוואי שיהיה יותר זמן", "Halevai she-yihye yoter zman", "Pourvu qu'il y ait plus de temps")),
            listen(L("חבל שלא הספקתי לראות את הכול", "Khaval she-lo hispakti lir'ot et ha-kol", "Dommage que je n'aie pas eu le temps de tout voir"), "Que regrette-t-il ?", "De ne pas avoir tout vu", "D'avoir trop vu", "D'être arrivé en retard", "D'avoir trop dépensé"),
            swap("Exprime un souhait au lieu d'un regret.", L("חבל שלא היה לי זמן", "Khaval she-lo haya li zman", "Dommage que je n'aie pas eu le temps"), L("הלוואי שהיה לי זמן", "Halevai she-haya li zman", "Si seulement j'avais eu le temps")),
            fill(L("הלוואי שיהיה יותר זמן", "Halevai she-yihye yoter zman", "Pourvu qu'il y ait plus de temps"), "הלוואי", "halevai"),
            free(L(g("על מה אתה מצטער?", "על מה את מצטערת?"), g("Al ma ata mitsta'er?", "Al ma at mitsta'eret?"), "Qu'est-ce que tu regrettes ?"), L(g("אני מצטער שלא למדתי עברית קודם", "אני מצטערת שלא למדתי עברית קודם"), g("Ani mitsta'er she-lo lamadti ivrit kodem", "Ani mitsta'eret she-lo lamadti ivrit kodem"), "Je regrette de ne pas avoir appris l'hébreu plus tôt")),
          ], "un ami qui parle de ses rêves", "Exprimer des regrets et des souhaits", L(g("אם היית יכול לשנות משהו בעבר, מה היית משנה?", "אם היית יכולה לשנות משהו בעבר, מה היית משנה?"), g("Im hayita yakhol leshanot mashehu ba-avar, ma hayita meshane?", "Im hayit yekhola leshanot mashehu ba-avar, ma hayit meshana?"), "Si tu pouvais changer quelque chose dans le passé, qu'est-ce que tu changerais ?")),
          day("u8d4", "Raconter une histoire", L("פתאום התחיל לרדת גשם", "Pit'om hitkhil laredet geshem", "Soudain, il a commencé à pleuvoir"), [
            intro("Pour enchaîner un récit : « kodem » (d'abord), « akhar kakh » (ensuite), « pit'om » (soudain), « ba-sof » (à la fin)."),
            rep(L("קודם הלכנו לשוק, אחר כך ישבנו בבית קפה", "Kodem halakhnu la-shuk, akhar kakh yashavnu be-veit kafe", "D'abord on est allés au marché, ensuite on s'est assis dans un café")),
            rep(L("פתאום התחיל לרדת גשם", "Pit'om hitkhil laredet geshem", "Soudain, il a commencé à pleuvoir")),
            rep(L("בסוף הכול נגמר טוב", "Ba-sof ha-kol nigmar tov", "À la fin, tout s'est bien terminé")),
            ask(L("מה קרה בטיול?", "Ma kara ba-tiyul?", "Qu'est-ce qui s'est passé pendant le voyage ?"), L("הלכנו לאיבוד, אבל מצאנו מסעדה נהדרת", "Halakhnu le-ibud, aval matsanu mis'ada nehederet", "On s'est perdus, mais on a trouvé un super restaurant")),
            rep(L("בסוף הגענו בזמן", "Ba-sof higanu ba-zman", "Finalement nous sommes arrivés à temps")),
            rep(L("בינתיים התחיל לרדת גשם", "Beinatayim hitkhil laredet geshem", "Entre-temps, il a commencé à pleuvoir")),
            listen(L("פתאום התחיל לרדת גשם", "Pit'om hitkhil laredet geshem", "Soudain, il a commencé à pleuvoir"), "Que s'est-il passé ?", "Il s'est mis à pleuvoir soudain", "Il a cessé de pleuvoir", "Il y a eu du soleil", "Il neigeait"),
            swap("Remplace « d'abord » par « ensuite ».", L("קודם הלכנו לשוק", "Kodem halakhnu la-shuk", "D'abord on est allés au marché"), L("אחר כך הלכנו לשוק", "Akhar kakh halakhnu la-shuk", "Ensuite on est allés au marché")),
            fill(L("פתאום התחיל לרדת גשם", "Pit'om hitkhil laredet geshem", "Soudain, il a commencé à pleuvoir"), "פתאום", "pit'om"),
            free(L("מה קרה בטיול?", "Ma kara ba-tiyul?", "Qu'est-ce qui s'est passé pendant le voyage ?"), L("הלכנו לאיבוד, אבל מצאנו מסעדה נהדרת", "Halakhnu le-ibud, aval matsanu mis'ada nehederet", "On s'est perdus, mais on a trouvé un super restaurant")),
          ], "une amie qui veut entendre une anecdote", "Raconter une histoire avec des étapes", L(g("ספר לי משהו מצחיק שקרה לך", "ספרי לי משהו מצחיק שקרה לך"), g("Saper li mashehu matskhik she-kara lekha", "Sapri li mashehu matskhik she-kara lakh"), "Raconte-moi un truc drôle qui t'est arrivé")),
        ],
      },
      {
        id: "u9", title: "Travail et société",
        days: [
          day("u9d1", "L'entretien d'embauche", L("יש לי ניסיון של חמש שנים בתחום", "Yesh li nisayon shel khamesh shanim ba-tkhum", "J'ai cinq ans d'expérience dans le domaine"), [
            intro("En entretien : « nisayon » (expérience), « tkhum » (domaine), « tsevet » (équipe). Les qualités s'accordent avec toi : akhra'i / akhra'it (responsable)."),
            rep(L("יש לי ניסיון של חמש שנים בתחום", "Yesh li nisayon shel khamesh shanim ba-tkhum", "J'ai cinq ans d'expérience dans le domaine")),
            rep(L(g("אני אחראי ויודע לעבוד בצוות", "אני אחראית ויודעת לעבוד בצוות"), g("Ani akhra'i ve-yode'a la'avod be-tsevet", "Ani akhra'it ve-yoda'at la'avod be-tsevet"), "Je suis responsable et je sais travailler en équipe")),
            ask(L(g("למה אתה רוצה לעבוד אצלנו?", "למה את רוצה לעבוד אצלנו?"), g("Lama ata rotse la'avod etslenu?", "Lama at rotsa la'avod etslenu?"), "Pourquoi veux-tu travailler chez nous ?"), L("כי החברה שלכם מובילה בתחום", "Ki ha-khevra shelakhem movila ba-tkhum", "Parce que votre entreprise est leader dans le domaine")),
            rep(L(g("אני מחפש אתגר חדש", "אני מחפשת אתגר חדש"), g("Ani mekhapes etgar khadash", "Ani mekhapeset etgar khadash"), "Je cherche un nouveau défi")),
            listen(L("יש לי ניסיון של חמש שנים בתחום", "Yesh li nisayon shel khamesh shanim ba-tkhum", "J'ai cinq ans d'expérience dans le domaine"), "Que dit le candidat ?", "Il a cinq ans d'expérience", "Il cherche un emploi depuis cinq ans", "Il a fini ses études", "Il parle cinq langues"),
            swap("Dis trois ans au lieu de cinq.", L("יש לי ניסיון של חמש שנים בתחום", "Yesh li nisayon shel khamesh shanim ba-tkhum", "J'ai cinq ans d'expérience dans le domaine"), L("יש לי ניסיון של שלוש שנים בתחום", "Yesh li nisayon shel shalosh shanim ba-tkhum", "J'ai trois ans d'expérience dans le domaine")),
            fill(L("כי החברה שלכם מובילה בתחום", "Ki ha-khevra shelakhem movila ba-tkhum", "Parce que votre entreprise est leader dans le domaine"), "מובילה", "movila"),
            free(L(g("ספר לי על הניסיון המקצועי שלך", "ספרי לי על הניסיון המקצועי שלך"), g("Saper li al ha-nisayon ha-miktso'i shelkha", "Sapri li al ha-nisayon ha-miktso'i shelakh"), "Parle-moi de ton expérience professionnelle"), L("יש לי ניסיון של חמש שנים בתחום", "Yesh li nisayon shel khamesh shanim ba-tkhum", "J'ai cinq ans d'expérience dans le domaine")),
          ], "une recruteuse dans une start-up de Tel-Aviv", "Présenter ton expérience et tes qualités", L(g("ספר לי על הניסיון המקצועי שלך", "ספרי לי על הניסיון המקצועי שלך"), g("Saper li al ha-nisayon ha-miktso'i shelkha", "Sapri li al ha-nisayon ha-miktso'i shelakh"), "Parle-moi de ton expérience professionnelle")),
          day("u9d2", "En réunion", L(g("אני מציע שנדחה את הפגישה", "אני מציעה שנדחה את הפגישה"), g("Ani matsi'a she-nidkhe et ha-pgisha", "Ani matsi'a she-nidkhe et ha-pgisha"), "Je propose qu'on reporte la réunion"), [
            intro("Pour proposer : « ani matsi'a she… » + futur (je propose que…). Pour décider ensemble : « bo'u… » + futur (allons…, décidons…)."),
            rep(L(g("אני מציע שנדחה את הפגישה", "אני מציעה שנדחה את הפגישה"), g("Ani matsi'a she-nidkhe et ha-pgisha", "Ani matsi'a she-nidkhe et ha-pgisha"), "Je propose qu'on reporte la réunion")),
            rep(L(g("אני לא בטוח שזה רעיון טוב", "אני לא בטוחה שזה רעיון טוב"), g("Ani lo batu'akh she-ze ra'ayon tov", "Ani lo betukha she-ze ra'ayon tov"), "Je ne suis pas sûr(e) que ce soit une bonne idée")),
            rep(L("בואו נחליט עד יום חמישי", "Bo'u nakhlit ad yom khamishi", "Décidons d'ici jeudi")),
            ask(L("מתי נוח לכולם להיפגש?", "Matai no'akh le-kulam lehipagesh?", "Quand est-ce que ça arrange tout le monde de se réunir ?"), L("ביום ראשון בבוקר, אם אפשר", "Be-yom rishon ba-boker, im efshar", "Dimanche matin, si possible")),
            rep(L(g("אני מסכים עם ההצעה", "אני מסכימה עם ההצעה"), g("Ani maskim im ha-hatsa'a", "Ani maskima im ha-hatsa'a"), "Je suis d'accord avec la proposition")),
            rep(L("בואו נעבור לנושא הבא", "Bo'u na'avor la-nose ha-ba", "Passons au sujet suivant")),
            listen(L("בואו נחליט עד יום חמישי", "Bo'u nakhlit ad yom khamishi", "Décidons d'ici jeudi"), "Que propose-t-on ?", "De décider d'ici jeudi", "De reporter la réunion", "D'annuler le projet", "De se revoir lundi"),
            swap("Dis que tu n'es pas sûr(e) de l'idée.", L(g("אני מציע שנדחה את הפגישה", "אני מציעה שנדחה את הפגישה"), g("Ani matsi'a she-nidkhe et ha-pgisha", "Ani matsi'a she-nidkhe et ha-pgisha"), "Je propose qu'on reporte la réunion"), L(g("אני לא בטוח שזה רעיון טוב", "אני לא בטוחה שזה רעיון טוב"), g("Ani lo batu'akh she-ze ra'ayon tov", "Ani lo betukha she-ze ra'ayon tov"), "Je ne suis pas sûr(e) que ce soit une bonne idée")),
            fill(L("בואו נחליט עד יום חמישי", "Bo'u nakhlit ad yom khamishi", "Décidons d'ici jeudi"), "נחליט", "nakhlit"),
          ], "un chef d'équipe en réunion", "Proposer, accepter ou refuser une idée", L("יש לנו בעיה עם לוח הזמנים. מה אתם מציעים?", "Yesh lanu be'aya im lu'akh ha-zmanim. Ma atem matsi'im?", "On a un problème de calendrier. Qu'est-ce que vous proposez ?")),
          day("u9d3", "L'actualité", L("קראתי בחדשות שהמחירים עלו", "Karati ba-khadashot she-ha-mekhirim alu", "J'ai lu dans les infos que les prix ont augmenté"), [
            intro("Pour rapporter une information : « karati she… » (j'ai lu que…), « shamati she… » (j'ai entendu que…), « lefi… » (selon…)."),
            rep(L("קראתי בחדשות שהמחירים עלו", "Karati ba-khadashot she-ha-mekhirim alu", "J'ai lu dans les infos que les prix ont augmenté")),
            rep(L("לפי התחזית, מחר יהיה חם", "Lefi ha-takhazit, makhar yihye kham", "D'après la météo, demain il fera chaud")),
            rep(L("שמעתי שיש שביתה ברכבת", "Shamati she-yesh shvita ba-rakevet", "J'ai entendu qu'il y a une grève des trains")),
            ask(L("מה חדש בחדשות?", "Ma khadash ba-khadashot?", "Quoi de neuf dans l'actualité ?"), L("שמעתי שפותחים קו רכבת חדש", "Shamati she-potkhim kav rakevet khadash", "J'ai entendu qu'on ouvre une nouvelle ligne de train")),
            rep(L("בחדשות אמרו שיירד גשם", "Ba-khadashot amru she-yered geshem", "Aux infos, ils ont dit qu'il va pleuvoir")),
            rep(L("לפי הדיווחים, יש עיכובים", "Lefi ha-divukhim, yesh ikuvim", "D'après les reportages, il y a des retards")),
            listen(L("שמעתי שיש שביתה ברכבת", "Shamati she-yesh shvita ba-rakevet", "J'ai entendu qu'il y a une grève des trains"), "Qu'a-t-il entendu ?", "Qu'il y a une grève des trains", "Que les trains sont gratuits", "Qu'il y a un nouveau train", "Que la gare ferme"),
            swap("Dis « j'ai lu » au lieu de « j'ai entendu ».", L("שמעתי שיש שביתה ברכבת", "Shamati she-yesh shvita ba-rakevet", "J'ai entendu qu'il y a une grève des trains"), L("קראתי שיש שביתה ברכבת", "Karati she-yesh shvita ba-rakevet", "J'ai lu qu'il y a une grève des trains")),
            fill(L("לפי התחזית, מחר יהיה חם", "Lefi ha-takhazit, makhar yihye kham", "D'après la météo, demain il fera chaud"), "לפי", "lefi"),
            free(L("מה חדש בחדשות?", "Ma khadash ba-khadashot?", "Quoi de neuf dans l'actualité ?"), L("שמעתי שפותחים קו רכבת חדש", "Shamati she-potkhim kav rakevet khadash", "J'ai entendu qu'on ouvre une nouvelle ligne de train")),
          ], "un voisin qui commente l'actualité", "Rapporter une information et réagir", L("שמעת מה קרה אתמול?", g("Shamata ma kara etmol?", "Shamat ma kara etmol?"), "Tu as entendu ce qui s'est passé hier ?")),
          day("u9d4", "Une réclamation", L("אני רוצה להגיש תלונה", g("Ani rotse lehagish tluna", "Ani rotsa lehagish tluna"), "Je voudrais déposer une réclamation"), [
            intro("Pour te plaindre poliment : « le-marbe ha-tsa'ar » (malheureusement), « hayiti rotse / rotsa… » (je voudrais…)."),
            rep(L("אני רוצה להגיש תלונה", g("Ani rotse lehagish tluna", "Ani rotsa lehagish tluna"), "Je voudrais déposer une réclamation")),
            rep(L("למרבה הצער, ההזמנה הגיעה שבורה", "Le-marbe ha-tsa'ar, ha-hazmana higi'a shvura", "Malheureusement, la commande est arrivée cassée")),
            rep(L("הייתי רוצה לקבל החזר כספי", g("Hayiti rotse lekabel hekhzer kaspi", "Hayiti rotsa lekabel hekhzer kaspi"), "Je voudrais être remboursé(e)")),
            ask(L("איך אפשר לעזור?", "Eikh efshar la'azor?", "Comment peut-on vous aider ?"), L("קניתי מכונת קפה והיא לא עובדת", "Kaniti mekhonat kafe ve-hi lo ovedet", "J'ai acheté une machine à café et elle ne marche pas")),
            rep(L("זה לא מה שהזמנתי", "Ze lo ma she-hizmanti", "Ce n'est pas ce que j'ai commandé")),
            rep(L(g("אני מבקש לקבל החזר", "אני מבקשת לקבל החזר"), g("Ani mevakesh lekabel hekhzer", "Ani mevakeshet lekabel hekhzer"), "Je demande à être remboursé(e)")),
            listen(L("קניתי מכונת קפה והיא לא עובדת", "Kaniti mekhonat kafe ve-hi lo ovedet", "J'ai acheté une machine à café et elle ne marche pas"), "Quel est le problème ?", "Une machine à café en panne", "Un café trop cher", "Un retard de livraison", "Un mauvais accueil"),
            swap("Dis « cassée » au lieu de « ne marche pas ».", L("המכונה לא עובדת", "Ha-mekhona lo ovedet", "La machine ne marche pas"), L("המכונה שבורה", "Ha-mekhona shvura", "La machine est cassée")),
            fill(L("אני רוצה להגיש תלונה", g("Ani rotse lehagish tluna", "Ani rotsa lehagish tluna"), "Je voudrais déposer une réclamation"), "תלונה", "tluna"),
          ], "un employé du service client", "Expliquer un problème et obtenir une solution", L("שירות לקוחות, שלום. במה אפשר לעזור?", "Sherut lakokhot, shalom. Ba-me efshar la'azor?", "Service client, bonjour. Comment puis-je vous aider ?")),
          day("u9d5", "Réagir avec des mots courts", L("אין מצב!", "Ein matsav!", "Pas possible !"), [
            intro("Les Israéliens réagissent avec des mots courts : « ein matsav » (pas possible), « ma pit'om » (mais enfin, pas du tout), « davka » (justement, contre toute attente), « stam » (pour rien, comme ça)."),
            rep(L("אין מצב!", "Ein matsav!", "Pas possible !")),
            rep(L("מה פתאום!", "Ma pit'om!", "Mais pas du tout !")),
            rep(L("דווקא טעים", "Davka ta'im", "En fait, c'est bon (contre toute attente)")),
            rep(L("סתם, בלי סיבה", "Stam, bli siba", "Comme ça, sans raison")),
            listen(L("מה פתאום!", "Ma pit'om!", "Mais pas du tout !"), "Quelle est la réaction ?", "Il refuse fermement", "Il est d'accord", "Il hésite", "Il remercie"),
            ask(L("שמעת שדני עוזב את העבודה?", g("Shamata she-Dani ozev et ha-avoda?", "Shamat she-Dani ozev et ha-avoda?"), "Tu as entendu que Dani quitte son travail ?"), L("אין מצב! באמת?", "Ein matsav! Be'emet?", "Pas possible ! Vraiment ?")),
            fill(L("מה פתאום!", "Ma pit'om!", "Mais pas du tout !"), "פתאום", "pit'om"),
          ], "une collègue qui raconte un potin", "Réagir avec des expressions vivantes", L(g("תקשיב, יש לי חדשות! דני עוזב את החברה.", "תקשיבי, יש לי חדשות! דני עוזב את החברה."), g("Takshiv, yesh li khadashot! Dani ozev et ha-khevra.", "Takshivi, yesh li khadashot! Dani ozev et ha-khevra."), "Écoute, j'ai des nouvelles ! Dani quitte l'entreprise.")),
        ],
      },
    ],
  },
  {
    id: "adv1", title: "Avancé 1", cefr: "C1",
    units: [
      {
        id: "u10", title: "Débattre et nuancer",
        days: [
          day("u10d1", "Les relatives avec « she- »", L("הספר שקראתי היה מרתק", "Ha-sefer she-karati haya martek", "Le livre que j'ai lu était passionnant"), [
            intro("« She- » relie une phrase à un nom : ha-sefer she-karati, le livre que j'ai lu. Quand le nom est complément d'une préposition, on ajoute un pronom : ha-nose she-alav, le sujet dont (sur lequel) on parle."),
            rep(L("הספר שקראתי היה מרתק", "Ha-sefer she-karati haya martek", "Le livre que j'ai lu était passionnant")),
            rep(L("הנושא שעליו אנחנו מדברים חשוב", "Ha-nose she-alav anakhnu medabrim khashuv", "Le sujet dont nous parlons est important")),
            rep(L("מי שרוצה להצליח צריך להתאמץ", "Mi she-rotse lehatslia tsarikh lehit'ame'ets", "Celui qui veut réussir doit faire des efforts")),
            listen(L("הספר שקראתי היה מרתק", "Ha-sefer she-karati haya martek", "Le livre que j'ai lu était passionnant"), "De quoi parle-t-on ?", "D'un livre qu'on a lu", "D'un film qu'on va voir", "D'un restaurant fermé", "D'un voyage annulé"),
            swap("Fais une phrase avec « she- » : le film que j'ai vu.", L("ראיתי סרט", "Ra'iti seret", "J'ai vu un film"), L("הסרט שראיתי היה טוב", "Ha-seret she-ra'iti haya tov", "Le film que j'ai vu était bien")),
            fill(L("הספר שקראתי היה מרתק", "Ha-sefer she-karati haya martek", "Le livre que j'ai lu était passionnant"), "שקראתי", "she-karati"),
            ask(L("איזה ספר אהבת?", g("Eize sefer ahavta?", "Eize sefer ahavt?"), "Quel livre as-tu aimé ?"), L("הספר שקראתי בקיץ היה מרתק", "Ha-sefer she-karati ba-kaitz haya martek", "Le livre que j'ai lu cet été était passionnant")),
          ], "un ami qui cherche un livre à lire", "Recommander et décrire avec des relatives", L(g("איזה ספר היית ממליץ לי?", "איזה ספר היית ממליצה לי?"), g("Eize sefer hayita mamlits li?", "Eize sefer hayit mamlitsa li?"), "Quel livre me recommanderais-tu ?")),
          day("u10d2", "Sans dire qui l'a fait", L("הפגישה נדחתה", "Ha-pgisha nidkheta", "La réunion a été reportée"), [
            intro("Pour dire qu'une chose a changé sans dire qui l'a faite, l'hébreu utilise souvent la forme en « ni- » (nif'al) : ha-delet niftekha, la porte s'est ouverte ; ha-pgisha nidkheta, la réunion a été reportée."),
            rep(L("הפגישה נדחתה", "Ha-pgisha nidkheta", "La réunion a été reportée")),
            rep(L("הדלת נפתחה", "Ha-delet niftekha", "La porte s'est ouverte")),
            rep(L("המסעדה נסגרה", "Ha-mis'ada nisgera", "Le restaurant a fermé")),
            listen(L("הפגישה נדחתה", "Ha-pgisha nidkheta", "La réunion a été reportée"), "Que s'est-il passé ?", "La réunion a été reportée", "La réunion a lieu demain", "La réunion a été annulée", "La réunion est terminée"),
            swap("Retire la personne : « ils ont reporté la réunion » devient « la réunion a été reportée ».", L("דחו את הפגישה", "Dakhu et ha-pgisha", "Ils ont reporté la réunion"), L("הפגישה נדחתה", "Ha-pgisha nidkheta", "La réunion a été reportée")),
            ask(L("מה קרה לפגישה?", "Ma kara la-pgisha?", "Qu'est-il arrivé à la réunion ?"), L("היא נדחתה לשבוע הבא", "Hi nidkheta la-shavua ha-ba", "Elle a été reportée à la semaine prochaine")),
          ], "une collègue qui annonce des changements", "Annoncer ce qui a changé sans dire qui l'a fait", L("יש שינויים: הפגישה נדחתה והמשרד נסגר מוקדם.", "Yesh shinuyim: ha-pgisha nidkheta ve-ha-misrad nisgar mukdam.", "Il y a des changements : la réunion est reportée et le bureau ferme tôt.")),
          day("u10d3", "Concéder et objecter", L(g("אני מסכים עד גבול מסוים, אבל…", "אני מסכימה עד גבול מסוים, אבל…"), g("Ani maskim ad gvul mesuyam, aval…", "Ani maskima ad gvul mesuyam, aval…"), "Je suis d'accord jusqu'à un certain point, mais…"), [
            intro("Un bon débat commence par reconnaître un point : « ani maskim ad gvul mesuyam, aval… ». Pour appuyer : « i efshar lehit'alem me-ha-uvda she… » (on ne peut pas ignorer que…)."),
            rep(L(g("אני מסכים עד גבול מסוים, אבל…", "אני מסכימה עד גבול מסוים, אבל…"), g("Ani maskim ad gvul mesuyam, aval…", "Ani maskima ad gvul mesuyam, aval…"), "Je suis d'accord jusqu'à un certain point, mais…")),
            rep(L("אי אפשר להתעלם מהעובדה שהמחירים עלו", "I efshar lehit'alem me-ha-uvda she-ha-mekhirim alu", "On ne peut pas ignorer que les prix ont augmenté")),
            rep(L("לא בטוח שזה כך", "Lo batu'akh she-ze kakh", "Pas sûr que ce soit le cas")),
            listen(L("אי אפשר להתעלם מהעובדה שהמחירים עלו", "I efshar lehit'alem me-ha-uvda she-ha-mekhirim alu", "On ne peut pas ignorer que les prix ont augmenté"), "Quel est l'argument ?", "Les prix ont augmenté et il faut le prendre en compte", "Les prix ont baissé", "Il faut ignorer les prix", "Les prix sont stables"),
            ask(L("מה דעתך על עבודה מהבית?", g("Ma da'atkha al avoda me-ha-bayit?", "Ma da'atekh al avoda me-ha-bayit?"), "Que penses-tu du travail à la maison ?"), L(g("אני מסכים עד גבול מסוים, אבל חסר לי קשר עם אנשים", "אני מסכימה עד גבול מסוים, אבל חסר לי קשר עם אנשים"), g("Ani maskim ad gvul mesuyam, aval khasar li kesher im anashim", "Ani maskima ad gvul mesuyam, aval khasar li kesher im anashim"), "Je suis d'accord jusqu'à un certain point, mais le contact avec les gens me manque")),
            fill(L("לא בטוח שזה כך", "Lo batu'akh she-ze kakh", "Pas sûr que ce soit le cas"), "בטוח", "batu'akh"),
          ], "un collègue qui défend l'idée opposée", "Concéder un point puis objecter poliment", L(g("לדעתי כל אחד צריך לעבוד מהבית ארבעה ימים בשבוע. מה דעתך?", "לדעתי כל אחד צריך לעבוד מהבית ארבעה ימים בשבוע. מה דעתך?"), g("Le-da'ati kol ekhad tsarikh la'avod me-ha-bayit arba'a yamim ba-shavua. Ma da'atkha?", "Le-da'ati kol ekhad tsarikh la'avod me-ha-bayit arba'a yamim ba-shavua. Ma da'atekh?"), "À mon avis, chacun devrait travailler de chez soi quatre jours par semaine. Qu'en penses-tu ?")),
          day("u10d4", "Reformuler", L("במילים אחרות", "Be-milim akherot", "En d'autres termes"), [
            intro("Quand on ne te comprend pas, reformule : « be-milim akherot » (en d'autres termes), « klomar » (c'est-à-dire), « ha-kavana hi she… » (l'idée est que…)."),
            rep(L("במילים אחרות, זה יקר מדי", "Be-milim akherot, ze yakar midai", "En d'autres termes, c'est trop cher")),
            rep(L("כלומר, אין לנו זמן", "Klomar, ein lanu zman", "C'est-à-dire que nous n'avons pas le temps")),
            rep(L("הכוונה היא שצריך להחליט היום", "Ha-kavana hi she-tsarikh lehakhlit ha-yom", "L'idée est qu'il faut décider aujourd'hui")),
            rep(L("אפשר לנסח את זה אחרת?", "Efshar lenased et ze akheret?", "On peut le formuler autrement ?")),
            listen(L("כלומר", "Klomar", "C'est-à-dire"), "Quel mot entends-tu ?", "C'est-à-dire", "Pourtant", "Donc", "Par exemple"),
            ask(L("לא הבנתי למה התכוונת", g("Lo hevanti le-ma kavanta", "Lo hevanti le-ma kavant"), "Je n'ai pas compris ce que tu voulais dire"), L(g("במילים אחרות, אני חושב שזה יקר מדי", "במילים אחרות, אני חושבת שזה יקר מדי"), g("Be-milim akherot, ani khoshev she-ze yakar midai", "Be-milim akherot, ani khoshevet she-ze yakar midai"), "En d'autres termes, je pense que c'est trop cher")),
            fill(L("כלומר, אין לנו זמן", "Klomar, ein lanu zman", "C'est-à-dire que nous n'avons pas le temps"), "כלומר", "klomar"),
          ], "un client qui n'a pas compris ton offre", "Reformuler pour te faire comprendre", L("סליחה, לא הבנתי את ההצעה. אפשר להסביר שוב?", "Slikha, lo hevanti et ha-hatsa'a. Efshar lehasbir shuv?", "Pardon, je n'ai pas compris l'offre. Tu peux réexpliquer ?")),
        ],
      },
    ],
  },
];

// Fin d'unité : un jour « Révision » construit à partir des jours de l'unité (phrases clés, une écoute par jour),
// puis un jeu de rôle qui reprend le dernier scénario.
for (const lvl of COURSE) {
  for (const unit of lvl.units) {
    if (unit.days.length < 3) continue;
    const last = unit.days[unit.days.length - 1];
    const steps: Step[] = [intro(`Révision de l'unité « ${unit.title} ». Je te refais dire les phrases clés de chaque jour, puis tu les utilises en conversation.`)];
    for (const d of unit.days) {
      steps.push(rep(d.key));
      const hear = d.steps.find((x) => x.kind === "listen");
      if (hear) steps.push(hear);
    }
    const sc = last.scenario;
    unit.days.push(day(`${unit.id}r`, "Révision", unit.days[0].key, steps, sc.role, sc.goal, { he: sc.starter.text, tr: sc.starter.transliteration, fr: sc.starter.translation.fr ?? "" }));
  }
}

export const ALL_DAYS = COURSE.flatMap((l) => l.units.flatMap((u) => u.days.map((d) => ({ level: l, unit: u, day: d }))));

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Le niveau du parcours pour un apprenant : le sien, ou le plus haut déjà écrit en dessous (un B2 commence au B1). */
export function courseLevelFor(level: string): CourseLevel {
  const ready = COURSE.filter((l) => l.units.length && CEFR.indexOf(l.cefr) <= Math.max(0, CEFR.indexOf(level)));
  return ready[ready.length - 1] ?? COURSE[0];
}
