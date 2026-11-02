import type { Gender } from "./languages";

/**
 * Scènes de jeu de rôle guidées (taxi, restaurant, marché, hôtel, aéroport).
 *
 * Pourquoi : un petit modèle à qui l'on demande « pose toujours une question » inverse les rôles (le chauffeur de taxi
 * demande « combien de temps dure le trajet ? »). Ici, chaque scène a :
 *  - des MISSIONS pour l'apprenant (ce que lui doit dire ou demander, dans l'ordre naturel de la situation) ;
 *  - pour chaque mission, la réplique écrite à la main du personnage quand la mission est accomplie : correcte, au bon rôle,
 *    avec translittération et traduction ;
 *  - une fiche de FAITS (durée, prix, menu…) que le modèle utilise pour répondre aux questions hors script ;
 *  - des phrases INTERDITES au personnage (celles qui inverseraient les rôles).
 * Le modèle ne sert donc qu'aux échanges hors script, et il est borné par les faits et les interdits.
 */
type G = string | Record<Gender, string>;
const pick = (g: G, gender: Gender) => (typeof g === "string" ? g : g[gender]);

export interface Line {
  he: G;
  tr: G;
  fr: string;
}

export interface Mission {
  id: string;
  /** Consigne à l'apprenant, en français. */
  fr: string;
  /** Exemple de phrase pour l'aider. */
  example: Line;
  /** La phrase de l'apprenant accomplit-elle la mission ? (texte normalisé, numéro du tour, 0 = premier message) */
  detect: (text: string, turn: number) => boolean;
  /** Missions à accomplir avant celle-ci. */
  requires?: string[];
  /** Réplique du personnage quand la mission est accomplie. */
  reply: Line;
}

export interface SceneScript {
  /** Faits connus du personnage, en hébreu (pour le modèle). */
  facts: string;
  missions: Mission[];
  /** Ce que le personnage ne dit jamais (questions qui inverseraient les rôles). */
  never: RegExp[];
  /** Réplique de secours quand le modèle n'a rien de correct. */
  fallback: Line;
  /** Demandes courantes hors missions (« ouvre la fenêtre », « c'est frais ? ») : réponse écrite à la main, dans le rôle. */
  extras?: Extra[];
}

export interface Extra {
  detect: RegExp;
  reply: Line;
}

/** Phrase de secours quand une scène n'a pas de script : neutre, jamais une question. */
export const SAFE_LINE: Line = { he: "סליחה, לא שמעתי טוב. אפשר שוב?", tr: "Slikha, lo shamati tov. Efshar shuv?", fr: "Pardon, je n'ai pas bien entendu. Vous pouvez répéter ?" };

const L = (he: G, tr: G, fr: string): Line => ({ he, tr, fr });

/** Texte hébreu sans voyelles ni ponctuation, mots séparés par une espace. */
export const flat = (s: string) => s.replace(/[֑-ׇ]/g, "").replace(/[^א-ת\sa-z0-9]/gi, " ").replace(/\s+/g, " ").trim();
/**
 * Les alternatives de 1 à 3 lettres (תה, מים, כן…) ne comptent que comme mots entiers (avec un préfixe collé possible) :
 * sans cela « תה » (thé) se trouvait dans « אתה » (tu) et déclenchait la commande d'une boisson.
 */
function words(re: RegExp): RegExp {
  const alts = re.source.split("|").map((a) => (/^[\u05d0-\u05ea]{1,3}$/.test(a) ? `(?<![\u05d0-\u05ea])[ובלמהשכ]?${a}(?![\u05d0-\u05ea])` : a));
  return new RegExp(alts.join("|"));
}
const has = (re: RegExp) => {
  const w = words(re);
  return (t: string) => w.test(t);
};
/** Salutation seule : ne répond à aucune mission. */
export const isGreeting = (t: string) => /^(שלום|הי|היי|הלו|אהלן|בוקר טוב|ערב טוב|צהריים טובים|מה נשמע|מה שלומך)( שלום)?$/.test(flat(t));
/** Premier message : compte comme réponse à la première question, sauf s'il ne fait que saluer. */
const first = (re: RegExp) => {
  const w = words(re);
  return (t: string, turn: number) => (turn === 0 && !isGreeting(t)) || w.test(t);
};


