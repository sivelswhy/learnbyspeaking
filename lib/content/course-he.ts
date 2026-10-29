import type { Gender, Level, Starter } from "../languages";

/** Parcours de cours en hébreu. Contenu écrit à la main. Formes m/f = genre de l'apprenant. */
type G = Record<Gender, string>;
const s = (v: string): G => ({ m: v, f: v });
const g = (m: string, f: string): G => ({ m, f });

export interface Line { he: G; tr: G; fr: string }
export type Step =
  | { kind: "intro"; fr: string }
  | { kind: "repeat"; line: Line }
  | { kind: "answer"; q: Line; a: Line };

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
const st = (l: Line): Starter => ({ text: l.he, transliteration: l.tr, translation: { fr: l.fr } });

const day = (id: string, title: string, key: Line, steps: Step[], role: string, goal: string, starter: Line): Day => ({
  id, title, key, steps: [...steps, intro("Bravo ! Passe au jeu de rôle pour l'utiliser en vraie conversation.")], scenario: { role, goal, starter: st(starter) },
});

export const COURSE: CourseLevel[] = [
  {
    id: "beg1", title: "Débutant 1", cefr: "A1",
    units: [
      {
        id: "u1", title: "Se présenter",
        days: [
          day("u1d1", "Bonjour !", L("שלום! מה נשמע?", "Shalom! Ma nishma?", "Salut ! Ça va ?"), [
            intro("En Israël, on dit « shalom » pour bonjour et pour au revoir. Répète après moi."),
            rep(L("שלום", "Shalom", "Bonjour")),
            rep(L("מה נשמע?", "Ma nishma?", "Ça va ?")),
            ask(L("מה נשמע?", "Ma nishma?", "Ça va ?"), L("הכול בסדר, תודה!", "Hakol beseder, toda!", "Tout va bien, merci !")),
            rep(L("ואת?", "Ve-at?", "Et toi ? (à une femme)")),
          ], "un voisin sympathique que tu croises le matin", "Saluer et demander comment ça va", L("בוקר טוב! מה נשמע?", "Boker tov! Ma nishma?", "Bonjour ! Ça va ?")),
          day("u1d2", "Je m'appelle…", L("קוראים לי…", "Kor'im li…", "Je m'appelle…"), [
            intro("Pour dire ton prénom, on dit « kor'im li », littéralement « on m'appelle »."),
            rep(L("קוראים לי…", "Kor'im li…", "Je m'appelle…")),
            ask(L("איך קוראים לך?", g("Eikh kor'im lekha?", "Eikh kor'im lakh?"), "Comment tu t'appelles ?"), L("קוראים לי …", "Kor'im li + ton prénom", "Je m'appelle + ton prénom")),
            rep(L("נעים מאוד!", "Na'im me'od!", "Enchanté(e) !")),
            rep(L("ואיך קוראים לך?", "Ve-eikh kor'im lakh?", "Et toi, comment tu t'appelles ? (à une femme)")),
          ], "une personne que tu rencontres à une soirée", "Te présenter", L("היי! אני דנה. איך קוראים לך?", g("Hai! Ani Dana. Eikh kor'im lekha?", "Hai! Ani Dana. Eikh kor'im lakh?"), "Salut ! Moi c'est Dana. Comment tu t'appelles ?")),
          day("u1d3", "D'où viens-tu ?", L("אני מצרפת", "Ani mi-Tsarfat", "Je viens de France"), [
            intro("Pour dire d'où tu viens : « ani » puis la lettre mem, qui veut dire « de », collée au pays."),
            rep(L("אני מצרפת", "Ani mi-Tsarfat", "Je viens de France")),
            rep(L("אני מבלגיה", "Ani mi-Belgya", "Je viens de Belgique")),
            ask(L(g("מאיפה אתה?", "מאיפה את?"), g("Me'eifo ata?", "Me'eifo at?"), "Tu viens d'où ?"), L("אני מצרפת", "Ani mi-Tsarfat", "Je viens de France")),
            rep(L("ואת, מאיפה את?", "Ve-at, me'eifo at?", "Et toi, tu viens d'où ? (à une femme)")),
          ], "un voyageur rencontré dans une auberge de jeunesse", "Dire d'où tu viens et demander d'où il vient", L(g("היי! מאיפה אתה?", "היי! מאיפה את?"), g("Hai! Me'eifo ata?", "Hai! Me'eifo at?"), "Salut ! Tu viens d'où ?")),
          day("u1d4", "J'habite à…", L(g("אני גר בפריז", "אני גרה בפריז"), g("Ani gar be-Pariz", "Ani gara be-Pariz"), "J'habite à Paris"), [
            intro("Le verbe habiter change selon ton genre : « gar » pour un homme, « gara » pour une femme."),
            rep(L(g("אני גר בפריז", "אני גרה בפריז"), g("Ani gar be-Pariz", "Ani gara be-Pariz"), "J'habite à Paris")),
            rep(L(g("אני גר בתל אביב", "אני גרה בתל אביב"), g("Ani gar be-Tel Aviv", "Ani gara be-Tel Aviv"), "J'habite à Tel-Aviv")),
            ask(L(g("איפה אתה גר?", "איפה את גרה?"), g("Eifo ata gar?", "Eifo at gara?"), "Tu habites où ?"), L(g("אני גר בפריז", "אני גרה בפריז"), g("Ani gar be-Pariz", "Ani gara be-Pariz"), "J'habite à Paris")),
            rep(L("ואת, איפה את גרה?", "Ve-at, eifo at gara?", "Et toi, tu habites où ? (à une femme)")),
          ], "un nouveau collègue curieux", "Dire où tu habites", L(g("איפה אתה גר?", "איפה את גרה?"), g("Eifo ata gar?", "Eifo at gara?"), "Tu habites où ?")),
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
          ], "un serveur dans un café de Tel-Aviv", "Commander une boisson et quelque chose à manger", L(g("שלום! מה תרצה?", "שלום! מה תרצי?"), g("Shalom! Ma tirtse?", "Shalom! Ma tirtsi?"), "Bonjour ! Qu'est-ce que vous désirez ?")),
          day("u2d2", "Combien ça coûte ?", L("כמה זה עולה?", "Kama ze ole?", "Combien ça coûte ?"), [
            intro("Pour demander un prix : « kama ze ole ». La monnaie est le shekel."),
            rep(L("כמה זה עולה?", "Kama ze ole?", "Combien ça coûte ?")),
            rep(L("זה יקר", "Ze yakar", "C'est cher")),
            rep(L("זה זול", "Ze zol", "Ce n'est pas cher")),
            ask(L("זה עשרים שקל. בסדר?", "Ze esrim shekel. Beseder?", "C'est vingt shekels. D'accord ?"), L("כן, בסדר. תודה!", "Ken, beseder. Toda!", "Oui, d'accord. Merci !")),
          ], "un vendeur au marché Carmel", "Demander les prix et acheter des fruits", L("בוקר טוב! יש תפוחים טריים. כמה לשים?", "Boker tov! Yesh tapukhim triyim. Kama lasim?", "Bonjour ! Il y a des pommes fraîches. J'en mets combien ?")),
          day("u2d3", "J'ai faim", L(g("אני רעב", "אני רעבה"), g("Ani ra'ev", "Ani re'eva"), "J'ai faim"), [
            intro("En hébreu, on dit « je suis affamé » : ra'ev pour un homme, re'eva pour une femme. Pareil pour la soif."),
            rep(L(g("אני רעב", "אני רעבה"), g("Ani ra'ev", "Ani re'eva"), "J'ai faim")),
            rep(L(g("אני צמא", "אני צמאה"), g("Ani tsame", "Ani tsme'a"), "J'ai soif")),
            ask(L(g("אתה רעב?", "את רעבה?"), g("Ata ra'ev?", "At re'eva?"), "Tu as faim ?"), L(g("כן, אני מאוד רעב", "כן, אני מאוד רעבה"), g("Ken, ani me'od ra'ev", "Ken, ani me'od re'eva"), "Oui, j'ai très faim")),
            rep(L("בואי נאכול משהו!", "Bo'i nokhal mashehu!", "Viens, on mange quelque chose ! (à une femme)")),
          ], "un ami qui te propose d'aller manger", "Dire que tu as faim et choisir où manger", L(g("אתה רעב? בוא נאכול משהו!", "את רעבה? בואי נאכול משהו!"), g("Ata ra'ev? Bo nokhal mashehu!", "At re'eva? Bo'i nokhal mashehu!"), "Tu as faim ? Viens, on mange quelque chose !")),
          day("u2d4", "L'addition", L("אפשר את החשבון, בבקשה?", "Efshar et ha-kheshbon, bevakasha?", "L'addition, s'il vous plaît ?"), [
            intro("Pour demander l'addition : « efshar et ha-kheshbon ». « Efshar » veut dire « c'est possible »."),
            rep(L("אפשר את החשבון, בבקשה?", "Efshar et ha-kheshbon, bevakasha?", "L'addition, s'il vous plaît ?")),
            rep(L("אפשר לשלם בכרטיס?", "Efshar leshalem be-kartis?", "Je peux payer par carte ?")),
            ask(L("הכול היה בסדר?", "Hakol haya beseder?", "Tout s'est bien passé ?"), L("כן, היה טעים מאוד!", "Ken, haya ta'im me'od!", "Oui, c'était très bon !")),
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
          ], "un passant dans une rue de Jérusalem", "Demander ton chemin", L("כן? אפשר לעזור?", "Ken? Efshar la'azor?", "Oui ? Je peux vous aider ?")),
          day("u3d2", "Droite, gauche", L("ימינה ואז שמאלה", "Yamina ve-az smola", "À droite puis à gauche"), [
            intro("Les directions : yamina (à droite), smola (à gauche), yashar (tout droit)."),
            rep(L("ימינה", "Yamina", "À droite")),
            rep(L("שמאלה", "Smola", "À gauche")),
            rep(L("ישר, ואז ימינה", "Yashar, ve-az yamina", "Tout droit, puis à droite")),
            ask(L("זה רחוק?", "Ze rakhok?", "C'est loin ?"), L("לא, זה קרוב", "Lo, ze karov", "Non, c'est près")),
          ], "un touriste perdu qui te demande son chemin", "Donner des directions simples", L("סליחה, איפה התחנה המרכזית?", "Slikha, eifo ha-takhana ha-merkazit?", "Pardon, où est la gare routière centrale ?")),
          day("u3d3", "Prendre un taxi", L("לרחוב דיזנגוף, בבקשה", "Li-rekhov Dizengof, bevakasha", "Rue Dizengoff, s'il vous plaît"), [
            intro("Dans un taxi, donne la destination avec la lettre lamed, qui veut dire « vers »."),
            rep(L("לרחוב דיזנגוף, בבקשה", "Li-rekhov Dizengof, bevakasha", "Rue Dizengoff, s'il vous plaît")),
            rep(L("כמה זה יעלה?", "Kama ze ya'ale?", "Combien ça va coûter ?")),
            rep(L("עם מונה, בבקשה", "Im mone, bevakasha", "Avec le compteur, s'il vous plaît")),
            ask(L("לאן נוסעים?", "Le'an nos'im?", "On va où ?"), L("לשדה התעופה, בבקשה", "La-sde ha-te'ufa, bevakasha", "À l'aéroport, s'il vous plaît")),
          ], "un chauffeur de taxi", "Donner ta destination et demander le prix", L("שלום! לאן נוסעים?", "Shalom! Le'an nos'im?", "Bonjour ! On va où ?")),
          day("u3d4", "Quelle heure est-il ?", L("מה השעה?", "Ma ha-sha'a?", "Quelle heure est-il ?"), [
            intro("Pour l'heure, on utilise les nombres féminins : « ha-sha'a shalosh », il est trois heures."),
            rep(L("מה השעה?", "Ma ha-sha'a?", "Quelle heure est-il ?")),
            rep(L("השעה שלוש", "Ha-sha'a shalosh", "Il est trois heures")),
            rep(L("השעה חמש וחצי", "Ha-sha'a khamesh va-khetsi", "Il est cinq heures et demie")),
            ask(L("מתי האוטובוס?", "Matai ha-otobus?", "Le bus est à quelle heure ?"), L("בשעה שמונה", "Be-sha'a shmone", "À huit heures")),
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
          ], "une amie qui te parle de sa routine", "Décrire ta matinée", L(g("אני קמה כל יום בשש! ואתה, מתי אתה קם?", "אני קמה כל יום בשש! ואת, מתי את קמה?"), g("Ani kama kol yom be-shesh! Ve-ata, matai ata kam?", "Ani kama kol yom be-shesh! Ve-at, matai at kama?"), "Je me lève tous les jours à six heures ! Et toi, tu te lèves quand ?")),
          day("u4d2", "Au travail", L(g("אני עובד במשרד", "אני עובדת במשרד"), g("Ani oved ba-misrad", "Ani ovedet ba-misrad"), "Je travaille dans un bureau"), [
            intro("Travailler : oved pour un homme, ovedet pour une femme. Pour ton métier : « ani » plus le métier, sans verbe être."),
            rep(L(g("אני עובד במשרד", "אני עובדת במשרד"), g("Ani oved ba-misrad", "Ani ovedet ba-misrad"), "Je travaille dans un bureau")),
            rep(L(g("אני מורה", "אני מורה"), g("Ani more", "Ani mora"), "Je suis prof")),
            ask(L(g("במה אתה עובד?", "במה את עובדת?"), g("Ba-ma ata oved?", "Ba-ma at ovedet?"), "Tu fais quoi comme travail ?"), L(g("אני עובד בהייטק", "אני עובדת בהייטק"), g("Ani oved be-haitek", "Ani ovedet be-haitek"), "Je travaille dans la tech")),
          ], "un collègue à la pause café", "Parler de ton travail", L(g("אז במה אתה עובד בדיוק?", "אז במה את עובדת בדיוק?"), g("Az ba-ma ata oved be-diyuk?", "Az ba-ma at ovedet be-diyuk?"), "Alors, tu fais quoi exactement comme travail ?")),
          day("u4d3", "Hier", L("אתמול הלכתי לים", "Etmol halakhti la-yam", "Hier, je suis allé(e) à la plage"), [
            intro("Au passé, la terminaison « ti » veut dire « je » : halakhti, je suis allé ; akhalti, j'ai mangé."),
            rep(L("אתמול הלכתי לים", "Etmol halakhti la-yam", "Hier, je suis allé(e) à la plage")),
            rep(L("אכלתי פלאפל", "Akhalti falafel", "J'ai mangé un falafel")),
            ask(L("מה עשית אתמול?", g("Ma asita etmol?", "Ma asit etmol?"), "Tu as fait quoi hier ?"), L("אתמול עבדתי ואז ראיתי סרט", "Etmol avadti ve-az ra'iti seret", "Hier j'ai travaillé, puis j'ai vu un film")),
          ], "un ami curieux", "Raconter ta journée d'hier", L("נו, מה עשית אתמול?", g("No, ma asita etmol?", "No, ma asit etmol?"), "Alors, tu as fait quoi hier ?")),
          day("u4d4", "Le week-end", L("בסוף השבוע נסעתי לירושלים", "Be-sof ha-shavua nasati li-Yerushalayim", "Ce week-end, je suis allé(e) à Jérusalem"), [
            intro("Pour raconter un trajet : nasati, je suis allé en véhicule."),
            rep(L("בסוף השבוע נסעתי לירושלים", "Be-sof ha-shavua nasati li-Yerushalayim", "Ce week-end, je suis allé(e) à Jérusalem")),
            rep(L("היה כיף!", "Haya kef!", "C'était super !")),
            ask(L("איך היה סוף השבוע?", "Eikh haya sof ha-shavua?", "C'était comment, le week-end ?"), L("היה נהדר, נחתי הרבה", "Haya nehedar, nakhti harbe", "C'était génial, je me suis bien reposé(e)")),
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
          ], "une amie qui parle de musique", "Parler de tes goûts", L(g("איזו מוזיקה אתה אוהב?", "איזו מוזיקה את אוהבת?"), g("Eizo muzika ata ohev?", "Eizo muzika at ohevet?"), "Quelle musique tu aimes ?")),
          day("u5d2", "Je préfère…", L(g("אני מעדיף תה", "אני מעדיפה תה"), g("Ani ma'adif te", "Ani ma'adifa te"), "Je préfère le thé"), [
            intro("Préférer : ma'adif pour un homme, ma'adifa pour une femme. Pour proposer un choix : « o », qui veut dire « ou »."),
            rep(L(g("אני מעדיף תה", "אני מעדיפה תה"), g("Ani ma'adif te", "Ani ma'adifa te"), "Je préfère le thé")),
            rep(L("קפה או תה?", "Kafe o te?", "Café ou thé ?")),
            ask(L("ים או הרים?", "Yam o harim?", "La mer ou la montagne ?"), L(g("אני מעדיף ים", "אני מעדיפה ים"), g("Ani ma'adif yam", "Ani ma'adifa yam"), "Je préfère la mer")),
          ], "un ami qui te prépare un petit-déjeuner", "Exprimer tes préférences", L(g("מה אתה שותה בבוקר, קפה או תה?", "מה את שותה בבוקר, קפה או תה?"), g("Ma ata shote ba-boker, kafe o te?", "Ma at shota ba-boker, kafe o te?"), "Tu bois quoi le matin, café ou thé ?")),
          day("u5d3", "Inviter quelqu'un", L("רוצה לבוא איתי לסרט?", "Rotsa lavo iti le-seret?", "Tu veux venir au cinéma avec moi ? (à une femme)"), [
            intro("Pour inviter : « rotse » ou « rotsa », puis « lavo », venir, et « iti », avec moi."),
            rep(L("רוצה לבוא איתי לסרט?", "Rotsa lavo iti le-seret?", "Tu veux venir au cinéma avec moi ? (à une femme)")),
            rep(L("בשמחה!", "Be-simkha!", "Avec plaisir !")),
            rep(L("מתי נוח לך?", "Matai no'akh lakh?", "Quand est-ce que ça t'arrange ? (à une femme)")),
            ask(L("רוצה לבוא איתי לים מחר?", g("Rotse lavo iti la-yam makhar?", "Rotsa lavo iti la-yam makhar?"), "Tu veux venir à la plage avec moi demain ?"), L("כן, בשמחה! באיזו שעה?", "Ken, be-simkha! Be-eizo sha'a?", "Oui, avec plaisir ! À quelle heure ?")),
          ], "un ami avec qui tu organises une sortie", "Proposer une sortie et fixer un moment", L(g("מה אתה עושה בערב?", "מה את עושה בערב?"), g("Ma ata ose ba-erev?", "Ma at osa ba-erev?"), "Tu fais quoi ce soir ?")),
          day("u5d4", "Faire des projets", L("מחר אני רוצה ללכת לים", g("Makhar ani rotse lalekhet la-yam", "Makhar ani rotsa lalekhet la-yam"), "Demain, je veux aller à la plage"), [
            intro("Pour parler de tes projets : « rotse » plus un infinitif, ou le futur : « ani esa », j'irai."),
            rep(L("מחר אני רוצה ללכת לים", g("Makhar ani rotse lalekhet la-yam", "Makhar ani rotsa lalekhet la-yam"), "Demain, je veux aller à la plage")),
            rep(L("בשבוע הבא אני אסע לאילת", "Ba-shavua ha-ba ani esa le-Eilat", "La semaine prochaine, j'irai à Eilat")),
            ask(L("מה התוכניות שלך לסוף השבוע?", g("Ma ha-tokhniyot shelkha le-sof ha-shavua?", "Ma ha-tokhniyot shelakh le-sof ha-shavua?"), "C'est quoi tes projets pour le week-end ?"), L("אני רוצה לנוח ולראות חברים", g("Ani rotse lanu'akh ve-lir'ot khaverim", "Ani rotsa lanu'akh ve-lir'ot khaverim"), "Je veux me reposer et voir des amis")),
          ], "une amie qui prépare un voyage", "Parler de tes projets", L(g("בוא נדבר על טיולים. לאיזו מדינה אתה רוצה לטוס?", "בואי נדבר על טיולים. לאיזו מדינה את רוצה לטוס?"), g("Bo nedaber al tiyulim. Le-eizo medina ata rotse latus?", "Bo'i nedaber al tiyulim. Le-eizo medina at rotsa latus?"), "Parlons voyages. Dans quel pays tu as envie d'aller ?")),
        ],
      },
    ],
  },
  { id: "int1", title: "Intermédiaire 1", cefr: "B1", units: [] },
  { id: "int2", title: "Intermédiaire 2", cefr: "B2", units: [] },
];

export const ALL_DAYS = COURSE.flatMap((l) => l.units.flatMap((u) => u.days.map((d) => ({ level: l, unit: u, day: d }))));
