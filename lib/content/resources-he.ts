/** Banque de ressources pour apprendre l'hébreu. Contenu écrit à la main (pas généré par l'IA). */

export interface Letter { he: string; final?: string; name: string; sound: string; example: { he: string; tr: string; fr: string } }
export interface Word { he: string; tr: string; fr: string; note?: string }
export interface Theme { id: string; title: string; words: Word[] }
export interface GrammarPoint { id: string; title: string; rule: string; examples: Word[] }

export const ALPHABET: Letter[] = [
  { he: "א", name: "Alef", sound: "muette (porte une voyelle)", example: { he: "אבא", tr: "aba", fr: "papa" } },
  { he: "ב", name: "Bet / Vet", sound: "b ou v", example: { he: "בית", tr: "bayit", fr: "maison" } },
  { he: "ג", name: "Gimel", sound: "g (dur)", example: { he: "גדול", tr: "gadol", fr: "grand" } },
  { he: "ד", name: "Dalet", sound: "d", example: { he: "דג", tr: "dag", fr: "poisson" } },
  { he: "ה", name: "He", sound: "h (souvent muet en fin de mot)", example: { he: "הר", tr: "har", fr: "montagne" } },
  { he: "ו", name: "Vav", sound: "v, ou ; o/ou comme voyelle", example: { he: "ורד", tr: "vered", fr: "rose" } },
  { he: "ז", name: "Zayin", sound: "z", example: { he: "זמן", tr: "zman", fr: "temps" } },
  { he: "ח", name: "Het", sound: "kh (raclé, comme la jota)", example: { he: "חלב", tr: "khalav", fr: "lait" } },
  { he: "ט", name: "Tet", sound: "t", example: { he: "טוב", tr: "tov", fr: "bon" } },
  { he: "י", name: "Yod", sound: "y ; i comme voyelle", example: { he: "ים", tr: "yam", fr: "mer" } },
  { he: "כ", final: "ך", name: "Kaf / Khaf", sound: "k ou kh", example: { he: "כלב", tr: "kelev", fr: "chien" } },
  { he: "ל", name: "Lamed", sound: "l", example: { he: "לחם", tr: "lekhem", fr: "pain" } },
  { he: "מ", final: "ם", name: "Mem", sound: "m", example: { he: "מים", tr: "mayim", fr: "eau" } },
  { he: "נ", final: "ן", name: "Nun", sound: "n", example: { he: "נר", tr: "ner", fr: "bougie" } },
  { he: "ס", name: "Samekh", sound: "s", example: { he: "ספר", tr: "sefer", fr: "livre" } },
  { he: "ע", name: "Ayin", sound: "muette en hébreu moderne", example: { he: "עיר", tr: "ir", fr: "ville" } },
  { he: "פ", final: "ף", name: "Pe / Fe", sound: "p ou f", example: { he: "פרח", tr: "perakh", fr: "fleur" } },
  { he: "צ", final: "ץ", name: "Tsadi", sound: "ts", example: { he: "צבע", tr: "tseva", fr: "couleur" } },
  { he: "ק", name: "Qof", sound: "k", example: { he: "קפה", tr: "kafe", fr: "café" } },
  { he: "ר", name: "Resh", sound: "r (roulé du fond de la gorge)", example: { he: "רחוב", tr: "rekhov", fr: "rue" } },
  { he: "ש", name: "Shin / Sin", sound: "ch ou s", example: { he: "שמש", tr: "shemesh", fr: "soleil" } },
  { he: "ת", name: "Tav", sound: "t", example: { he: "תפוח", tr: "tapuakh", fr: "pomme" } },
];