export const SCENES: Record<string, SceneScript> = {
  taxi: {
    facts:
      "אתה נהג מונית בתל אביב והנוסע כבר הגיד לאן. אתה יודע הכול על הנסיעה: היא לוקחת בערך עשרים דקות אם אין פקקים, המחיר לפי המונה בערך שישים שקל, משלמים במזומן או באשראי, המזגן דולק. הנוסע הוא זה ששואל כמה זמן ואיפה לעצור ואיך משלמים. אתה לא שואל אותו על זה: אתה עונה.",
    never: [/כמה\s+זמן/, /כמה\s+(זה\s+)?עולה/, /מה\s+המחיר/, /איפה\s+לעצור/, /כמה\s+(דקות|זמן)\s+נסיעה/],
    fallback: L("סליחה, לא שמעתי טוב. אפשר שוב?", "Slikha, lo shamati tov. Efshar shuv?", "Pardon, je n'ai pas bien entendu. Vous pouvez répéter ?"),
    extras: [
      { detect: /אפל פיי|ביט|פייבוקס|בכרטיס|לשלם עם/, reply: L("כן, אפשר גם באשראי.", "Ken, efshar gam be-ashrai.", "Oui, on peut aussi payer par carte.") },
      { detect: /רחוק|כמה קילומטר/, reply: L("לא רחוק, עשרים דקות בערך.", "Lo rakhok, esrim dakot be-erekh.", "Pas loin, une vingtaine de minutes.") },
      { detect: /לאט|בטוח|מפחד|מפחדת|לחוץ/, reply: L({ m: "אל תדאג, אני נוהג בזהירות.", f: "אל תדאגי, אני נוהג בזהירות." }, { m: "Al tid'ag, ani noheg bi-zehirut.", f: "Al tid'agi, ani noheg bi-zehirut." }, "Ne vous inquiétez pas, je conduis prudemment.") },
      { detect: /מהר|ממהר|ממהרת|טיסה|איחור/, reply: L("אני אנסה לנסוע מהר, אל תדאג.", "Ani anase linsoa me'her.", "Je vais essayer d'aller vite.") },
      { detect: /איפה אוכלים|מסעדה|ממליץ|תמליץ|לאכול/, reply: L("יש מסעדות מצוינות בשוק הכרמל.", "Yesh misadot metsuyanot be-shuk ha-Carmel.", "Il y a d'excellents restaurants au marché Carmel.") },
      { detect: /מאיפה אתה|מאיפה את/, reply: L("אני מרחובות, גר בתל אביב.", "Ani me-Rekhovot, gar be-Tel Aviv.", "Je viens de Rehovot, j'habite à Tel Aviv.") },
      { detect: /ילדים|משפחה|נשוי/, reply: L("יש לי שני ילדים.", "Yesh li shnei yeladim.", "J'ai deux enfants.") },
      { detect: /עודף|חייב|כמה לשלם/, reply: L("שישים שקל, בבקשה.", "Shishim shekel, bevakasha.", "Soixante shekels, s'il vous plaît.") },
      { detect: /חלון/, reply: L({ m: "בטח, תפתח.", f: "בטח, תפתחי." }, { m: "Betakh, tiftakh.", f: "Betakh, tiftekhi." }, "Bien sûr, ouvrez-la.") },
      { detect: /רדיו|מוזיקה|חזק מדי/, reply: L("סליחה, אני מנמיך.", "Slikha, ani manmikh.", "Pardon, je baisse le son.") },
      { detect: /קר|קור|חם|מזגן/, reply: L("בסדר, אני משנה את המזגן.", "Be-seder, ani meshane et ha-mazgan.", "D'accord, je change la clim.") },
      { detect: /פקקים|פקק|עומס/, reply: L("קצת, אבל זה זז.", "Ktsat, aval zeaz.", "Un peu, mais ça avance.") },
      { detect: /כמה שנים|נוהג הרבה|כמה זמן אתה נוהג/, reply: L("כבר עשרים שנה.", "Kvar esrim shana.", "Ça fait vingt ans déjà.") },
      { detect: /בניין|מה זה|מה זאת/, reply: L("זה מרכז קניות גדול.", "Ze merkaz kniyot gadol.", "C'est un grand centre commercial.") },
      { detect: /דיזנגוף|הילטון|מלון|נמל|תחנה/, reply: L("אני מכיר את המקום, אין בעיה.", "Ani makir et ha-makom, ein be'aya.", "Je connais l'endroit, pas de souci.") },
    ],
    missions: [
      {
        id: "dest", fr: "Dis au chauffeur où tu vas.",
        example: L("לתחנה המרכזית, בבקשה.", "La-takhana ha-merkazit, bevakasha.", "À la gare centrale, s'il vous plaît."),
        detect: first(/רחוב|תחנה|נמל|מלון|שדה|שוק|תל אביב|ירושלים|חיפה|בבקשה|לנסוע/),
        reply: L("בסדר, יוצאים. המזגן בסדר לך?", { m: "Be-seder, yots'im. Ha-mazgan be-seder lekha?", f: "Be-seder, yots'im. Ha-mazgan be-seder lakh?" }, "D'accord, on y va. La clim vous va ?"),
      },
      {
        id: "time", fr: "Demande combien de temps dure le trajet.",
        example: L("כמה זמן לוקחת הנסיעה?", "Kama zman lokakhat ha-nesia?", "Combien de temps dure le trajet ?"),
        detect: has(/כמה זמן|כמה דקות|מתי נגיע|מתי מגיעים|לוקחת הנסיעה|רחוק/),
        requires: ["dest"],
        reply: L("בערך עשרים דקות, אם אין פקקים.", "Be-erekh esrim dakot, im ein pkakim.", "Environ vingt minutes, s'il n'y a pas de bouchons."),
      },
      {
        id: "price", fr: "Demande combien ça coûte.",
        example: L("כמה זה עולה?", "Kama ze ole?", "Ça coûte combien ?"),
        detect: has(/כמה זה עולה|כמה עולה|כמה יעלה|כמה לשלם|מחיר|מונה/),
        requires: ["dest"],
        reply: L("לפי המונה, בערך שישים שקל.", "Lefi ha-moneh, be-erekh shishim shekel.", "Au compteur, environ soixante shekels."),
      },
      {
        id: "stop", fr: "Dis où tu veux descendre.",
        example: L("אפשר לעצור כאן, בבקשה?", "Efshar la'atsor kan, bevakasha?", "On peut s'arrêter ici, s'il vous plaît ?"),
        detect: has(/לעצור|עצור|תעצור|כאן זה טוב|פה זה טוב|כאן בסדר|פה בסדר|לרדת|פה בבקשה|כאן בבקשה/),
        requires: ["dest"],
        reply: L("בסדר, הגענו. זה שישים ושבעה שקל. מזומן או אשראי?", "Be-seder, higanu. Ze shishim ve-sheva shekel. Mezuman o ashrai?", "D'accord, nous voilà arrivés. Ça fait soixante-sept shekels. Espèces ou carte ?"),
      },
      {
        id: "pay", fr: "Choisis comment payer et remercie.",
        example: L("באשראי, תודה רבה!", "Be-ashrai, toda raba!", "Par carte, merci beaucoup !"),
        detect: has(/מזומן|אשראי|כרטיס|תודה|שלם|הנה/),
        requires: ["stop"],
        reply: L("תודה! יום טוב ונסיעה טובה.", "Toda! Yom tov ve-nesia tova.", "Merci ! Bonne journée."),
      },
    ],
  },

  restaurant: {
    facts:
      "אתה מלצר במסעדה בתל אביב. התפריט: פיצה, סלט, חומוס, שניצל, פסטה. משקאות: מים, קפה, בירה, יין, מיץ. אתה מקבל הזמנות ומביא אוכל. את החשבון אתה מביא רק כשמבקשים, והוא מאה ועשרים שקל. הלקוח הוא זה שמזמין ומבקש חשבון. אתה לא מזמין אוכל ולא מבקש חשבון.",
    never: [/אני\s+רוצה/, /אפשר\s+חשבון/, /אפשר\s+לקבל/],
    fallback: L("סליחה, לא שמעתי. אפשר שוב?", "Slikha, lo shamati. Efshar shuv?", "Pardon, je n'ai pas entendu. Vous pouvez répéter ?"),
    extras: [
      { detect: /שקשוקה/, reply: L("שקשוקה זה ביצים בעגבניות חמות, טעים מאוד.", "Shakshuka ze beitsim be-agvaniyot khamot, ta'im me'od.", "La chakchouka, ce sont des œufs dans une sauce tomate chaude, très bon.") },
      { detect: /אלרגי|אלרגית|אגוזים/, reply: L("אין בעיה, אני אגיד למטבח.", "Ein be'aya, ani agid la-mitbakh.", "Pas de souci, je préviens la cuisine.") },
      { detect: /חריף/, reply: L("קצת, אפשר גם בלי.", "Ktsat, efshar gam bli.", "Un peu, mais on peut l'avoir sans.") },
      { detect: /באנגלית/, reply: L("בטח, הנה תפריט באנגלית.", "Betakh, hine tafrit be-anglit.", "Bien sûr, voici le menu en anglais.") },
      { detect: /ילדים|תינוק/, reply: L("כן, יש כסא לתינוק.", "Ken, yesh kise la-tinok.", "Oui, nous avons une chaise haute.") },
      { detect: /פתוחים|עד מאוחר|שעות/, reply: L("אנחנו פתוחים עד חצות.", "Anakhnu ptukhim ad khatsot.", "Nous sommes ouverts jusqu'à minuit.") },
      { detect: /בנפרד|לפצל|לחלק/, reply: L("בטח, אפשר לחלק את החשבון.", "Betakh, efshar lekhalek et ha-kheshbon.", "Bien sûr, on peut séparer l'addition.") },
      { detect: /בחוץ|בפנים|מרפסת/, reply: L("יש מקום בחוץ, בבקשה.", "Yesh makom ba-khuts, bevakasha.", "Il y a de la place dehors, je vous en prie.") },
      { detect: /ממליץ|המלצה|הכי טעים|מה טוב/, reply: L("הפיצה שלנו מעולה, וגם החומוס.", "Ha-pitsa shelanu me'ula, ve-gam ha-khumus.", "Notre pizza est excellente, et le houmous aussi.") },
      { detect: /צמחוני|טבעוני|בלי בשר/, reply: L("בטח, יש חומוס, סלט ופסטה.", "Betakh, yesh khumus, salat ve-pasta.", "Bien sûr, il y a du houmous, de la salade et des pâtes.") },
      { detect: /לא מבין|לא מבינה|תפריט|מה יש/, reply: L("יש פיצה, סלט, חומוס, שניצל ופסטה.", "Yesh pitsa, salat, khumus, shnitsel ve-pasta.", "Il y a pizza, salade, houmous, escalope et pâtes.") },
      { detect: /טעים|מעולה|נהדר|נפלא/, reply: L("שמח לשמוע! רוצה קינוח?", "Sameakh lishmo'a! Rotse kinuakh?", "Content de l'entendre ! Un dessert ?") },
      { detect: /כמה זה|כמה עולה/, reply: L("אני מביא את החשבון, רגע.", "Ani mevi et ha-kheshbon, rega.", "J'apporte l'addition, un instant.") },
    ],
    missions: [
      {
        id: "table", fr: "Dis au serveur combien vous êtes.",
        example: L("שולחן לשניים, בבקשה.", "Shulkhan li-shnayim, bevakasha.", "Une table pour deux, s'il vous plaît."),
        detect: first(/שולחן|שניים|שלושה|ארבעה|לבד|אנשים/),
        reply: L("בבקשה, שבו כאן. הנה התפריט. מה תרצו לשתות?", "Bevakasha, shvu kan. Hine ha-tafrit. Ma tirtsu lishtot?", "Voici votre table et le menu. Que voulez-vous boire ?"),
      },
      {
        id: "drink", fr: "Commande une boisson.",
        example: L("אני רוצה מים וקפה.", "Ani rotse mayim ve-kafe.", "Je voudrais de l'eau et un café."),
        detect: has(/מים|קפה|בירה|יין|מיץ|קולה|תה|לשתות/),
        requires: ["table"],
        reply: L("בטח, מיד מגיע. אתם מוכנים להזמין אוכל?", "Betakh, miyad magia. Atem mukhanim lehazmin okhel?", "Bien sûr, ça arrive. Vous êtes prêts à commander ?"),
      },
      {
        id: "food", fr: "Commande un plat.",
        example: L("אני רוצה פיצה וסלט.", "Ani rotse pitsa ve-salat.", "Je voudrais une pizza et une salade."),
        detect: has(/פיצה|סלט|חומוס|שניצל|פסטה|אוכל|מנה|להזמין/),
        requires: ["table"],
        reply: L("מצוין, ההזמנה בדרך. בתיאבון!", "Metsuyan, ha-hazmana ba-derekh. Be-te'avon!", "Parfait, la commande arrive. Bon appétit !"),
      },
      {
        id: "bill", fr: "Demande l'addition.",
        example: L("אפשר חשבון, בבקשה?", "Efshar kheshbon, bevakasha?", "L'addition, s'il vous plaît ?"),
        detect: has(/חשבון|לשלם|תשלום/),
        requires: ["food"],
        reply: L("בטח, הנה החשבון: מאה ועשרים שקל. מזומן או אשראי?", "Betakh, hine ha-kheshbon: me'a ve-esrim shekel. Mezuman o ashrai?", "Bien sûr, voici l'addition : cent vingt shekels. Espèces ou carte ?"),
      },
      {
        id: "pay", fr: "Paie et remercie.",
        example: L("באשראי, תודה רבה!", "Be-ashrai, toda raba!", "Par carte, merci beaucoup !"),
        detect: has(/מזומן|אשראי|כרטיס|תודה/),
        requires: ["bill"],
        reply: L("תודה רבה, להתראות!", "Toda raba, lehitra'ot!", "Merci beaucoup, à bientôt !"),
      },
    ],
  },

  market: {
    facts:
      "אתה מוכר בשוק הכרמל בתל אביב. מחירים לקילו: עגבניות עשרה שקלים, תפוחים שמונה, בננות שבעה, מלפפונים שישה, תפוזים תשעה. אם מבקשים הנחה אתה מוריד שקל אחד לקילו. הלקוח הוא זה ששואל מחיר ומבקש כמות. אתה שואל רק כמה קילו הוא רוצה.",
    never: [/כמה\s+זה\s+עולה/, /כמה\s+עולה/, /אני\s+רוצה\s+לקנות/],
    fallback: L("סליחה, לא הבנתי. מה צריך?", "Slikha, lo hevanti. Ma tsarikh?", "Pardon, je n'ai pas compris. Qu'est-ce qu'il vous faut ?"),
    extras: [
      { detect: /דבש/, reply: L("בטח, דבש מקומי, עשרים שקלים.", "Betakh, dvash mekomi, esrim shekalim.", "Bien sûr, du miel local, vingt shekels.") },
      { detect: /אבטיח/, reply: L("אבטיח מתוק, שמונה שקלים לקילו.", "Avatiakh matok, shmone shekalim la-kilo.", "Une pastèque sucrée, huit shekels le kilo.") },
      { detect: /תמליץ|ממליץ|מה יש/, reply: L("התפוזים והענבים מתוקים היום.", "Ha-tapuzim ve-ha-anavim metukim ha-yom.", "Les oranges et le raisin sont sucrés aujourd'hui.") },
      { detect: /כמה אני חייב|כמה לשלם|סך הכול/, reply: L("עשרים שקלים, בבקשה.", "Esrim shekalim, bevakasha.", "Vingt shekels, s'il vous plaît.") },
      { detect: /חצי|וחצי|שני קילו|שלושה קילו|קילו אחד|קילו וחצי/, reply: L("בסדר. עוד משהו?", "Be-seder. Od mashehu?", "D'accord. Autre chose ?") },
      { detect: /מתוק|טעים/, reply: L("תודה! הכול מהחקלאים.", "Toda! Ha-kol me-ha-khakla'im.", "Merci ! Tout vient des agriculteurs.") },
      { detect: /טרי/, reply: L("בטח, הגיע הבוקר.", "Betakh, higia ha-boker.", "Bien sûr, ça vient d'arriver ce matin.") },
      { detect: /לטעום|טעימה/, reply: L("בטח, קח, תטעם.", "Betakh, kakh, tit'am.", "Bien sûr, goûtez.") },
      { detect: /הכי טעים|ממליץ|מה טוב/, reply: L("התפוזים מתוקים היום.", "Ha-tapuzim metukim ha-yom.", "Les oranges sont sucrées aujourd'hui.") },
      { detect: /תפוז|ענבים|תפוח|בננ|מלפפון|עגבני/, reply: L("בטח. תשעה שקלים לקילו. כמה לשים?", "Betakh. Tish'a shekalim la-kilo. Kama lasim?", "Bien sûr. Neuf shekels le kilo. Combien je vous en mets ?") },
    ],
    missions: [
      {
        id: "buy", fr: "Demande un fruit ou un légume.",
        example: L("קילו עגבניות, בבקשה.", "Kilo agvaniyot, bevakasha.", "Un kilo de tomates, s'il vous plaît."),
        detect: first(/קילו|עגבני|תפוח|בננ|מלפפון|תפוז|רוצה|אפשר/),
        reply: L("בטח. עשרה שקלים לקילו. כמה לשים?", "Betakh. Asara shekalim la-kilo. Kama lasim?", "Bien sûr. Dix shekels le kilo. Combien je vous en mets ?"),
      },
      {
        id: "price", fr: "Demande le prix.",
        example: L("כמה זה עולה?", "Kama ze ole?", "Ça coûte combien ?"),
        detect: has(/כמה זה עולה|כמה עולה|מחיר|כמה עולים|כמה עולות/),
        reply: L("עשרה שקלים לקילו, והכול טרי.", "Asara shekalim la-kilo, ve-ha-kol tari.", "Dix shekels le kilo, et tout est frais."),
      },
      {
        id: "bargain", fr: "Dis que c'est cher et demande une réduction.",
        example: L("זה יקר! אפשר הנחה?", "Ze yakar! Efshar hanakha?", "C'est cher ! On peut avoir une réduction ?"),
        detect: has(/יקר|הנחה|זול|פחות/),
        requires: ["buy"],
        reply: L("בשבילך, תשעה שקלים לקילו. בסדר?", { m: "Bishvilkha, tish'a shekalim la-kilo. Be-seder?", f: "Bishvilekh, tish'a shekalim la-kilo. Be-seder?" }, "Pour vous, neuf shekels le kilo. D'accord ?"),
      },
      {
        id: "pay", fr: "Accepte le prix et remercie.",
        example: L("בסדר, הנה. תודה!", "Be-seder, hine. Toda!", "D'accord, tenez. Merci !"),
        detect: has(/בסדר|מסכים|הנה|תודה|שלם|סגור/),
        requires: ["bargain"],
        reply: L("תודה רבה, שיהיה לך יום מצוין!", { m: "Toda raba, shiyihye lekha yom metsuyan!", f: "Toda raba, shiyihye lakh yom metsuyan!" }, "Merci beaucoup, excellente journée !"),
      },
    ],
  },

  hotel: {
    facts:
      "אתה פקיד קבלה במלון בתל אביב. האורח הזמין חדר על השם כהן, מספר שתים עשרה, שלוש לילות. ארוחת בוקר משבע עד עשר בקומת הכניסה. סיסמת הוויפי היא שלום אחת שתיים שלוש. המעלית מימין. האורח הוא זה ששואל על ארוחת בוקר, ויפי ומעלית.",
    never: [/יש\s+ארוחת\s+בוקר/, /מה\s+הסיסמה/, /איפה\s+המעלית/],
    fallback: L("סליחה, אפשר לחזור על זה?", "Slikha, efshar lakhzor al ze?", "Pardon, pouvez-vous répéter ?"),
    extras: [
      { detect: /נוף|ים/, reply: L("יש חדר עם נוף לים בקומה חמש.", "Yesh kheder im nof la-yam be-koma khamesh.", "Il y a une chambre avec vue sur la mer au cinquième.") },
      { detect: /חניה|חנייה|לחנות/, reply: L("כן, יש חניה חינם מאחורי המלון.", "Ken, yesh khanaya khinam me-akhorei ha-malon.", "Oui, parking gratuit derrière l'hôtel.") },
      { detect: /כמה זה עולה|כמה עולה|מחיר|ללילה/, reply: L("הלילה עולה שש מאות שקל.", "Ha-laila ole shesh me'ot shekel.", "La nuit coûte six cents shekels.") },
      { detect: /מזגן/, reply: L("כן, בכל החדרים יש מזגן.", "Ken, be-khol ha-khadarim yesh mazgan.", "Oui, toutes les chambres sont climatisées.") },
      { detect: /מפתח נוסף|מפתח/, reply: L("בטח, הנה עוד מפתח.", "Betakh, hine od maftea'kh.", "Bien sûr, voici une autre clé.") },
      { detect: /חשבונית|קבלה/, reply: L("בטח, אני שולח אותה למייל.", "Betakh, ani soleakh ota la-mail.", "Bien sûr, je vous l'envoie par mail.") },
      { detect: /מזוודות|כבד|כבדות/, reply: L("אין בעיה, אני שולח מישהו לעזור.", "Ein be'aya, ani soleakh mishehu la'azor.", "Pas de problème, j'envoie quelqu'un vous aider.") },
      { detect: /איפה.*חדר|החדר שלי/, reply: L("החדר שלך בקומה שתיים, ליד המעלית.", "Ha-kheder shelkha be-koma shtayim, leyad ha-ma'alit.", "Votre chambre est au deuxième, près de l'ascenseur.") },
      { detect: /לשלם|לצאת|לעזוב/, reply: L("בטח, הנה החשבון. מזומן או אשראי?", "Betakh, hine ha-kheshbon. Mezuman o ashrai?", "Bien sûr, voici la note. Espèces ou carte ?") },
      { detect: /מגבות|מגבת/, reply: L("בטח, אני שולח לחדר.", "Betakh, ani soleakh la-kheder.", "Bien sûr, je vous les envoie dans la chambre.") },
      { detect: /בריכה/, reply: L("הבריכה בקומה העליונה, פתוחה עד עשר.", "Ha-brekha be-koma ha-elyona, ptukha ad eser.", "La piscine est au dernier étage, ouverte jusqu'à dix heures.") },
      { detect: /צ ?ק אאוט|צ'ק אאוט|יציאה|לעזוב/, reply: L("הצ'ק אאוט בצהריים, בשעה שתים עשרה.", "Ha-check-out ba-tsohorayim, be-sha'a shteim esre.", "Le départ est à midi.") },
      { detect: /שקט/, reply: L("בטח, יש חדר שקט בקומה שלוש.", "Betakh, yesh kheder shaket be-koma shalosh.", "Bien sûr, il y a une chambre calme au troisième.") },
      { detect: /אינטרנט|ויפי|וויפי|סיסמה/, reply: L("הסיסמה היא: שלום אחת שתיים שלוש.", "Ha-sisma hi: shalom akhat shtayim shalosh.", "Le mot de passe est : shalom123.") },
    ],
    missions: [
      {
        id: "booking", fr: "Dis que tu as une réservation.",
        example: L("כן, יש לי הזמנה על השם כהן.", "Ken, yesh li hazmana al shem Cohen.", "Oui, j'ai une réservation au nom de Cohen."),
        detect: first(/הזמנה|כן|שם/),
        reply: L("מצוין, מצאתי. חדר שתים עשרה, שלושה לילות. הנה המפתח.", "Metsuyan, matsati. Kheder shteim esre, shlosha leilot. Hine ha-maftea'kh.", "Parfait, je l'ai trouvée. Chambre douze, trois nuits. Voici la clé."),
      },
      {
        id: "breakfast", fr: "Demande s'il y a un petit-déjeuner.",
        example: L("יש ארוחת בוקר?", "Yesh arukhat boker?", "Il y a un petit-déjeuner ?"),
        detect: has(/ארוחת|בוקר/),
        requires: ["booking"],
        reply: L("כן, משבע עד עשר, בקומת הכניסה.", "Ken, mi-sheva ad eser, be-komat ha-knisa.", "Oui, de sept à dix heures, au rez-de-chaussée."),
      },
      {
        id: "wifi", fr: "Demande le mot de passe du wifi.",
        example: L("מה הסיסמה של הוויפי?", "Ma ha-sisma shel ha-vaifai?", "C'est quoi le mot de passe du wifi ?"),
        detect: has(/ויפי|וויפי|סיסמה|אינטרנט/),
        requires: ["booking"],
        reply: L("הסיסמה היא: שלום אחת שתיים שלוש.", "Ha-sisma hi: shalom akhat shtayim shalosh.", "Le mot de passe est : shalom123."),
      },
      {
        id: "lift", fr: "Demande où est l'ascenseur.",
        example: L("איפה המעלית?", "Eifo ha-ma'alit?", "Où est l'ascenseur ?"),
        detect: has(/מעלית/),
        requires: ["booking"],
        reply: L("המעלית שם, מימין. שהות נעימה!", "Ha-ma'alit sham, mi-yamin. Shehut ne'ima!", "L'ascenseur est là, à droite. Bon séjour !"),
      },
    ],
  },

  airport: {
    facts:
      "אתה פקיד צ'ק-אין בנמל התעופה בן גוריון. אתה מבקש דרכון, שואל לאן טסים, כמה מזוודות, וחלון או מעבר. אחרי זה אתה נותן כרטיס עלייה: שער עשרים ושלוש, העלייה בשעה שמונה. יש ארוחה קלה ושתייה בטיסה, בחינם. הנוסע הוא זה ששואל מתי העלייה ואיפה השער.",
    never: [/באיזו\s+שעה\s+העלייה/, /איפה\s+השער/],
    fallback: L("סליחה, אפשר שוב?", "Slikha, efshar shuv?", "Pardon, pouvez-vous répéter ?"),
    extras: [
      { detect: /יציאה|ליד היציאה|רגליים/, reply: L("בטח, יש לי מושב ליד היציאה.", "Betakh, yesh li moshav leyad ha-yetsia.", "Bien sûr, j'ai une place près de la sortie de secours.") },
      { detect: /מאחרת|איחור|בזמן|מתעכבת/, reply: L("הטיסה בזמן, אין איחורים.", "Ha-tisa be-zman, ein ikhurim.", "Le vol est à l'heure, pas de retard.") },
      { detect: /תיק|רק תיק/, reply: L("בסדר, תיק יד אחד מותר.", "Be-seder, tik yad ekhad mutar.", "D'accord, un bagage à main est autorisé.") },
      { detect: /איפה השער|איפה אני מחכה|איפה מחכים|איפה הבידוק/, reply: L("בשער עשרים ושלוש, אחרי הבידוק.", "Be-sha'ar esrim ve-shalosh, akhrei ha-bdika.", "À la porte vingt-trois, après le contrôle.") },
      { detect: /כבדה|כבד|משקל/, reply: L("אין בעיה, עד עשרים ושלושה קילו.", "Ein be'aya, ad esrim ve-shalosha kilo.", "Pas de souci, jusqu'à vingt-trois kilos.") },
      { detect: /אוכל|ארוחה|לאכול|שתייה|לשתות/, reply: L("כן, יש ארוחה קלה ושתייה בטיסה.", "Ken, yesh arukha kala u-shtiya ba-tisa.", "Oui, il y a un repas léger et des boissons à bord.") },
    ],
    missions: [
      {
        id: "passport", fr: "Donne ton passeport.",
        example: L("הנה הדרכון.", "Hine ha-darkon.", "Voici mon passeport."),
        detect: first(/דרכון|הנה/),
        reply: L({ m: "תודה. לאן אתה טס?", f: "תודה. לאן את טסה?" }, { m: "Toda. Le'an ata tas?", f: "Toda. Le'an at tasa?" }, "Merci. Vous allez où ?"),
      },
      {
        id: "dest", fr: "Dis où tu voyages.",
        example: L({ m: "אני טס לפריז.", f: "אני טסה לפריז." }, { m: "Ani tas le-Pariz.", f: "Ani tasa le-Pariz." }, "Je vais à Paris."),
        detect: has(/טס|טסה|פריז|פאריז|לונדון|רומא|ברלין|ניו יורק|מדריד|לנסוע/),
        requires: ["passport"],
        reply: L({ m: "מצוין. יש לך מזוודות?", f: "מצוין. יש לך מזוודות?" }, { m: "Metsuyan. Yesh lekha mizvadot?", f: "Metsuyan. Yesh lakh mizvadot?" }, "Parfait. Vous avez des bagages ?"),
      },
      {
        id: "bags", fr: "Dis combien de valises tu as.",
        example: L("מזוודה אחת.", "Mizvada akhat.", "Une valise."),
        detect: has(/מזוודה|מזוודות|תיק|אחת|שתי|שלוש|בלי/),
        requires: ["dest"],
        reply: L("בסדר, תודה. חלון או מעבר?", "Be-seder, toda. Khalon o ma'avar?", "D'accord, merci. Hublot ou couloir ?"),
      },
      {
        id: "seat", fr: "Choisis ta place.",
        example: L("חלון, בבקשה.", "Khalon, bevakasha.", "Hublot, s'il vous plaît."),
        detect: has(/חלון|מעבר/),
        requires: ["bags"],
        reply: L("הנה כרטיס העלייה. נסיעה טובה!", "Hine kartis ha-aliya. Nesia tova!", "Voici votre carte d'embarquement. Bon voyage !"),
      },
      {
        id: "gate", fr: "Demande à quelle heure on embarque.",
        example: L("באיזו שעה העלייה?", "Be-eizo sha'a ha-aliya?", "À quelle heure est l'embarquement ?"),
        detect: has(/באיזו שעה|מתי|שעה|עלייה|שער/),
        requires: ["seat"],
        reply: L("העלייה בשעה שמונה, בשער עשרים ושלוש. טיסה נעימה!", "Ha-aliya be-sha'a shmone, be-sha'ar esrim ve-shalosh. Tisa ne'ima!", "L'embarquement est à huit heures, porte vingt-trois. Bon vol !"),
      },
    ],
  },
};

export interface SceneProgress {
  done: string[];
  /** Missions accomplies par le dernier message de l'apprenant. */
  newly: Mission[];
  /** Première mission pas encore accomplie dont les prérequis sont remplis. */
  next: Mission | null;
}

/**
 * État des missions d'après tous les messages de l'apprenant, dans l'ordre.
 * Une mission est accomplie par la première phrase qui la déclenche une fois ses prérequis remplis ;
 * un seul message peut en accomplir plusieurs si elles sont indépendantes (« קילו עגבניות, כמה זה עולה ? »).
 */
export function sceneProgress(script: SceneScript, userTexts: string[]): SceneProgress {
  const done = new Set<string>();
  let newly: Mission[] = [];
  let spoken = 0; // messages précédents qui ne sont pas de simples salutations
  userTexts.forEach((raw) => {
    const turn = spoken;
    if (!isGreeting(raw)) spoken++;
    const t = flat(raw);
    const got: Mission[] = [];
    // Les prérequis comptent « avant ce message » : « אפשר לעצור כאן, תודה » descend du taxi, il ne paie pas encore.
    const before = new Set(done);
    for (const m of script.missions) {
      if (before.has(m.id) || !(m.requires ?? []).every((r) => before.has(r))) continue;
      if (t && m.detect(t, turn)) {
        done.add(m.id);
        got.push(m);
      }
    }
    newly = got;
  });
  const next = script.missions.find((m) => !done.has(m.id) && (m.requires ?? []).every((r) => done.has(r))) ?? null;
  return { done: [...done], newly, next };
}

export const lineText = (l: Line, gender: Gender) => ({ he: pick(l.he, gender), tr: pick(l.tr, gender), fr: l.fr });

/**
 * Contrôle de rôle des questions du personnage, sans modèle (un petit modèle ne sait pas juger « qui dirait ça » : mesuré à 50 %).
 *  - ROLE_NEVER : questions de CLIENT que le personnage ne pose jamais (prix, durée, lieu, demande de service…).
 *  - QUESTION_ALLOW : pour les métiers de service, seules ces questions sont acceptées dans la bouche du personnage.
 * Une question refusée est retirée de la réplique (le personnage répond ou constate, sans interroger).
 */
export const ROLE_NEVER: Record<string, RegExp[]> = {
  taxi: [/כמה\s+זמן/, /כמה\s+(זה\s+)?(עולה|יעלה)/, /מה\s+המחיר/, /איפה\s+(אפשר\s+)?(לעצור|לרדת)/, /אפשר\s+(לעצור|לרדת|לשלם|לפתוח)/, /מתי\s+(נגיע|מגיעים)/],
  restaurant: [/אני\s+רוצה/, /אפשר\s+(חשבון|לקבל|לשלם|להזמין|תפריט)/, /כמה\s+(זה\s+)?עולה/, /מה\s+יש\s+בתפריט/, /איפה\s+(השירותים|השולחן)/],
  market: [/כמה\s+(זה\s+)?(עולה|עולים|עולות)/, /אפשר\s+(הנחה|לקנות|לטעום)/, /זה\s+טרי/, /אני\s+רוצה/],
  hotel: [/יש\s+(ארוחת|ויפי|וויפי|חניה|בריכה)/, /איפה\s+(המעלית|החדר|הבריכה)/, /מה\s+(הסיסמה|שעת)/, /אני\s+רוצה/],
  airport: [/באיזו\s+שעה/, /איפה\s+(השער|הבידוק|הטיסה)/, /מתי\s+(העלייה|הטיסה|ממריאים)/, /אני\s+רוצה/],
  daily: [/מה\s+השעה/, /איפה\s+(ה|אפשר)/],
  interview: [/משכורת|שכר|ימי\s+חופשה|כמה\s+ימי/, /אפשר\s+לשאול/],
  study: [],
  meet: [],
};

export const QUESTION_ALLOW: Record<string, RegExp> = {
  taxi: /לאן|המזגן|מזומן|אשראי|ממהר|מאיפה|בסדר|מוכן|חם|קר|מוזיקה|רדיו|עוצרים|מגיעים|הכול|מתאים|שוב|לחזור/,
  restaurant: /שוב|לחזור|כמה\s+אנשים|לכמה|לשתות|להזמין|עוד\s+משהו|טעים|קינוח|מוכנים|בתיאבון|בסדר|מזומן|אשראי|בפנים|בחוץ|קפה|מים|עוד\s+משהו|הכול/,
  market: /שוב|לחזור|כמה\s+(קילו|לשים)|עוד\s+משהו|מה\s+(צריך|עוד|תרצה|תרצי)|שקית|בסדר|קילו|מספיק/,
  hotel: /שוב|לחזור|הזמנה|על\s+איזה\s+שם|כמה\s+לילות|עזרה|מזוודות|דרכון|מפתח|חדר|בסדר|עוד\s+(משהו|שאלה)|הכול/,
  airport: /שוב|לחזור|דרכון|לאן|מזוודות|חלון|מעבר|עוד\s+משהו|בסדר|עזרה|כרטיס|הכול/,
};

/** Questions de la réplique qui ne sont pas dans la bouche du personnage. */
export function badQuestions(sceneId: string, text: string): string[] {
  const never = ROLE_NEVER[sceneId] ?? [];
  const allow = QUESTION_ALLOW[sceneId];
  return (text.match(/[^.!?]*\?/g) ?? []).map((q) => q.trim()).filter((q) => q && (never.some((re) => re.test(q)) || (allow ? !allow.test(q) : false)));
}

/** La réplique sans ses questions refusées (chaîne vide s'il ne reste rien). */
export function dropBadQuestions(sceneId: string, text: string): string {
  const bad = new Set(badQuestions(sceneId, text));
  if (!bad.size) return text;
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).map((x) => x.trim()).filter((x) => !bad.has(x)).join(" ").trim();
}

/** Demandes de répétition : le personnage redit sa dernière phrase. */
export const CLARIFY = /לא הבנתי|לא שמעתי|לא מבין|לא מבינה|אפשר שוב|אפשר לחזור|תחזור|תחזרי|עוד פעם|לא הבנתי\?/;
export const THANKS_ONLY = /^(תודה|תודה רבה|תודה לך|בבקשה|סבבה|בסדר|בסדר גמור|מעולה|נהדר)( רבה| לך| מאוד)?$/;
export const BYE = /(להתראות|ביי|יום טוב|לילה טוב|שבוע טוב|נתראה)/;

/**
 * Conversations ouvertes (rencontre, quotidien, études, entretien, libre) : questions d'enchaînement écrites à la main.
 * Mesuré sur 50 conversations : le petit modèle y improvise des questions hors sujet (« מה המהירות שלך בכתיבה ? » à un candidat).
 * Le personnage réagit d'un mot, puis pose la question suivante de la liste ; le modèle ne répond plus qu'aux questions de l'apprenant.
 */
const Q = (m: string, f: string, trM: string, trF: string, fr: string): Line => ({ he: { m, f }, tr: { m: trM, f: trF }, fr });
const QS = (he: string, tr: string, fr: string): Line => ({ he, tr, fr });