export const THEMES: Theme[] = [
  {
    id: "greetings", title: "Salutations et politesse", words: [
      { he: "שלום", tr: "shalom", fr: "bonjour, salut (et au revoir)" },
      { he: "בוקר טוב", tr: "boker tov", fr: "bonjour (le matin)" },
      { he: "ערב טוב", tr: "erev tov", fr: "bonsoir" },
      { he: "לילה טוב", tr: "layla tov", fr: "bonne nuit" },
      { he: "להתראות", tr: "lehitra'ot", fr: "au revoir" },
      { he: "מה נשמע?", tr: "ma nishma?", fr: "ça va ? quoi de neuf ?" },
      { he: "הכול בסדר", tr: "hakol beseder", fr: "tout va bien" },
      { he: "תודה", tr: "toda", fr: "merci" },
      { he: "תודה רבה", tr: "toda raba", fr: "merci beaucoup" },
      { he: "בבקשה", tr: "bevakasha", fr: "s'il te plaît ; de rien" },
      { he: "סליחה", tr: "slikha", fr: "pardon, excusez-moi" },
      { he: "כן", tr: "ken", fr: "oui" },
      { he: "לא", tr: "lo", fr: "non ; ne… pas" },
      { he: "נעים מאוד", tr: "na'im me'od", fr: "enchanté(e)" },
    ],
  },
  {
    id: "numbers", title: "Nombres (1 à 10)", words: [
      { he: "אחת", tr: "akhat", fr: "un" }, { he: "שתיים", tr: "shtayim", fr: "deux" },
      { he: "שלוש", tr: "shalosh", fr: "trois" }, { he: "ארבע", tr: "arba", fr: "quatre" },
      { he: "חמש", tr: "khamesh", fr: "cinq" }, { he: "שש", tr: "shesh", fr: "six" },
      { he: "שבע", tr: "sheva", fr: "sept" }, { he: "שמונה", tr: "shmone", fr: "huit" },
      { he: "תשע", tr: "tesha", fr: "neuf" }, { he: "עשר", tr: "eser", fr: "dix" },
    ].map((w) => ({ ...w, note: "forme utilisée pour compter et pour l'heure" })),
  },
  {
    id: "food", title: "Nourriture et boissons", words: [
      { he: "לחם", tr: "lekhem", fr: "pain", note: "masculin" },
      { he: "מים", tr: "mayim", fr: "eau", note: "masculin pluriel" },
      { he: "קפה", tr: "kafe", fr: "café", note: "masculin" },
      { he: "תה", tr: "te", fr: "thé", note: "masculin" },
      { he: "חלב", tr: "khalav", fr: "lait", note: "masculin" },
      { he: "ביצה", tr: "beitsa", fr: "œuf", note: "féminin" },
      { he: "גבינה", tr: "gvina", fr: "fromage", note: "féminin" },
      { he: "עוף", tr: "of", fr: "poulet", note: "masculin" },
      { he: "סלט", tr: "salat", fr: "salade", note: "masculin" },
      { he: "חומוס", tr: "khumus", fr: "houmous", note: "masculin" },
      { he: "ירקות", tr: "yerakot", fr: "légumes", note: "masculin pluriel" },
      { he: "תפוח", tr: "tapuakh", fr: "pomme", note: "masculin" },
      { he: "עוגה", tr: "uga", fr: "gâteau", note: "féminin" },
      { he: "החשבון", tr: "ha-kheshbon", fr: "l'addition", note: "masculin" },
    ],
  },
  {
    id: "family", title: "Famille et proches", words: [
      { he: "משפחה", tr: "mishpakha", fr: "famille", note: "féminin" },
      { he: "אבא", tr: "aba", fr: "papa" }, { he: "אמא", tr: "ima", fr: "maman" },
      { he: "אח", tr: "akh", fr: "frère" }, { he: "אחות", tr: "akhot", fr: "sœur" },
      { he: "בן", tr: "ben", fr: "fils ; garçon" }, { he: "בת", tr: "bat", fr: "fille" },
      { he: "סבא", tr: "saba", fr: "grand-père" }, { he: "סבתא", tr: "savta", fr: "grand-mère" },
      { he: "חבר", tr: "khaver", fr: "ami ; petit ami" }, { he: "חברה", tr: "khavera", fr: "amie ; petite amie" },
    ],
  },
  {
    id: "city", title: "Ville et voyage", words: [
      { he: "מלון", tr: "malon", fr: "hôtel" }, { he: "שדה תעופה", tr: "sde te'ufa", fr: "aéroport" },
      { he: "תחנה", tr: "takhana", fr: "arrêt, station", note: "féminin" },
      { he: "אוטובוס", tr: "otobus", fr: "bus" }, { he: "רכבת", tr: "rakevet", fr: "train", note: "féminin" },
      { he: "מונית", tr: "monit", fr: "taxi", note: "féminin" }, { he: "רחוב", tr: "rekhov", fr: "rue" },
      { he: "ים", tr: "yam", fr: "mer" }, { he: "כרטיס", tr: "kartis", fr: "billet, carte" },
      { he: "דרכון", tr: "darkon", fr: "passeport" }, { he: "ימינה", tr: "yamina", fr: "à droite" },
      { he: "שמאלה", tr: "smola", fr: "à gauche" }, { he: "ישר", tr: "yashar", fr: "tout droit" },
    ],
  },
  {
    id: "time", title: "Le temps", words: [
      { he: "היום", tr: "hayom", fr: "aujourd'hui" }, { he: "מחר", tr: "makhar", fr: "demain" },
      { he: "אתמול", tr: "etmol", fr: "hier" }, { he: "עכשיו", tr: "akhshav", fr: "maintenant" },
      { he: "בוקר", tr: "boker", fr: "matin" }, { he: "ערב", tr: "erev", fr: "soir" },
      { he: "שבוע", tr: "shavua", fr: "semaine" }, { he: "סוף שבוע", tr: "sof shavua", fr: "week-end" },
      { he: "שבת", tr: "shabat", fr: "samedi ; shabbat" }, { he: "שעה", tr: "sha'a", fr: "heure", note: "féminin" },
    ],
  },
  {
    id: "verbs", title: "Verbes essentiels (présent)", words: [
      { he: "רוצה", tr: "rotse / rotsa", fr: "vouloir", note: "masc. / fém. — infinitif לרצות" },
      { he: "אוהב / אוהבת", tr: "ohev / ohevet", fr: "aimer", note: "infinitif לאהוב" },
      { he: "הולך / הולכת", tr: "holekh / holekhet", fr: "aller (à pied)", note: "infinitif ללכת" },
      { he: "נוסע / נוסעת", tr: "nose'a / nosa'at", fr: "aller (en véhicule), voyager", note: "infinitif לנסוע" },
      { he: "אוכל / אוכלת", tr: "okhel / okhelet", fr: "manger", note: "infinitif לאכול" },
      { he: "שותה", tr: "shote / shota", fr: "boire", note: "masc. / fém. — infinitif לשתות" },
      { he: "מדבר / מדברת", tr: "medaber / medaberet", fr: "parler", note: "infinitif לדבר" },
      { he: "גר / גרה", tr: "gar / gara", fr: "habiter", note: "infinitif לגור" },
      { he: "עובד / עובדת", tr: "oved / ovedet", fr: "travailler", note: "infinitif לעבוד" },
      { he: "לומד / לומדת", tr: "lomed / lomedet", fr: "apprendre, étudier", note: "infinitif ללמוד" },
      { he: "יודע / יודעת", tr: "yode'a / yoda'at", fr: "savoir", note: "infinitif לדעת" },
      { he: "מבין / מבינה", tr: "mevin / mevina", fr: "comprendre", note: "infinitif להבין" },
    ],
  },
];