export const QUEUES: Record<string, Line[]> = {
  meet: [
    Q("נעים מאוד! מאיפה אתה?", "נעים מאוד! מאיפה את?", "Na'im me'od! Me'eifo ata?", "Na'im me'od! Me'eifo at?", "Enchanté ! Tu viens d'où ?"),
    Q("ומה אתה עושה בחיים?", "ומה את עושה בחיים?", "U-ma ata ose ba-khayim?", "U-ma at osa ba-khayim?", "Et tu fais quoi dans la vie ?"),
    Q("מה אתה אוהב לעשות בזמן הפנוי?", "מה את אוהבת לעשות בזמן הפנוי?", "Ma ata ohev la'asot ba-zman ha-panui?", "Ma at ohevet la'asot ba-zman ha-panui?", "Qu'est-ce que tu aimes faire pendant ton temps libre ?"),
    Q("כמה זמן אתה בישראל?", "כמה זמן את בישראל?", "Kama zman ata be-Israel?", "Kama zman at be-Israel?", "Ça fait combien de temps que tu es en Israël ?"),
    Q("אתה לומד עברית כבר הרבה זמן?", "את לומדת עברית כבר הרבה זמן?", "Ata lomed ivrit kvar harbe zman?", "At lomedet ivrit kvar harbe zman?", "Tu apprends l'hébreu depuis longtemps ?"),
    Q("מה הדבר הכי יפה שראית כאן?", "מה הדבר הכי יפה שראית כאן?", "Ma ha-davar ha-khi yafe she-ra'ita kan?", "Ma ha-davar ha-khi yafe she-ra'it kan?", "Quelle est la plus belle chose que tu as vue ici ?"),
    Q("יש לך תוכניות לסוף השבוע?", "יש לך תוכניות לסוף השבוע?", "Yesh lekha tokhniyot le-sof ha-shavua?", "Yesh lakh tokhniyot le-sof ha-shavua?", "Tu as des projets pour le week-end ?"),
  ],
  daily: [
    Q("ומה התוכניות שלך להיום?", "ומה התוכניות שלך להיום?", "U-ma ha-tokhniyot shelkha le-hayom?", "U-ma ha-tokhniyot shelakh le-hayom?", "Et tes projets pour aujourd'hui ?"),
    Q("יש לך משפחה כאן בארץ?", "יש לך משפחה כאן בארץ?", "Yesh lekha mishpakha kan ba-arets?", "Yesh lakh mishpakha kan ba-arets?", "Tu as de la famille ici ?"),
    Q("מה אתה אוהב לאכול בבוקר?", "מה את אוהבת לאכול בבוקר?", "Ma ata ohev le'ekhol ba-boker?", "Ma at ohevet le'ekhol ba-boker?", "Qu'est-ce que tu aimes manger le matin ?"),
    Q("איך אתה מגיע לעבודה?", "איך את מגיעה לעבודה?", "Eikh ata magia la-avoda?", "Eikh at magia'a la-avoda?", "Comment tu vas au travail ?"),
    Q("מה אתה עושה בערב?", "מה את עושה בערב?", "Ma ata ose ba-erev?", "Ma at osa ba-erev?", "Qu'est-ce que tu fais le soir ?"),
    Q("אתה גר כאן הרבה זמן?", "את גרה כאן הרבה זמן?", "Ata gar kan harbe zman?", "At gara kan harbe zman?", "Tu habites ici depuis longtemps ?"),
  ],
  study: [
    Q("מה אתה לומד באוניברסיטה?", "מה את לומדת באוניברסיטה?", "Ma ata lomed ba-universita?", "Ma at lomedet ba-universita?", "Qu'est-ce que tu étudies à l'université ?"),
    Q("באיזו שנה אתה?", "באיזו שנה את?", "Be-eizo shana ata?", "Be-eizo shana at?", "Tu es en quelle année ?"),
    Q("איזה קורס הכי מעניין אותך?", "איזה קורס הכי מעניין אותך?", "Eize kurs ha-khi me'anyen otkha?", "Eize kurs ha-khi me'anyen otakh?", "Quel cours t'intéresse le plus ?"),
    Q("יש לך מבחן בקרוב?", "יש לך מבחן בקרוב?", "Yesh lekha mivkhan be-karov?", "Yesh lakh mivkhan be-karov?", "Tu as un examen bientôt ?"),
    Q("איפה אתה לומד בדרך כלל?", "איפה את לומדת בדרך כלל?", "Eifo ata lomed be-derekh klal?", "Eifo at lomedet be-derekh klal?", "Où tu travailles d'habitude ?"),
    Q("מה אתה רוצה לעשות אחרי הלימודים?", "מה את רוצה לעשות אחרי הלימודים?", "Ma ata rotse la'asot akhrei ha-limudim?", "Ma at rotsa la'asot akhrei ha-limudim?", "Qu'est-ce que tu veux faire après tes études ?"),
  ],
  interview: [
    Q("איפה עבדת קודם?", "איפה עבדת קודם?", "Eifo avadta kodem?", "Eifo avadt kodem?", "Où as-tu travaillé avant ?"),
    Q("מה היה התפקיד שלך שם?", "מה היה התפקיד שלך שם?", "Ma haya ha-tafkid shelkha sham?", "Ma haya ha-tafkid shelakh sham?", "Quel était ton poste là-bas ?"),
    Q("למה אתה רוצה לעבוד אצלנו?", "למה את רוצה לעבוד אצלנו?", "Lama ata rotse la'avod etsleinu?", "Lama at rotsa la'avod etsleinu?", "Pourquoi veux-tu travailler chez nous ?"),
    Q("מה החוזקה הכי גדולה שלך?", "מה החוזקה הכי גדולה שלך?", "Ma ha-khozka ha-khi gdola shelkha?", "Ma ha-khozka ha-khi gdola shelakh?", "Quelle est ta plus grande force ?"),
    Q("ספר לי על אתגר שהתמודדת איתו.", "ספרי לי על אתגר שהתמודדת איתו.", "Saper li al etgar she-hitmodadta ito.", "Sapri li al etgar she-hitmodadt ito.", "Parle-moi d'un défi que tu as relevé."),
    Q("איפה אתה רואה את עצמך בעוד חמש שנים?", "איפה את רואה את עצמך בעוד חמש שנים?", "Eifo ata ro'e et atsmekha be-od khamesh shanim?", "Eifo at ro'a et atsmekh be-od khamesh shanim?", "Où te vois-tu dans cinq ans ?"),
    Q("יש לך שאלות אלינו?", "יש לך שאלות אלינו?", "Yesh lekha she'elot eleinu?", "Yesh lakh she'elot eleinu?", "As-tu des questions pour nous ?"),
  ],
  free: [
    Q("מה עשית היום?", "מה עשית היום?", "Ma asita ha-yom?", "Ma asit ha-yom?", "Qu'as-tu fait aujourd'hui ?"),
    Q("מה אתה אוהב לעשות בזמן הפנוי?", "מה את אוהבת לעשות בזמן הפנוי?", "Ma ata ohev la'asot ba-zman ha-panui?", "Ma at ohevet la'asot ba-zman ha-panui?", "Qu'aimes-tu faire pendant ton temps libre ?"),
    Q("איזה אוכל אתה אוהב?", "איזה אוכל את אוהבת?", "Eize okhel ata ohev?", "Eize okhel at ohevet?", "Quelle cuisine aimes-tu ?"),
    Q("איפה טיילת לאחרונה?", "איפה טיילת לאחרונה?", "Eifo tiyalta la-akhrona?", "Eifo tiyalt la-akhrona?", "Où as-tu voyagé récemment ?"),
    Q("מה התוכניות שלך לסוף השבוע?", "מה התוכניות שלך לסוף השבוע?", "Ma ha-tokhniyot shelkha le-sof ha-shavua?", "Ma ha-tokhniyot shelakh le-sof ha-shavua?", "Quels sont tes projets pour le week-end ?"),
    Q("איזה סרט ראית לאחרונה?", "איזה סרט ראית לאחרונה?", "Eize seret ra'ita la-akhrona?", "Eize seret ra'it la-akhrona?", "Quel film as-tu vu récemment ?"),
  ],
};

/** Petits mots de réaction, choisis selon le ton du message de l'apprenant. */
const HAPPY: Line[] = [QS("יפה!", "Yafe!", "Chouette !"), QS("מעניין.", "Me'anyen.", "Intéressant."), QS("איזה כיף!", "Eize kef!", "Super !"), QS("נהדר.", "Nehedar.", "Très bien."), QS("אני מבין.", "Ani mevin.", "Je vois.")];
const SAD: Line[] = [QS("אני מצטער לשמוע.", "Ani mitsta'er lishmo'a.", "Je suis désolé de l'entendre."), QS("אני מבין, זה קורה.", "Ani mevin, ze kore.", "Je comprends, ça arrive.")];
const SADWORDS = /עצוב|עצובה|עייף|עייפה|קשה|לא טוב|חולה|כועס|כועסת|מתוסכל|בעיה|מפחד/;

const FORMAL: Line[] = [QS("מעניין.", "Me'anyen.", "Intéressant."), QS("אני מבין.", "Ani mevin.", "Je vois."), QS("טוב מאוד.", "Tov me'od.", "Très bien."), QS("בסדר גמור.", "Be-seder gamur.", "Très bien.")];

export function reaction(userText: string, n: number, sceneId = ""): Line {
  const list = SADWORDS.test(userText) ? SAD : sceneId === "interview" ? FORMAL : HAPPY;
  return list[n % list.length];
}