export const PHRASES: Word[] = [
  { he: "אני לא מבין / מבינה", tr: "ani lo mevin / mevina", fr: "je ne comprends pas" },
  { he: "לאט, בבקשה", tr: "le'at, bevakasha", fr: "lentement, s'il te plaît" },
  { he: "איך אומרים … בעברית?", tr: "eikh omrim … be-ivrit?", fr: "comment on dit … en hébreu ?" },
  { he: "אני מדבר קצת עברית", tr: "ani medaber ktsat ivrit", fr: "je parle un peu hébreu", note: "fém. : אני מדברת (medaberet)" },
  { he: "כמה זה עולה?", tr: "kama ze ole?", fr: "combien ça coûte ?" },
  { he: "איפה השירותים?", tr: "eifo ha-sherutim?", fr: "où sont les toilettes ?" },
  { he: "אפשר את החשבון, בבקשה?", tr: "efshar et ha-kheshbon, bevakasha?", fr: "l'addition, s'il vous plaît ?" },
  { he: "מה השעה?", tr: "ma ha-sha'a?", fr: "quelle heure est-il ?" },
  { he: "אין בעיה", tr: "ein be'aya", fr: "pas de problème" },
  { he: "יאללה", tr: "yalla", fr: "allez ! on y va !" },
  { he: "בתיאבון", tr: "bete'avon", fr: "bon appétit" },
  { he: "שבת שלום", tr: "shabat shalom", fr: "bon shabbat" },
  { he: "בהצלחה", tr: "behatslakha", fr: "bonne chance" },
  { he: "מזל טוב", tr: "mazal tov", fr: "félicitations" },
];