/** Message qui pose une question (le personnage y répond au lieu d'enchaîner). */
export const isQuestion = (raw: string) => /\?/.test(raw) || /^(מה|איפה|למה|מתי|איך|כמה|מי|האם|אפשר|ולך|ואתה|ואת|איזה|איזו)(\s|$)/.test(flat(raw));

/** Quand le personnage ne sait pas : mieux vaut l'avouer que d'inventer. */
export const DONT_KNOW: Line = { he: "סליחה, אני לא בטוח.", tr: "Slikha, ani lo batuakh.", fr: "Désolé, je ne suis pas sûr." };
/** Texte qui sent l'invention d'un petit modèle : chiffres, TVA, livraison, courriel… */
export const BIZARRE = /\d|מע"מ|מע״מ|משלוח|דואר אלקטרוני|%|₪|בבקשה תגיד לי|שגיאת/;

/** « Quelle heure est-il ? » : l'heure réelle, dite à l'israélienne (au quart d'heure près). */
const H: [string, string][] = [["שתים עשרה", "shteim esre"], ["אחת", "akhat"], ["שתיים", "shtayim"], ["שלוש", "shalosh"], ["ארבע", "arba"], ["חמש", "khamesh"], ["שש", "shesh"], ["שבע", "sheva"], ["שמונה", "shmone"], ["תשע", "tesha"], ["עשר", "eser"], ["אחת עשרה", "akhat esre"]];
const M: Record<number, [string, string]> = { 5: ["חמש", "khamesh"], 10: ["עשר", "eser"], 20: ["עשרים", "esrim"], 25: ["עשרים וחמש", "esrim ve-khamesh"] };

export const ASK_TIME = /מה השעה|כמה השעה|איזו שעה עכשיו/;

export function timeLine(d = new Date()): Line {
  const total = Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const hour = (h: number) => H[h % 12];
  // Après 35 minutes on dit « il manque … » : plus naturel pour 45 (פחות רבע).
  const next = hour(hh + 1);
  const cur = hour(hh);
  let he: string;
  let tr: string;
  if (mm === 0) [he, tr] = [`השעה ${cur[0]} בדיוק.`, `Ha-sha'a ${cur[1]} be-diyuk.`];
  else if (mm === 15) [he, tr] = [`השעה ${cur[0]} ורבע.`, `Ha-sha'a ${cur[1]} ve-reva.`];
  else if (mm === 30) [he, tr] = [`השעה ${cur[0]} וחצי.`, `Ha-sha'a ${cur[1]} va-khetsi.`];
  else if (mm === 45) [he, tr] = [`השעה ${next[0]} פחות רבע.`, `Ha-sha'a ${next[1]} pakhot reva.`];
  else if (M[mm]) [he, tr] = [`השעה ${cur[0]} ו${M[mm][0]} דקות.`, `Ha-sha'a ${cur[1]} u-${M[mm][1]} dakot.`];
  else [he, tr] = [`השעה ${next[0]} פחות ${M[60 - mm]?.[0] ?? "עשר"} דקות.`, `Ha-sha'a ${next[1]} pakhot ${M[60 - mm]?.[1] ?? "eser"} dakot.`];
  return { he, tr, fr: `Il est ${String(d.getHours()).padStart(2, "0")} h ${String(d.getMinutes()).padStart(2, "0")}.` };
}