export const GRAMMAR: GrammarPoint[] = [
  {
    id: "no-be", title: "Pas de verbe « être » au présent",
    rule: "Au présent, on ne dit pas « est » : on met juste le sujet puis l'attribut.",
    examples: [
      { he: "אני סטודנט", tr: "ani student", fr: "je suis étudiant" },
      { he: "הקפה חם", tr: "ha-kafe kham", fr: "le café est chaud" },
    ],
  },
  {
    id: "article", title: "L'article « le / la » : ה",
    rule: "L'article défini est la lettre ה collée devant le mot, au masculin comme au féminin. Il n'y a pas d'article indéfini (« un, une »).",
    examples: [
      { he: "בית → הבית", tr: "bayit → ha-bayit", fr: "une maison → la maison" },
      { he: "עיר → העיר", tr: "ir → ha-ir", fr: "une ville → la ville" },
    ],
  },
  {
    id: "pronouns", title: "Les pronoms personnels",
    rule: "« Tu » et « vous » changent selon le genre de la personne à qui on parle.",
    examples: [
      { he: "אני", tr: "ani", fr: "je" }, { he: "אתה / את", tr: "ata / at", fr: "tu (m. / f.)" },
      { he: "הוא / היא", tr: "hu / hi", fr: "il / elle" }, { he: "אנחנו", tr: "anakhnu", fr: "nous" },
      { he: "אתם / אתן", tr: "atem / aten", fr: "vous (m. / f.)" }, { he: "הם / הן", tr: "hem / hen", fr: "ils / elles" },
    ],
  },
  {
    id: "present", title: "Le présent : 4 formes",
    rule: "Au présent, le verbe s'accorde en genre et en nombre (pas en personne) : masculin, féminin, masculin pluriel, féminin pluriel.",
    examples: [
      { he: "אוהב", tr: "ohev", fr: "aime (m.)" }, { he: "אוהבת", tr: "ohevet", fr: "aime (f.)" },
      { he: "אוהבים", tr: "ohavim", fr: "aiment (m. pl.)" }, { he: "אוהבות", tr: "ohavot", fr: "aiment (f. pl.)" },
    ],
  },
  {
    id: "negation", title: "La négation : לא",
    rule: "On place לא (lo) juste avant le verbe ou l'adjectif.",
    examples: [
      { he: "אני לא מבין", tr: "ani lo mevin", fr: "je ne comprends pas" },
      { he: "זה לא יקר", tr: "ze lo yakar", fr: "ce n'est pas cher" },
    ],
  },
  {
    id: "have", title: "Avoir : יש לי / אין לי",
    rule: "Pour « avoir », on dit « il y a à moi » : יש לי. La négation est אין לי.",
    examples: [
      { he: "יש לי אח", tr: "yesh li akh", fr: "j'ai un frère" },
      { he: "אין לי זמן", tr: "ein li zman", fr: "je n'ai pas le temps" },
      { he: "יש לך כסף?", tr: "yesh lekha / lakh kesef?", fr: "tu as de l'argent ? (m. / f.)" },
    ],
  },
  {
    id: "possession", title: "La possession : של",
    rule: "Le possesseur vient après l'objet, avec של (« de ») : שלי à moi, שלך à toi, שלו à lui, שלה à elle.",
    examples: [
      { he: "הספר שלי", tr: "ha-sefer sheli", fr: "mon livre" },
      { he: "הבית שלה", tr: "ha-bayit shela", fr: "sa maison (à elle)" },
    ],
  },
  {
    id: "adjectives", title: "Les adjectifs",
    rule: "L'adjectif se place après le nom et s'accorde avec lui. Si le nom a l'article ה, l'adjectif le prend aussi.",
    examples: [
      { he: "בית גדול", tr: "bayit gadol", fr: "une grande maison" },
      { he: "דירה גדולה", tr: "dira gdola", fr: "un grand appartement (fém.)" },
      { he: "הבית הגדול", tr: "ha-bayit ha-gadol", fr: "la grande maison" },
    ],
  },
  {
    id: "prefixes", title: "Les petits mots collés : ב, ל, מ, ו",
    rule: "« Dans/à » (ב), « à/pour » (ל), « de » (מ) et « et » (ו) se collent au mot suivant.",
    examples: [
      { he: "בתל אביב", tr: "be-Tel Aviv", fr: "à Tel-Aviv" },
      { he: "לירושלים", tr: "li-Yerushalayim", fr: "à Jérusalem (direction)" },
      { he: "מפריז", tr: "mi-Pariz", fr: "de Paris" },
      { he: "קפה ועוגה", tr: "kafe ve-uga", fr: "un café et un gâteau" },
    ],
  },
  {
    id: "questions", title: "Les mots interrogatifs",
    rule: "La question garde l'ordre de la phrase ; seule l'intonation monte.",
    examples: [
      { he: "מה?", tr: "ma?", fr: "quoi ?" }, { he: "מי?", tr: "mi?", fr: "qui ?" },
      { he: "איפה?", tr: "eifo?", fr: "où ?" }, { he: "לאן?", tr: "le'an?", fr: "où (vers où) ?" },
      { he: "מאיפה?", tr: "me'eifo?", fr: "d'où ?" }, { he: "מתי?", tr: "matai?", fr: "quand ?" },
      { he: "למה?", tr: "lama?", fr: "pourquoi ?" }, { he: "איך?", tr: "eikh?", fr: "comment ?" },
      { he: "כמה?", tr: "kama?", fr: "combien ?" },
    ],
  },
  {
    id: "past", title: "Le passé (verbes réguliers)",
    rule: "Au passé, des terminaisons indiquent la personne. Exemple avec אכל (manger).",
    examples: [
      { he: "אכלתי", tr: "akhalti", fr: "j'ai mangé" },
      { he: "אכלת", tr: "akhalta / akhalt", fr: "tu as mangé (m. / f.)" },
      { he: "הוא אכל", tr: "hu akhal", fr: "il a mangé" },
      { he: "היא אכלה", tr: "hi akhla", fr: "elle a mangé" },
      { he: "אכלנו", tr: "akhalnu", fr: "nous avons mangé" },
    ],
  },
  {
    id: "want-inf", title: "Vouloir + infinitif",
    rule: "Pour dire ce qu'on veut faire : רוצה (rotse / rotsa) + infinitif (souvent commençant par ל).",
    examples: [
      { he: "אני רוצה לאכול", tr: "ani rotse le'ekhol", fr: "je veux manger (m.)" },
      { he: "אני רוצה לנסוע לישראל", tr: "ani rotsa linso'a le-Israel", fr: "je veux aller en Israël (f.)" },
    ],
  },
];
