import type { Gender, Level, Starter } from "../languages";
import { PHRASES, THEMES } from "./resources-he";

/** Parcours de cours en hébreu. Contenu écrit à la main. Formes m/f = genre de l'apprenant. */
type G = Record<Gender, string>;
const s = (v: string): G => ({ m: v, f: v });
const g = (m: string, f: string): G => ({ m, f });

export interface Line { he: G; tr: G; fr: string }
/** Morceau d'une consigne : texte français (voix du système) ou mot hébreu (voix hébraïque, `he` au genre de l'apprenant). */
export interface IntroPart { t: string; he?: G }

/** Étapes d'une journée d'entraînement.
 *  - intro : Shuli explique (français).
 *  - repeat : écoute puis répète.
 *  - answer : une question, la réponse modèle est donnée en aide.
 *  - listen : compréhension, Shuli dit une phrase sans l'écrire, l'apprenant choisit son sens (pas de micro).
 *  - fill : phrase à trou, l'apprenant dit la phrase entière de mémoire.
 *  - free : question ouverte, l'apprenant répond avec ses vraies infos (l'exemple n'est qu'une aide).
 *  - swap : transformer une phrase (changer de genre, de mot) et la dire. */
export type Step =
  | { kind: "intro"; fr: string; parts?: IntroPart[] }
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

/** Fin de jour : un récapitulatif de ce qu'on sait dire (sens en français des phrases répétées), puis le jeu de rôle. */
const recap = (key: Line, steps: Step[]): Step => {
  const said: string[] = [];
  for (const x of [key, ...steps.flatMap((s) => (s.kind === "repeat" ? [s.line] : []))]) {
    const f = x.fr.replace(/\s*\([^)]*\)/g, "").replace(/[?!.…]+$/, "").trim();
    if (f && !said.includes(f) && said.length < 3) said.push(f);
  }
  return intro(`Bravo ! Aujourd'hui tu sais dire : ${said.map((f) => f.charAt(0).toLowerCase() + f.slice(1)).join(" ; ")}. Passe au jeu de rôle pour les utiliser en vraie conversation.`);
};

const day = (id: string, title: string, key: Line, steps: Step[], role: string, goal: string, starter: Line): Day => ({
  id, title, key, steps: [...steps, recap(key, steps)], scenario: { role, goal, starter: st(starter) },
});

/** Jour de lecture : mots à voir, entendre et répéter, une phrase de lecture, des écoutes où l'on choisit le mot écrit. */
const readDay = (id: string, title: string, introFr: string, words: Line[], phrase: Line, blank: [string, string], hear: { say: Line; bad: string[] }[]): Day =>
  day(id, title, words[0], [
    intro(introFr),
    ...words.map(rep),
    rep(phrase),
    ...hear.map((h) => listen(h.say, "Quel mot est écrit ? Écoute et choisis.", h.say.he.m, ...h.bad)),
    fill(phrase, blank[0], blank[1]),
  ], "un ami qui t'écrit des mots au tableau", "Lire des mots à voix haute", L(g("קרא את המילה הזאת: קפה", "קראי את המילה הזאת: קפה"), g("Kra et ha-mila ha-zot: kafe", "Kri et ha-mila ha-zot: kafe"), "Lis ce mot : café"));

/** Un verbe en six phrases : je (présent), il (présent), je / il / elle (passé), nous (futur) ; plus une transformation (il → elle) et un trou. */
type VerbSpec = {
  obj: [string, string]; // complément hébreu et translittération
  presM: [string, string]; presF: [string, string]; past1: [string, string]; past3m: [string, string]; past3f: [string, string]; fut1p: [string, string];
  fr: [string, string, string, string, string, string]; // je (présent), il (présent), elle (passé), je (passé), il (passé), nous (futur)
};
const verbSteps = (v: VerbSpec): Step[] => {
  const [o, ot] = v.obj;
  const ani = L(g(`אני ${v.presM[0]} ${o}`, `אני ${v.presF[0]} ${o}`), g(`Ani ${v.presM[1]} ${ot}`, `Ani ${v.presF[1]} ${ot}`), v.fr[0]);
  const hu = L(`הוא ${v.presM[0]} ${o}`, `Hu ${v.presM[1]} ${ot}`, v.fr[1]);
  const hiPres = L(`היא ${v.presF[0]} ${o}`, `Hi ${v.presF[1]} ${ot}`, v.fr[1].replace(/^il /, "elle ").replace(/^Il /, "Elle "));
  const hiPast = L(`היא ${v.past3f[0]} ${o}`, `Hi ${v.past3f[1]} ${ot}`, v.fr[2]);
  const aniPast = L(`${v.past1[0]} ${o}`, `${v.past1[1]} ${ot}`, v.fr[3]);
  const huPast = L(`הוא ${v.past3m[0]} ${o}`, `Hu ${v.past3m[1]} ${ot}`, v.fr[4]);
  const we = L(`אנחנו ${v.fut1p[0]} ${o}`, `Anakhnu ${v.fut1p[1]} ${ot}`, v.fr[5]);
  return [rep(ani), rep(hu), rep(hiPast), rep(aniPast), rep(huPast), rep(we),
    swap("Parle d'elle au lieu de parler de lui.", hu, hiPres),
    fill(huPast, v.past3m[0], v.past3m[1]),
    listen(hiPast, "Qui a fait l'action, et quand ?", "Elle, dans le passé", "Lui, dans le passé", "Moi, dans le passé", "Nous, dans le futur")];
};
const verbDay = (id: string, title: string, intro1: string, verbs: VerbSpec[], key: Line): Day =>
  day(id, title, key, [
    intro(intro1),
    ...verbs.flatMap(verbSteps),
  ], "un ami qui te demande ce que font les gens autour de toi", "Parler de ce que font les autres : il, elle, nous", L("מה עשיתם אתמול?", "Ma asitem etmol?", "Qu'est-ce que vous avez fait hier ?"));

/** Jour de compréhension : un mini-dialogue entendu à vitesse naturelle, des questions à choix, deux phrases clés à répéter, une réponse libre. */
const dialogDay = (id: string, title: string, tip: string, dialog: Line, qs: [string, string, ...string[]][], keys: Line[], q: Line, a: Line, role: string, goal: string): Day =>
  day(id, title, dialog, [
    intro(tip),
    ...qs.map(([ask, good, ...bad]) => listen(dialog, ask, good, ...bad)),
    ...keys.map(rep),
    ask(q, a),
    fill(keys[0], keys[0].he.m.split(" ")[0], keys[0].tr.m.split(" ")[0]),
  ], role, goal, q);

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
            listen(L("עוד פעם, בבקשה", "Od pa'am, bevakasha", "Encore une fois, s'il te plaît"), "Que demande cette personne ?", "De répéter", "De parler plus vite", "De payer", "De partir"),
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
            rep(L("אין בעיה", "Ein be'aya", "Pas de problème")),
            listen(L("אין בעיה", "Ein be'aya", "Pas de problème"), "Que répond cette personne ?", "Elle est d'accord, pas de problème", "Elle refuse", "Elle ne comprend pas", "Elle est pressée"),
            fill(L(g("אני צריך עזרה", "אני צריכה עזרה"), g("Ani tsarikh ezra", "Ani tsrikha ezra"), "J'ai besoin d'aide"), "עזרה", "ezra"),
          ], "une employée à l'accueil d'un centre commercial", "Demander les toilettes et de l'aide", L("שלום וברוכים הבאים! במה אפשר לעזור?", "Shalom u-vruchim ha-ba'im! Ba-me efshar la'azor?", "Bonjour et bienvenue ! En quoi puis-je vous aider ?")),
        ],
      },
      {
        id: "u00", title: "Lire l'hébreu",
        days: [
          readDay("u00d1", "Les lettres : א ב ג ד ה", "Bienvenue dans l'alphabet. L'hébreu s'écrit et se lit de droite à gauche, sans voyelles. Aujourd'hui, cinq lettres : alef, une lettre muette qui porte une voyelle ; bet, qui fait « b » ; guimel, « g » ; dalet, « d » ; et hé, « h ». Dans ce cours, la translittération en lettres latines t'aide à prononcer : « kh » est un son raclé du fond de la gorge, et « ts » se dit comme dans « tsar ».",
            [L("אבא", "aba", "papa"), L("בית", "bayit", "maison"), L("גדול", "gadol", "grand"), L("דג", "dag", "poisson"), L("הר", "har", "montagne")],
            L("הדג גדול", "Ha-dag gadol", "Le poisson est grand"), ["גדול", "gadol"],
            [{ say: L("דג", "dag", "poisson"), bad: ["גדול", "בית", "הר"] }, { say: L("הר", "har", "montagne"), bad: ["דג", "גדול", "בית"] }, { say: L("בית", "bayit", "maison"), bad: ["אבא", "דג", "הר"] }]),
          readDay("u00d2", "Les lettres : ו ז ח ט י", "Cinq nouvelles lettres : vav, qui fait « v » ; zayin, « z » ; het, un « kh » raclé du fond de la gorge ; tet, « t » ; et yod, « y ». Attention : vav et yod servent aussi de voyelles, on le verra au jour 7.",
            [L("ורד", "vered", "rose"), L("זמן", "zman", "temps"), L("חלב", "khalav", "lait"), L("טוב", "tov", "bon"), L("ים", "yam", "mer")],
            L("הדג טוב", "Ha-dag tov", "Le poisson est bon"), ["טוב", "tov"],
            [{ say: L("חלב", "khalav", "lait"), bad: ["זמן", "טוב", "ים"] }, { say: L("ים", "yam", "mer"), bad: ["ורד", "חלב", "זמן"] }, { say: L("טוב", "tov", "bon"), bad: ["ורד", "חלב", "גדול"] }]),
          readDay("u00d3", "Les lettres : כ ל מ נ ס", "Cinq lettres de plus : kaf, qui fait « k » ; lamed, « l » ; mem, « m » ; noun, « n » ; et samekh, « s ». Cinq lettres de l'alphabet ont une forme spéciale en fin de mot : on les verra au jour 6.",
            [L("כלב", "kelev", "chien"), L("לחם", "lekhem", "pain"), L("מים", "mayim", "eau"), L("נר", "ner", "bougie"), L("ספר", "sefer", "livre")],
            L("הכלב גדול", "Ha-kelev gadol", "Le chien est grand"), ["כלב", "kelev"],
            [{ say: L("כלב", "kelev", "chien"), bad: ["לחם", "ספר", "נר"] }, { say: L("מים", "mayim", "eau"), bad: ["ים", "כלב", "לחם"] }, { say: L("ספר", "sefer", "livre"), bad: ["כלב", "נר", "לחם"] }]),
          readDay("u00d4", "Les lettres : ע פ צ ק ר", "Cinq lettres : ayin, muette en hébreu moderne comme alef ; pé, « p » ; tsadi, « ts » ; qof, « k » comme kaf ; et resh, « r ».",
            [L("עיר", "ir", "ville"), L("פרח", "perakh", "fleur"), L("צבע", "tseva", "couleur"), L("קפה", "kafe", "café"), L("רחוב", "rekhov", "rue")],
            L("הקפה חם", "Ha-kafe kham", "Le café est chaud"), ["חם", "kham"],
            [{ say: L("עיר", "ir", "ville"), bad: ["ים", "רחוב", "קפה"] }, { say: L("קפה", "kafe", "café"), bad: ["פרח", "כלב", "צבע"] }, { say: L("רחוב", "rekhov", "rue"), bad: ["רחוק", "פרח", "צבע"] }]),
          readDay("u00d5", "Les lettres : ש ת", "Les deux dernières lettres : shin, qui fait « ch » (avec un point à gauche, c'est sin et ça fait « s »), et tav, « t ». Tu connais maintenant les vingt-deux lettres !",
            [L("שמש", "shemesh", "soleil"), L("תפוח", "tapuakh", "pomme"), L("שלום", "shalom", "bonjour"), L("תודה", "toda", "merci"), L("שבת", "shabat", "samedi")],
            L("שלום, תודה", "Shalom, toda", "Bonjour, merci"), ["תודה", "toda"],
            [{ say: L("שלום", "shalom", "bonjour"), bad: ["שמש", "שבת", "תודה"] }, { say: L("תודה", "toda", "merci"), bad: ["תפוח", "שלום", "שמש"] }, { say: L("שבת", "shabat", "samedi"), bad: ["שמש", "שלום", "בית"] }]),
          readDay("u00d6", "Les cinq lettres finales", "Cinq lettres changent de forme à la fin d'un mot : ך pour kaf, ם pour mem, ן pour noun, ף pour pé et ץ pour tsadi. Le son ne change pas : seule la forme change.",
            [L("לך", "lekha", "à toi"), L("שלום", "shalom", "bonjour"), L("גן", "gan", "jardin"), L("כסף", "kesef", "argent"), L("עץ", "ets", "arbre")],
            L("הגן גדול", "Ha-gan gadol", "Le jardin est grand"), ["הגן", "ha-gan"],
            [{ say: L("גן", "gan", "jardin"), bad: ["דג", "ים", "עץ"] }, { say: L("עץ", "ets", "arbre"), bad: ["עיר", "גן", "צבע"] }, { say: L("כסף", "kesef", "argent"), bad: ["ספר", "כלב", "לך"] }]),
          readDay("u00d7", "Les voyelles (nikud)", "Les voyelles sont de petits signes sous ou à côté des lettres : le nikud. Il y a cinq sons : a, e, i, o et ou. Les livres d'enfants et les dictionnaires les écrivent. Les journaux et les messages ne les écrivent pas : on les devine. Les lettres vav et yod aident : vav indique o ou ou, et yod indique i.",
            [L("אַבָּא", "aba", "papa"), L("סֵפֶר", "sefer", "livre"), L("מִים", "mayim", "eau"), L("שָׁלוֹם", "shalom", "bonjour"), L("תּוּת", "tut", "fraise")],
            L("בּוֹקֶר טוֹב", "Boker tov", "Bonjour (le matin)"), ["טוֹב", "tov"],
            [{ say: L("סֵפֶר", "sefer", "livre"), bad: ["מִים", "תּוּת", "אַבָּא"] }, { say: L("תּוּת", "tut", "fraise"), bad: ["סֵפֶר", "שָׁלוֹם", "מִים"] }, { say: L("שָׁלוֹם", "shalom", "bonjour"), bad: ["אַבָּא", "תּוּת", "סֵפֶר"] }]),
          readDay("u00d8", "Les sons difficiles", "Quatre pièges pour un francophone. Un : « kh », la lettre het, se prononce du fond de la gorge, comme la jota espagnole. Deux : alef et ayin sont muets, on entend seulement leur voyelle. Trois : le resh est proche d'un r français. Quatre : l'accent tonique tombe presque toujours sur la dernière syllabe, comme dans toda et shalom.",
            [L("חלב", "khalav", "lait"), L("כלב", "kelev", "chien"), L("חם", "kham", "chaud"), L("שלום", "shalom", "bonjour"), L("תודה", "toda", "merci")],
            L("החלב חם", "Ha-khalav kham", "Le lait est chaud"), ["החלב", "ha-khalav"],
            [{ say: L("חלב", "khalav", "lait"), bad: ["כלב", "חם", "לחם"] }, { say: L("כלב", "kelev", "chien"), bad: ["חלב", "כסף", "כן"] }, { say: L("חם", "kham", "chaud"), bad: ["חלב", "כן", "כלב"] }]),
          readDay("u00d9", "Lire sans voyelles", "Maintenant tu lis comme un Israélien : sans voyelles. Voici les mots les plus utiles pour parler. Lis chaque mot, écoute-le, et répète.",
            [L("בבקשה", "bevakasha", "s'il vous plaît"), L("סליחה", "slikha", "pardon"), L("תודה רבה", "toda raba", "merci beaucoup"), L("בוקר טוב", "boker tov", "bonjour (le matin)"), L("להתראות", "lehitra'ot", "au revoir")],
            L("אני רוצה קפה, בבקשה", "Ani rotse kafe, bevakasha", "Je voudrais un café, s'il vous plaît"), ["בבקשה", "bevakasha"],
            [{ say: L("בבקשה", "bevakasha", "s'il vous plaît"), bad: ["סליחה", "שלום", "תודה"] }, { say: L("סליחה", "slikha", "pardon"), bad: ["בבקשה", "שלום", "להתראות"] }, { say: L("להתראות", "lehitra'ot", "au revoir"), bad: ["בוקר טוב", "שלום", "תודה"] }]),
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
            fill(L("קפה אחד, בבקשה", "Kafe ekhad, bevakasha", "Un café, s'il te plaît"), "אחד", "ekhad"),
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
      {
        id: "u12", title: "Famille, âge et jours",
        days: [
          day("u12d1", "Ma famille", L("יש לי אח ואחות", "Yesh li akh ve-akhot", "J'ai un frère et une sœur"), [
            intro("Pour parler de ta famille, tu as déjà « yesh li » (j'ai). Ajoute « sheli » (à moi) après le nom : aba sheli, mon père ; ima sheli, ma mère."),
            rep(L("יש לי שני ילדים", "Yesh li shnei yeladim", "J'ai deux enfants")),
            rep(L("אבא שלי עובד בבנק", "Aba sheli oved ba-bank", "Mon père travaille dans une banque")),
            rep(L("אמא שלי גרה בליון", "Ima sheli gara be-Lyon", "Ma mère habite à Lyon")),
            rep(L(g("אני נשוי", "אני נשואה"), g("Ani nasui", "Ani nesu'a"), "Je suis marié(e)")),
            listen(L("אמא שלי גרה בליון", "Ima sheli gara be-Lyon", "Ma mère habite à Lyon"), "Où habite sa mère ?", "À Lyon", "À Paris", "À Haïfa", "À Eilat"),
            swap("Parle de ta mère au lieu de ton père.", L("אבא שלי עובד בבנק", "Aba sheli oved ba-bank", "Mon père travaille dans une banque"), L("אמא שלי עובדת בבנק", "Ima sheli ovedet ba-bank", "Ma mère travaille dans une banque")),
            fill(L("אמא שלי גרה בליון", "Ima sheli gara be-Lyon", "Ma mère habite à Lyon"), "גרה", "gara"),
            ask(L("יש לך ילדים?", g("Yesh lekha yeladim?", "Yesh lakh yeladim?"), "Tu as des enfants ?"), L("כן, יש לי שני ילדים", "Ken, yesh li shnei yeladim", "Oui, j'ai deux enfants")),
            free(L(g("ספר לי על המשפחה שלך", "ספרי לי על המשפחה שלך"), g("Saper li al ha-mishpakha shelkha", "Sapri li al ha-mishpakha shelakh"), "Parle-moi de ta famille"), L("יש לי אח ואחות. אבא שלי עובד בבנק", "Yesh li akh ve-akhot. Aba sheli oved ba-bank", "J'ai un frère et une sœur. Mon père travaille dans une banque")),
          ], "un collègue qui veut mieux te connaître", "Parler de ta famille", L(g("ספר לי על המשפחה שלך", "ספרי לי על המשפחה שלך"), g("Saper li al ha-mishpakha shelkha", "Sapri li al ha-mishpakha shelakh"), "Parle-moi de ta famille")),
          day("u12d2", "L'âge", L(g("אני בן שלושים", "אני בת שלושים"), g("Ani ben shloshim", "Ani bat shloshim"), "J'ai trente ans"), [
            intro("En hébreu, on ne « a » pas un âge : on est « fils de » ou « fille de » tant d'années. Un homme dit « ben », une femme dit « bat » : ani ben shloshim, ani bat shloshim."),
            rep(L(g("בן כמה אתה?", "בת כמה את?"), g("Ben kama ata?", "Bat kama at?"), "Tu as quel âge ?")),
            rep(L(g("אני בן שלושים", "אני בת שלושים"), g("Ani ben shloshim", "Ani bat shloshim"), "J'ai trente ans")),
            rep(L("הבת שלי בת שבע", "Ha-bat sheli bat sheva", "Ma fille a sept ans")),
            rep(L("הוא בן ארבעים וחמש", "Hu ben arba'im ve-khamesh", "Il a quarante-cinq ans")),
            listen(L("אני בת עשרים ושמונה", "Ani bat esrim ve-shmone", "J'ai vingt-huit ans"), "Quel âge a-t-elle ?", "Vingt-huit ans", "Dix-huit ans", "Trente-huit ans", "Quatre-vingt-deux ans"),
            swap("Dis vingt-cinq ans au lieu de trente.", L(g("אני בן שלושים", "אני בת שלושים"), g("Ani ben shloshim", "Ani bat shloshim"), "J'ai trente ans"), L(g("אני בן עשרים וחמש", "אני בת עשרים וחמש"), g("Ani ben esrim ve-khamesh", "Ani bat esrim ve-khamesh"), "J'ai vingt-cinq ans")),
            fill(L("הוא בן ארבעים וחמש", "Hu ben arba'im ve-khamesh", "Il a quarante-cinq ans"), "ארבעים", "arba'im"),
            free(L(g("בן כמה אתה?", "בת כמה את?"), g("Ben kama ata?", "Bat kama at?"), "Tu as quel âge ?"), L(g("אני בן שלושים", "אני בת שלושים"), g("Ani ben shloshim", "Ani bat shloshim"), "J'ai trente ans")),
          ], "un médecin qui remplit ta fiche", "Donner ton âge et celui de ta famille", L(g("בן כמה אתה?", "בת כמה את?"), g("Ben kama ata?", "Bat kama at?"), "Tu as quel âge ?")),
          day("u12d3", "Les jours de la semaine", L("היום יום שלישי", "Ha-yom yom shlishi", "Aujourd'hui, c'est mardi"), [
            intro("La semaine commence le dimanche : yom rishon (premier jour), yom sheni, yom shlishi, yom revi'i, yom khamishi, yom shishi, puis shabat, le samedi."),
            rep(L("היום יום שלישי", "Ha-yom yom shlishi", "Aujourd'hui, c'est mardi")),
            rep(L("מחר יום רביעי", "Makhar yom revi'i", "Demain, c'est mercredi")),
            rep(L(g("ביום ראשון אני עובד", "ביום ראשון אני עובדת"), g("Be-yom rishon ani oved", "Be-yom rishon ani ovedet"), "Le dimanche, je travaille")),
            rep(L(g("אני לא עובד בשבת", "אני לא עובדת בשבת"), g("Ani lo oved ba-shabat", "Ani lo ovedet ba-shabat"), "Je ne travaille pas le samedi")),
            rep(L(g("אני פנוי ביום חמישי", "אני פנויה ביום חמישי"), g("Ani panui be-yom khamishi", "Ani pnuya be-yom khamishi"), "Je suis libre jeudi")),
            listen(L("מחר יום שישי", "Makhar yom shishi", "Demain, c'est vendredi"), "Quel jour est demain ?", "Vendredi", "Jeudi", "Dimanche", "Samedi"),
            swap("Dis demain mercredi au lieu d'aujourd'hui mardi.", L("היום יום שלישי", "Ha-yom yom shlishi", "Aujourd'hui, c'est mardi"), L("מחר יום רביעי", "Makhar yom revi'i", "Demain, c'est mercredi")),
            fill(L("מחר יום רביעי", "Makhar yom revi'i", "Demain, c'est mercredi"), "רביעי", "revi'i"),
            ask(L("איזה יום היום?", "Eize yom ha-yom?", "On est quel jour ?"), L("היום יום שלישי", "Ha-yom yom shlishi", "On est mardi")),
          ], "un ami qui cherche un jour pour se voir", "Dire quel jour tu es libre", L(g("מתי אתה פנוי השבוע?", "מתי את פנויה השבוע?"), g("Matai ata panui ha-shavua?", "Matai at pnuya ha-shavua?"), "Quand es-tu libre cette semaine ?")),
          day("u12d4", "Le numéro de téléphone", L("מה המספר שלך?", g("Ma ha-mispar shelkha?", "Ma ha-mispar shelakh?"), "C'est quoi ton numéro ?"), [
            intro("Pour donner un numéro, on dit les chiffres un par un avec la forme féminine : efes (zéro), akhat, shtayim, shalosh… Pour proposer de rester en contact : « titkasher elai » (appelle-moi) ou un message sur WhatsApp."),
            rep(L(g("מה המספר שלך?", "מה המספר שלך?"), g("Ma ha-mispar shelkha?", "Ma ha-mispar shelakh?"), "C'est quoi ton numéro ?")),
            rep(L("המספר שלי אפס חמש אפס", "Ha-mispar sheli efes khamesh efes", "Mon numéro, c'est zéro cinq zéro")),
            rep(L(g("אפשר את המספר שלך?", "אפשר את המספר שלך?"), g("Efshar et ha-mispar shelkha?", "Efshar et ha-mispar shelakh?"), "Je peux avoir ton numéro ?")),
            rep(L(g("תתקשר אליי", "תתקשרי אליי"), g("Titkasher elai", "Titkashri elai"), "Appelle-moi")),
            listen(L("המספר שלי אפס חמש אפס", "Ha-mispar sheli efes khamesh efes", "Mon numéro, c'est zéro cinq zéro"), "Quels sont les premiers chiffres ?", "Zéro, cinq, zéro", "Zéro, quatre, zéro", "Cinq, zéro, cinq", "Zéro, cinq, cinq"),
            swap("Demande le numéro au lieu de l'adresse.", L("מה הכתובת שלך?", g("Ma ha-ktovet shelkha?", "Ma ha-ktovet shelakh?"), "C'est quoi ton adresse ?"), L("מה המספר שלך?", g("Ma ha-mispar shelkha?", "Ma ha-mispar shelakh?"), "C'est quoi ton numéro ?")),
            fill(L("המספר שלי אפס חמש אפס", "Ha-mispar sheli efes khamesh efes", "Mon numéro, c'est zéro cinq zéro"), "חמש", "khamesh"),
            free(L(g("מה המספר שלך?", "מה המספר שלך?"), g("Ma ha-mispar shelkha?", "Ma ha-mispar shelakh?"), "C'est quoi ton numéro ?"), L("המספר שלי אפס חמש אפס, שתיים שלוש ארבע", "Ha-mispar sheli efes khamesh efes, shtayim shalosh arba", "Mon numéro, c'est zéro cinq zéro, deux trois quatre")),
          ], "une nouvelle connaissance qui veut rester en contact", "Échanger vos numéros", L(g("היה כיף! אפשר את המספר שלך?", "היה כיף! אפשר את המספר שלך?"), g("Haya kef! Efshar et ha-mispar shelkha?", "Haya kef! Efshar et ha-mispar shelakh?"), "C'était sympa ! Je peux avoir ton numéro ?")),
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
      {
        id: "u16", title: "Il, elle, nous : les verbes essentiels",
        days: [
          verbDay("u16d1", "Écrire et lire (il, elle, nous)", "Jusqu'ici tu parlais de toi. Pour parler des autres, il te faut : hu (il), hi (elle), anakhnu (nous), hem (ils). Au présent, le verbe ne change que selon le genre : kotev pour lui, kotevet pour elle. Au passé, la fin du verbe donne la personne : -ti pour moi (katavti), rien pour lui (katav), -a pour elle (katva). Au futur, nous commence par un « n » : nikhtov.", [{ obj: ["הודעה", "hoda'a"], presM: ["כותב", "kotev"], presF: ["כותבת", "kotevet"], past1: ["כתבתי", "Katavti"], past3m: ["כתב", "katav"], past3f: ["כתבה", "katva"], fut1p: ["נכתוב", "nikhtov"], fr: ["J'écris un message", "Il écrit un message", "Elle a écrit un message", "J'ai écrit un message", "Il a écrit un message", "Nous écrirons un message"] }, { obj: ["ספר", "sefer"], presM: ["קורא", "kore"], presF: ["קוראת", "kor'et"], past1: ["קראתי", "Karati"], past3m: ["קרא", "kara"], past3f: ["קראה", "kar'a"], fut1p: ["נקרא", "nikra"], fr: ["Je lis un livre", "Il lit un livre", "Elle a lu un livre", "J'ai lu un livre", "Il a lu un livre", "Nous lirons un livre"] }], L("הוא כותב, היא כותבת", "Hu kotev, hi kotevet", "Il écrit, elle écrit")),
          verbDay("u16d2", "Entendre et regarder", "Deux autres verbes avec la même méthode. Retiens les trois formes du passé : -ti (moi), rien (lui), -a (elle). Écoute bien la différence entre « il » et « elle ».", [{ obj: ["מוזיקה", "muzika"], presM: ["שומע", "shome'a"], presF: ["שומעת", "shoma'at"], past1: ["שמעתי", "Shamati"], past3m: ["שמע", "shama"], past3f: ["שמעה", "shim'a"], fut1p: ["נשמע", "nishma"], fr: ["J'écoute de la musique", "Il écoute de la musique", "Elle a écouté de la musique", "J'ai écouté de la musique", "Il a écouté de la musique", "Nous écouterons de la musique"] }, { obj: ["סרט", "seret"], presM: ["רואה", "ro'e"], presF: ["רואה", "ro'a"], past1: ["ראיתי", "Ra'iti"], past3m: ["ראה", "ra'a"], past3f: ["ראתה", "ra'ata"], fut1p: ["נראה", "nir'e"], fr: ["Je regarde un film", "Il regarde un film", "Elle a regardé un film", "J'ai regardé un film", "Il a regardé un film", "Nous regarderons un film"] }], L("הוא קורא, היא קוראת", "Hu kore, hi kor'et", "Il lit, elle lit")),
          verbDay("u16d3", "Prendre et rentrer", "Encore deux verbes très utiles pour raconter ce qui s'est passé. Au passé, « il » est la forme de base ; « elle » ajoute un « a » à la fin ; « moi » ajoute « ti ».", [{ obj: ["מונית", "monit"], presM: ["לוקח", "loke'akh"], presF: ["לוקחת", "lokakhat"], past1: ["לקחתי", "Lakakhti"], past3m: ["לקח", "lakakh"], past3f: ["לקחה", "lakekha"], fut1p: ["נקח", "nikakh"], fr: ["Je prends un taxi", "Il prend un taxi", "Elle a pris un taxi", "J'ai pris un taxi", "Il a pris un taxi", "Nous prendrons un taxi"] }, { obj: ["הביתה", "ha-baita"], presM: ["בא", "ba"], presF: ["באה", "ba'a"], past1: ["באתי", "Bati"], past3m: ["בא", "ba"], past3f: ["באה", "ba'a"], fut1p: ["נבוא", "navo"], fr: ["Je rentre à la maison", "Il rentre à la maison", "Elle est rentrée à la maison", "Je suis rentré(e) à la maison", "Il est rentré à la maison", "Nous rentrerons à la maison"] }], L("הוא לקח, היא לקחה", "Hu lakakh, hi lakekha", "Il a pris, elle a pris")),
          verbDay("u16d4", "Aller et faire", "Deux verbes de déplacement. « Halakh » veut dire aller à pied, « ba » veut dire venir ou rentrer. Pour « nous », le futur prend un « n » devant : nelekh, navo.", [{ obj: ["לים", "la-yam"], presM: ["הולך", "holekh"], presF: ["הולכת", "holekhet"], past1: ["הלכתי", "Halakhti"], past3m: ["הלך", "halakh"], past3f: ["הלכה", "halkha"], fut1p: ["נלך", "nelekh"], fr: ["Je vais à la plage", "Il va à la plage", "Elle est allée à la plage", "Je suis allé(e) à la plage", "Il est allé à la plage", "Nous irons à la plage"] }, { obj: ["ארוחה", "arukha"], presM: ["עושה", "ose"], presF: ["עושה", "osa"], past1: ["עשיתי", "Asiti"], past3m: ["עשה", "asa"], past3f: ["עשתה", "asta"], fut1p: ["נעשה", "na'ase"], fr: ["Je prépare un repas", "Il prépare un repas", "Elle a préparé un repas", "J'ai préparé un repas", "Il a préparé un repas", "Nous préparerons un repas"] }], L("הוא הלך, היא הלכה", "Hu halakh, hi halkha", "Il est allé, elle est allée")),
          verbDay("u16d5", "Manger et parler", "Deux verbes du quotidien : faire et manger. Comme toujours : -ti pour moi, rien pour lui, -a pour elle.", [{ obj: ["פלאפל", "falafel"], presM: ["אוכל", "okhel"], presF: ["אוכלת", "okhelet"], past1: ["אכלתי", "Akhalti"], past3m: ["אכל", "akhal"], past3f: ["אכלה", "akhla"], fut1p: ["נאכל", "nokhal"], fr: ["Je mange un falafel", "Il mange un falafel", "Elle a mangé un falafel", "J'ai mangé un falafel", "Il a mangé un falafel", "Nous mangerons un falafel"] }, { obj: ["עברית", "ivrit"], presM: ["מדבר", "medaber"], presF: ["מדברת", "medaberet"], past1: ["דיברתי", "Dibarti"], past3m: ["דיבר", "diber"], past3f: ["דיברה", "dibra"], fut1p: ["נדבר", "nedaber"], fr: ["Je parle hébreu", "Il parle hébreu", "Elle a parlé hébreu", "J'ai parlé hébreu", "Il a parlé hébreu", "Nous parlerons hébreu"] }], L("הוא אכל, היא אכלה", "Hu akhal, hi akhla", "Il a mangé, elle a mangé")),
          verbDay("u16d6", "Étudier et travailler", "Pour finir, trois verbes pour parler de toi et des autres : parler, étudier, travailler. Bravo, tu sais maintenant parler de toi, de lui, d'elle et de nous.", [{ obj: ["מתמטיקה", "matematika"], presM: ["לומד", "lomed"], presF: ["לומדת", "lomedet"], past1: ["למדתי", "Lamadti"], past3m: ["למד", "lamad"], past3f: ["למדה", "lamda"], fut1p: ["נלמד", "nilmad"], fr: ["J'étudie les maths", "Il étudie les maths", "Elle a étudié les maths", "J'ai étudié les maths", "Il a étudié les maths", "Nous étudierons les maths"] }, { obj: ["במשרד", "ba-misrad"], presM: ["עובד", "oved"], presF: ["עובדת", "ovedet"], past1: ["עבדתי", "Avadti"], past3m: ["עבד", "avad"], past3f: ["עבדה", "avda"], fut1p: ["נעבוד", "na'avod"], fr: ["Je travaille au bureau", "Il travaille au bureau", "Elle a travaillé au bureau", "J'ai travaillé au bureau", "Il a travaillé au bureau", "Nous travaillerons au bureau"] }], L("הוא עבד, היא עבדה", "Hu avad, hi avda", "Il a travaillé, elle a travaillé")),
        ],
      },
      {
        id: "u17", title: "Chiffres, heure et dates",
        days: [
          day("u17d1", "Les centaines et les milliers", L("שכר הדירה הוא ארבעת אלפים שקל", "Skhar ha-dira hu arba'at alafim shekel", "Le loyer est de quatre mille shekels"), [
            intro("Les grands nombres : me'a (100), matayim (200), shalosh me'ot (300), elef (1000), alpayim (2000). Entre 11 et 19, on dit akhat esre (11), shtem esre (12), shalosh esre (13), arba esre (14)."),
            rep(L("מאה ועשרים שקל", "Me'a ve-esrim shekel", "Cent vingt shekels")),
            rep(L("מאתיים שקל", "Matayim shekel", "Deux cents shekels")),
            rep(L("שלוש מאות שקל", "Shalosh me'ot shekel", "Trois cents shekels")),
            rep(L("אלף שקל", "Elef shekel", "Mille shekels")),
            rep(L("שכר הדירה הוא ארבעת אלפים שקל", "Skhar ha-dira hu arba'at alafim shekel", "Le loyer est de quatre mille shekels")),
            rep(L(g("אני בן ארבע עשרה", "אני בת ארבע עשרה"), g("Ani ben arba esre", "Ani bat arba esre"), "J'ai quatorze ans")),
            listen(L("שלוש מאות שקל", "Shalosh me'ot shekel", "Trois cents shekels"), "Combien ça coûte ?", "Trois cents shekels", "Treize shekels", "Trente shekels", "Trois mille shekels"),
            listen(L("שכר הדירה הוא ארבעת אלפים שקל", "Skhar ha-dira hu arba'at alafim shekel", "Le loyer est de quatre mille shekels"), "Quel est le loyer ?", "Quatre mille shekels", "Quatorze cents shekels", "Quarante shekels", "Quatre cents shekels"),
            swap("Dis deux cents shekels au lieu de trois cents.", L("שלוש מאות שקל", "Shalosh me'ot shekel", "Trois cents shekels"), L("מאתיים שקל", "Matayim shekel", "Deux cents shekels")),
            fill(L("אלף שקל", "Elef shekel", "Mille shekels"), "אלף", "elef"),
            ask(L("כמה עולה שכר הדירה?", "Kama ole skhar ha-dira?", "Combien coûte le loyer ?"), L("ארבעת אלפים שקל לחודש", "Arba'at alafim shekel la-khodesh", "Quatre mille shekels par mois")),
          ], "un propriétaire qui présente son appartement", "Demander et comprendre un loyer", L("הדירה יפה, ושכר הדירה הוא שלושת אלפים וחמש מאות שקל.", "Ha-dira yafa, ve-skhar ha-dira hu shloshet alafim ve-khamesh me'ot shekel.", "L'appartement est beau, et le loyer est de trois mille cinq cents shekels.")),
          day("u17d2", "L'heure précise", L("השעה שמונה וחמש", "Ha-sha'a shmone ve-khamesh", "Il est huit heures cinq"), [
            intro("Pour l'heure exacte, on dit l'heure puis « et » plus les minutes : shmone ve-khamesh, 8 h 05. Pour les dernières minutes avant l'heure, on dit « le- » : esrim le-tesha, neuf heures moins vingt. « Reva » veut dire un quart."),
            rep(L("השעה שמונה וחמש", "Ha-sha'a shmone ve-khamesh", "Il est huit heures cinq")),
            rep(L("שתיים ורבע", "Shtayim va-reva", "Deux heures et quart")),
            rep(L("שתיים וחצי", "Shtayim va-khetsi", "Deux heures et demie")),
            rep(L("רבע לשלוש", "Reva le-shalosh", "Trois heures moins le quart")),
            rep(L("עשרים לתשע", "Esrim le-tesha", "Neuf heures moins vingt")),
            rep(L("הרכבת יוצאת בשמונה ועשרים", "Ha-rakevet yotset be-shmone ve-esrim", "Le train part à huit heures vingt")),
            rep(L(g("אני מאחר בעשר דקות", "אני מאחרת בעשר דקות"), g("Ani me'akher be-eser dakot", "Ani me'akheret be-eser dakot"), "J'ai dix minutes de retard")),
            listen(L("הרכבת יוצאת בשמונה ועשרים", "Ha-rakevet yotset be-shmone ve-esrim", "Le train part à huit heures vingt"), "À quelle heure part le train ?", "8 h 20", "8 h 02", "7 h 20", "9 h 20"),
            listen(L("רבע לשלוש", "Reva le-shalosh", "Trois heures moins le quart"), "Quelle heure est-il ?", "2 h 45", "3 h 15", "3 h 45", "2 h 15"),
            swap("Dis huit heures vingt au lieu de huit heures cinq.", L("השעה שמונה וחמש", "Ha-sha'a shmone ve-khamesh", "Il est huit heures cinq"), L("השעה שמונה ועשרים", "Ha-sha'a shmone ve-esrim", "Il est huit heures vingt")),
            fill(L("שתיים וחצי", "Shtayim va-khetsi", "Deux heures et demie"), "וחצי", "va-khetsi"),
            ask(L("באיזו שעה יוצאת הרכבת?", "Be-eizo sha'a yotset ha-rakevet?", "À quelle heure part le train ?"), L("בשמונה ועשרים", "Be-shmone ve-esrim", "À huit heures vingt")),
          ], "un employé de la gare", "Demander et comprendre un horaire précis", L("שלום, הרכבת לתל אביב יוצאת בשמונה ועשרים.", "Shalom, ha-rakevet le-Tel Aviv yotset be-shmone ve-esrim.", "Bonjour, le train pour Tel-Aviv part à huit heures vingt.")),
          day("u17d3", "Les mois et les dates", L("יום ההולדת שלי בחמישה במאי", "Yom ha-huledet sheli be-khamisha be-mai", "Mon anniversaire est le cinq mai"), [
            intro("Les mois ressemblent aux mois français : yanuar, febuar, merts, april, mai, yuni, yuli, ogust, september, oktober, november, detsember. Pour une date, on dit le chiffre puis le mois : khamisha be-mai, le cinq mai."),
            rep(L("יום ההולדת שלי בחמישה במאי", "Yom ha-huledet sheli be-khamisha be-mai", "Mon anniversaire est le cinq mai")),
            rep(L("היום עשרה באוקטובר", "Ha-yom asara be-oktober", "Aujourd'hui, c'est le dix octobre")),
            rep(L("באיזה תאריך?", "Be-eize ta'arikh?", "À quelle date ?")),
            rep(L("בחודש הבא", "Ba-khodesh ha-ba", "Le mois prochain")),
            rep(L("בשנה שעברה", "Ba-shana she-avra", "L'année dernière")),
            listen(L("בחודש הבא", "Ba-khodesh ha-ba", "Le mois prochain"), "Quand ?", "Le mois prochain", "Le mois dernier", "L'année prochaine", "La semaine prochaine"),
            listen(L("היום עשרה באוקטובר", "Ha-yom asara be-oktober", "Aujourd'hui, c'est le dix octobre"), "Quelle date ?", "Le 10 octobre", "Le 10 novembre", "Le 20 octobre", "Le 1er octobre"),
            swap("Dis novembre au lieu d'octobre.", L("היום עשרה באוקטובר", "Ha-yom asara be-oktober", "Aujourd'hui, c'est le dix octobre"), L("היום עשרה בנובמבר", "Ha-yom asara be-november", "Aujourd'hui, c'est le dix novembre")),
            fill(L("בחודש הבא", "Ba-khodesh ha-ba", "Le mois prochain"), "הבא", "ha-ba"),
            ask(L("מתי יום ההולדת שלך?", g("Matai yom ha-huledet shelkha?", "Matai yom ha-huledet shelakh?"), "C'est quand ton anniversaire ?"), L("יום ההולדת שלי בחמישה במאי", "Yom ha-huledet sheli be-khamisha be-mai", "Mon anniversaire est le cinq mai")),
            free(L("באיזה תאריך נולדת?", g("Be-eize ta'arikh noladta?", "Be-eize ta'arikh noladt?"), "Tu es né(e) quel jour ?"), L("נולדתי בחמישה במאי", "Noladti be-khamisha be-mai", "Je suis né(e) le cinq mai")),
          ], "un collègue qui organise une fête", "Dire et comprendre des dates", L("מתי יום ההולדת שלך? אנחנו רוצים להפתיע אותך.", g("Matai yom ha-huledet shelkha? Anakhnu rotsim lehaftia otkha.", "Matai yom ha-huledet shelakh? Anakhnu rotsim lehaftia otakh."), "C'est quand ton anniversaire ? On veut te faire une surprise.")),
        ],
      },
      {
        id: "u18", title: "Services du quotidien",
        days: [
          day("u18d1", "À la pharmacie", L("יש לכם משהו נגד כאב ראש?", "Yesh lakhem mashehu neged ke'ev rosh?", "Vous avez quelque chose contre le mal de tête ?"), [
            intro("À la pharmacie (beit merkakhat), on dit ce qu'on a avec « neged » (contre) : neged ke'ev rosh, contre le mal de tête. Pour savoir comment prendre le médicament : « kama pe'amim ba-yom ? »."),
            rep(L("יש לכם משהו נגד כאב ראש?", "Yesh lakhem mashehu neged ke'ev rosh?", "Vous avez quelque chose contre le mal de tête ?")),
            rep(L(g("אני צריך תרופה נגד שיעול", "אני צריכה תרופה נגד שיעול"), g("Ani tsarikh trufa neged shi'ul", "Ani tsrikha trufa neged shi'ul"), "Il me faut un médicament contre la toux")),
            rep(L("כמה פעמים ביום?", "Kama pe'amim ba-yom?", "Combien de fois par jour ?")),
            rep(L("יש לי מרשם מהרופא", "Yesh li mirsham me-ha-rofe", "J'ai une ordonnance du médecin")),
            listen(L("פעמיים ביום", "Pa'ayim ba-yom", "Deux fois par jour"), "Que dit le pharmacien ?", "Deux fois par jour", "Une fois par jour", "Trois fois par jour", "Deux fois par semaine"),
            swap("Demande quelque chose contre le mal de gorge.", L("יש לכם משהו נגד כאב ראש?", "Yesh lakhem mashehu neged ke'ev rosh?", "Vous avez quelque chose contre le mal de tête ?"), L("יש לכם משהו נגד כאב גרון?", "Yesh lakhem mashehu neged ke'ev garon?", "Vous avez quelque chose contre le mal de gorge ?")),
            fill(L("יש לי מרשם מהרופא", "Yesh li mirsham me-ha-rofe", "J'ai une ordonnance du médecin"), "מרשם", "mirsham"),
            ask(L("במה אפשר לעזור?", "Ba-ma efshar la'azor?", "En quoi puis-je vous aider ?"), L(g("אני צריך תרופה נגד שיעול", "אני צריכה תרופה נגד שיעול"), g("Ani tsarikh trufa neged shi'ul", "Ani tsrikha trufa neged shi'ul"), "Il me faut un médicament contre la toux")),
          ], "un pharmacien", "Demander un médicament et comprendre comment le prendre", L("שלום, במה אפשר לעזור?", "Shalom, ba-ma efshar la'azor?", "Bonjour, en quoi puis-je vous aider ?")),
          day("u18d2", "À la poste", L(g("אני רוצה לשלוח חבילה לצרפת", "אני רוצה לשלוח חבילה לצרפת"), g("Ani rotse lishlo'akh khavila le-Tsarfat", "Ani rotsa lishlo'akh khavila le-Tsarfat"), "Je voudrais envoyer un colis en France"), [
            intro("À la poste (do'ar), on envoie avec « lishlo'akh » : une lettre (maktav) ou un colis (khavila). Pour récupérer un colis, on dit « ani osef » : je récupère."),
            rep(L(g("אני רוצה לשלוח חבילה לצרפת", "אני רוצה לשלוח חבילה לצרפת"), g("Ani rotse lishlo'akh khavila le-Tsarfat", "Ani rotsa lishlo'akh khavila le-Tsarfat"), "Je voudrais envoyer un colis en France")),
            rep(L("כמה זה עולה לשלוח מכתב?", "Kama ze ole lishlo'akh maktav?", "Combien ça coûte d'envoyer une lettre ?")),
            rep(L("כמה זמן זה לוקח?", "Kama zman ze loke'akh?", "Combien de temps ça prend ?")),
            rep(L("אפשר לקבל טופס?", "Efshar lekabel tofes?", "Je peux avoir un formulaire ?")),
            rep(L(g("אני אוסף חבילה", "אני אוספת חבילה"), g("Ani osef khavila", "Ani osefet khavila"), "Je viens récupérer un colis")),
            listen(L("כמה זמן זה לוקח?", "Kama zman ze loke'akh?", "Combien de temps ça prend ?"), "Que demande le client ?", "La durée de l'envoi", "Le prix de l'envoi", "L'adresse", "Le poids"),
            swap("Parle d'une lettre au lieu d'un colis.", L("חבילה לצרפת", "Khavila le-Tsarfat", "Un colis pour la France"), L("מכתב לצרפת", "Maktav le-Tsarfat", "Une lettre pour la France")),
            fill(L("אפשר לקבל טופס?", "Efshar lekabel tofes?", "Je peux avoir un formulaire ?"), "טופס", "tofes"),
            ask(L("לאן שולחים?", "Le'an shoalkhim?", "Vous l'envoyez où ?"), L("לצרפת, בבקשה", "Le-Tsarfat, bevakasha", "En France, s'il vous plaît")),
          ], "un employé de la poste", "Envoyer un colis et demander le prix et le délai", L("שלום, מה אפשר לעשות בשבילך?", "Shalom, ma efshar la'asot bishvilkha?", "Bonjour, que puis-je faire pour vous ?")),
          day("u18d3", "En cas d'urgence", L("תקראו לאמבולנס!", "Tikre'u la-ambulans!", "Appelez une ambulance !"), [
            intro("En urgence, trois numéros à retenir : 100 pour la police (mishtara), 101 pour l'ambulance, 102 pour les pompiers. On dit : me'a, me'a ve-ekhad, me'a ve-shtayim. Sois bref : « ze dakhuf » veut dire c'est urgent."),
            rep(L("תקראו לאמבולנס!", "Tikre'u la-ambulans!", "Appelez une ambulance !")),
            rep(L("זה דחוף", "Ze dakhuf", "C'est urgent")),
            rep(L("יש תאונה", "Yesh te'una", "Il y a un accident")),
            rep(L("מישהו נפצע", "Mishehu nifts'a", "Quelqu'un est blessé")),
            rep(L("איפה בית החולים?", "Eifo beit ha-kholim?", "Où est l'hôpital ?")),
            rep(L("מאה, משטרה. מאה ואחד, אמבולנס. מאה ושתיים, כבאים", "Me'a, mishtara. Me'a ve-ekhad, ambulans. Me'a ve-shtayim, kabaim", "100, police. 101, ambulance. 102, pompiers")),
            listen(L("יש תאונה", "Yesh te'una", "Il y a un accident"), "Que dit cette personne ?", "Il y a un accident", "Il y a un incendie", "Il y a du monde", "Il y a un problème de bus"),
            swap("Dis que c'est urgent au lieu de signaler un accident.", L("יש תאונה", "Yesh te'una", "Il y a un accident"), L("זה דחוף", "Ze dakhuf", "C'est urgent")),
            fill(L("תקראו לאמבולנס!", "Tikre'u la-ambulans!", "Appelez une ambulance !"), "לאמבולנס", "la-ambulans"),
            ask(L("מה קרה?", "Ma kara?", "Qu'est-ce qui s'est passé ?"), L("יש תאונה, תקראו לאמבולנס", "Yesh te'una, tikre'u la-ambulans", "Il y a un accident, appelez une ambulance")),
          ], "un opérateur du numéro d'urgence", "Signaler un accident et demander de l'aide", L("חירום, מה קרה?", "Khirum, ma kara?", "Urgences, que s'est-il passé ?")),
          day("u18d4", "Téléphone et applications", L(g("אני צריך כרטיס סים", "אני צריכה כרטיס סים"), g("Ani tsarikh kartis sim", "Ani tsrikha kartis sim"), "Il me faut une carte SIM"), [
            intro("Pour le téléphone : « kartis sim » (carte SIM), « khavilat glisha » (forfait internet), « klita » (réseau). Pour les applications : « aplikatsia ». On commande un taxi dans l'appli, et on paie le bus avec la carte « Rav-Kav »."),
            rep(L(g("אני צריך כרטיס סים", "אני צריכה כרטיס סים"), g("Ani tsarikh kartis sim", "Ani tsrikha kartis sim"), "Il me faut une carte SIM")),
            rep(L("כמה עולה חבילת גלישה?", "Kama ole khavilat glisha?", "Combien coûte un forfait internet ?")),
            rep(L("אין לי קליטה", "Ein li klita", "Je n'ai pas de réseau")),
            rep(L("הסוללה נגמרת", "Ha-solela nigmeret", "La batterie est presque vide")),
            rep(L(g("אני מזמין מונית באפליקציה", "אני מזמינה מונית באפליקציה"), g("Ani mazmin monit ba-aplikatsia", "Ani mazmina monit ba-aplikatsia"), "Je commande un taxi dans l'appli")),
            rep(L("אפשר לשלם עם רב קו?", "Efshar leshalem im Rav-Kav?", "Je peux payer avec la carte Rav-Kav ?")),
            listen(L("אין לי קליטה", "Ein li klita", "Je n'ai pas de réseau"), "Quel est le problème ?", "Pas de réseau", "Plus de batterie", "Trop cher", "Mauvais numéro"),
            swap("Dis que la batterie est presque vide, pas le réseau.", L("אין לי קליטה", "Ein li klita", "Je n'ai pas de réseau"), L("הסוללה נגמרת", "Ha-solela nigmeret", "La batterie est presque vide")),
            fill(L("כמה עולה חבילת גלישה?", "Kama ole khavilat glisha?", "Combien coûte un forfait internet ?"), "גלישה", "glisha"),
            ask(L("במה אפשר לעזור?", "Ba-ma efshar la'azor?", "En quoi puis-je vous aider ?"), L(g("אני צריך כרטיס סים", "אני צריכה כרטיס סים"), g("Ani tsarikh kartis sim", "Ani tsrikha kartis sim"), "Il me faut une carte SIM")),
          ], "un vendeur dans une boutique de téléphonie", "Acheter une carte SIM et un forfait", L("שלום, מה אפשר להציע לך?", "Shalom, ma efshar lehatsi'a lekha?", "Bonjour, que puis-je vous proposer ?")),
          day("u18d5", "À la banque", L(g("אני רוצה לפתוח חשבון", "אני רוצה לפתוח חשבון"), g("Ani rotse lifto'akh kheshbon", "Ani rotsa lifto'akh kheshbon"), "Je voudrais ouvrir un compte"), [
            intro("À la banque : « kheshbon » (compte), « kaspomat » (distributeur), « lehakhlif kesef » (changer de l'argent). Si ta carte reste dans le distributeur, dis « ha-kartis nivla »."),
            rep(L(g("אני רוצה לפתוח חשבון", "אני רוצה לפתוח חשבון"), g("Ani rotse lifto'akh kheshbon", "Ani rotsa lifto'akh kheshbon"), "Je voudrais ouvrir un compte")),
            rep(L("איפה הכספומט?", "Eifo ha-kaspomat?", "Où est le distributeur ?")),
            rep(L("הכרטיס נבלע בכספומט", "Ha-kartis nivla ba-kaspomat", "Le distributeur a avalé ma carte")),
            rep(L(g("אני רוצה להחליף כסף", "אני רוצה להחליף כסף"), g("Ani rotse lehakhlif kesef", "Ani rotsa lehakhlif kesef"), "Je voudrais changer de l'argent")),
            rep(L("מה שער הדולר?", "Ma sa'ar ha-dolar?", "Quel est le taux du dollar ?")),
            rep(L("אפשר להעביר כסף?", "Efshar leha'avir kesef?", "Je peux faire un virement ?")),
            listen(L("הכרטיס נבלע בכספומט", "Ha-kartis nivla ba-kaspomat", "Le distributeur a avalé ma carte"), "Quel est le problème ?", "La carte est avalée", "La carte est perdue", "Le distributeur est vide", "Le code est faux"),
            swap("Demande le distributeur au lieu de changer de l'argent.", L(g("אני רוצה להחליף כסף", "אני רוצה להחליף כסף"), g("Ani rotse lehakhlif kesef", "Ani rotsa lehakhlif kesef"), "Je voudrais changer de l'argent"), L("איפה הכספומט?", "Eifo ha-kaspomat?", "Où est le distributeur ?")),
            fill(L("אפשר להעביר כסף?", "Efshar leha'avir kesef?", "Je peux faire un virement ?"), "להעביר", "leha'avir"),
            ask(L("מה אפשר לעשות בשבילך?", "Ma efshar la'asot bishvilkha?", "Que puis-je faire pour vous ?"), L(g("אני רוצה לפתוח חשבון", "אני רוצה לפתוח חשבון"), g("Ani rotse lifto'akh kheshbon", "Ani rotsa lifto'akh kheshbon"), "Je voudrais ouvrir un compte")),
          ], "un employé de banque", "Ouvrir un compte et résoudre un problème avec ta carte", L("שלום, במה אפשר לעזור?", "Shalom, ba-ma efshar la'azor?", "Bonjour, en quoi puis-je vous aider ?")),
          day("u18d6", "Administration et santé", L(g("אני צריך תור לרופא משפחה", "אני צריכה תור לרופא משפחה"), g("Ani tsarikh tor le-rofe mishpakha", "Ani tsrikha tor le-rofe mishpakha"), "Il me faut un rendez-vous chez le médecin de famille"), [
            intro("En Israël, chacun est inscrit à une caisse de santé (kupat kholim). Pour un rendez-vous : « tor le-rofe mishpakha ». Pour les impôts locaux : « arnona ». On demande les horaires avec « ad matai patu'akh ? »."),
            rep(L(g("אני צריך תור לרופא משפחה", "אני צריכה תור לרופא משפחה"), g("Ani tsarikh tor le-rofe mishpakha", "Ani tsrikha tor le-rofe mishpakha"), "Il me faut un rendez-vous chez le médecin de famille")),
            rep(L("יש לי ביטוח", "Yesh li bituakh", "J'ai une assurance")),
            rep(L(g("אני צריך אישור", "אני צריכה אישור"), g("Ani tsarikh ishur", "Ani tsrikha ishur"), "J'ai besoin d'une attestation")),
            rep(L(g("אני רוצה לשלם ארנונה", "אני רוצה לשלם ארנונה"), g("Ani rotse leshalem arnona", "Ani rotsa leshalem arnona"), "Je voudrais payer la taxe d'habitation")),
            rep(L("עד מתי פתוח?", "Ad matai patu'akh?", "Jusqu'à quand c'est ouvert ?")),
            listen(L("עד מתי פתוח?", "Ad matai patu'akh?", "Jusqu'à quand c'est ouvert ?"), "Que demande cette personne ?", "L'heure de fermeture", "L'heure d'ouverture", "Le prix", "L'adresse"),
            swap("Demande une attestation au lieu d'un rendez-vous.", L(g("אני צריך תור לרופא משפחה", "אני צריכה תור לרופא משפחה"), g("Ani tsarikh tor le-rofe mishpakha", "Ani tsrikha tor le-rofe mishpakha"), "Il me faut un rendez-vous chez le médecin de famille"), L(g("אני צריך אישור", "אני צריכה אישור"), g("Ani tsarikh ishur", "Ani tsrikha ishur"), "J'ai besoin d'une attestation")),
            fill(L("יש לי ביטוח", "Yesh li bituakh", "J'ai une assurance"), "ביטוח", "bituakh"),
            ask(L("במה אפשר לעזור?", "Ba-ma efshar la'azor?", "En quoi puis-je vous aider ?"), L(g("אני צריך תור לרופא משפחה", "אני צריכה תור לרופא משפחה"), g("Ani tsarikh tor le-rofe mishpakha", "Ani tsrikha tor le-rofe mishpakha"), "Il me faut un rendez-vous chez le médecin de famille")),
          ], "une secrétaire de caisse de santé", "Prendre un rendez-vous médical et demander un document", L("שלום, קופת חולים, במה אפשר לעזור?", "Shalom, kupat kholim, ba-ma efshar la'azor?", "Bonjour, caisse de santé, en quoi puis-je vous aider ?")),
        ],
      },
      {
        id: "u19", title: "Comprendre les Israéliens",
        days: [
          dialogDay("u19d1", "Au café, à vitesse normale", "Un Israélien parle vite et ne dit pas tout. Écoute le dialogue en entier, sans chercher chaque mot : repère seulement les mots que tu connais. Tu peux le réécouter autant de fois que tu veux avec le bouton.",
            L("שלום, מה אפשר להביא? אפשר קפה הפוך ועוגת גבינה. פה או לקחת? פה. תשבו איפה שנוח.", "Shalom, ma efshar lehavi? Efshar kafe hafukh ve-ugat gvina. Po o lakakhat? Po. Teshvu eifo she-no'akh.", "Bonjour, qu'est-ce que je vous apporte ? Un café au lait et un gâteau au fromage. Sur place ou à emporter ? Sur place. Asseyez-vous où vous voulez."),
            [["Que commande le client ?", "Un café au lait et un gâteau au fromage", "Un thé et un gâteau au chocolat", "Un café noir seulement", "Un jus et un sandwich"], ["Où va-t-il consommer ?", "Sur place", "À emporter", "Dans la rue", "À la maison"], ["Que dit le serveur à la fin ?", "Asseyez-vous où vous voulez", "Payez à la caisse", "Revenez demain", "La table est réservée"]],
            [L("פה או לקחת?", "Po o lakakhat?", "Sur place ou à emporter ?"), L("תשבו איפה שנוח", "Teshvu eifo she-no'akh", "Asseyez-vous où vous voulez")],
            L("מה אפשר להביא?", "Ma efshar lehavi?", "Qu'est-ce que je vous apporte ?"), L("קפה הפוך ועוגת גבינה, בבקשה", "Kafe hafukh ve-ugat gvina, bevakasha", "Un café au lait et un gâteau au fromage, s'il vous plaît"), "un serveur pressé", "Commander dans un café bondé"),
          dialogDay("u19d2", "Dans le taxi", "Les chauffeurs de taxi posent des questions courtes. Cherche d'abord la destination, puis le prix ou la durée.",
            L("לאן? לתחנה המרכזית. אתה רוצה מונה? כן, בבקשה. זה ייקח בערך עשרים דקות.", "Le'an? La-takhana ha-merkazit. Ata rotse mone? Ken, bevakasha. Ze yikakh be'erekh esrim dakot.", "Où allez-vous ? À la gare centrale. Vous voulez le compteur ? Oui, s'il vous plaît. Ça prendra environ vingt minutes."),
            [["Où va le client ?", "À la gare centrale", "À l'aéroport", "À l'hôtel", "À la plage"], ["Combien de temps le trajet va-t-il prendre ?", "Environ vingt minutes", "Environ deux minutes", "Environ une heure", "Environ trente minutes"], ["Qu'a demandé le chauffeur ?", "S'il veut le compteur", "S'il a une carte", "S'il veut de la musique", "S'il connaît la route"]],
            [L("אתה רוצה מונה?", "Ata rotse mone?", "Vous voulez le compteur ?"), L("זה ייקח בערך עשרים דקות", "Ze yikakh be'erekh esrim dakot", "Ça prendra environ vingt minutes")],
            L("לאן?", "Le'an?", "Où allez-vous ?"), L("לתחנה המרכזית, בבקשה", "La-takhana ha-merkazit, bevakasha", "À la gare centrale, s'il vous plaît"), "un chauffeur de taxi bavard", "Donner une destination et comprendre la durée"),
          dialogDay("u19d3", "Au marché", "Au marché, les vendeurs crient les prix. Écoute les chiffres et le total.",
            L("כמה עולים התפוזים? עשרה שקל לקילו. תן לי שני קילו. בבקשה, עשרים שקל.", "Kama olim ha-tapuzim? Asara shekel la-kilo. Ten li shnei kilo. Bevakasha, esrim shekel.", "Combien coûtent les oranges ? Dix shekels le kilo. Donnez-m'en deux kilos. Voilà, vingt shekels."),
            [["Quel fruit achète-t-on ?", "Des oranges", "Des pommes", "Des bananes", "Des raisins"], ["Combien coûte le kilo ?", "Dix shekels", "Vingt shekels", "Quinze shekels", "Cinq shekels"], ["Quel est le total à payer ?", "Vingt shekels", "Dix shekels", "Quarante shekels", "Deux shekels"]],
            [L("כמה עולים התפוזים?", "Kama olim ha-tapuzim?", "Combien coûtent les oranges ?"), L("תן לי שני קילו", "Ten li shnei kilo", "Donnez-m'en deux kilos")],
            L("מה אתה רוצה?", "Ma ata rotse?", "Qu'est-ce que vous voulez ?"), L("תן לי שני קילו תפוזים, בבקשה", "Ten li shnei kilo tapuzim, bevakasha", "Donnez-moi deux kilos d'oranges, s'il vous plaît"), "un vendeur d'oranges au marché", "Acheter des fruits au kilo et comprendre le total"),
          dialogDay("u19d4", "Au téléphone", "Au téléphone, il n'y a pas de visage pour t'aider. Repère le nom, l'heure, et le message à transmettre.",
            L("הלו, אפשר לדבר עם רונית? היא לא כאן, היא תחזור בארבע. רוצה להשאיר הודעה? כן, תגידי לה שדני התקשר.", "Halo, efshar ledaber im Ronit? Hi lo kan, hi takhzor be-arba. Rotse lehash'ir hoda'a? Ken, tagidi la she-Dani hitkasher.", "Allô, je peux parler à Ronit ? Elle n'est pas là, elle revient à quatre heures. Vous voulez laisser un message ? Oui, dites-lui que Dani a appelé."),
            [["Qui cherche-t-on au téléphone ?", "Ronit", "Dani", "Une collègue de Dani", "Un médecin"], ["À quelle heure revient-elle ?", "À quatre heures", "À trois heures", "À cinq heures", "Demain"], ["Quel message laisse-t-on ?", "Dani a appelé", "Ronit doit rappeler Dani demain", "Dani sera en retard", "Dani est malade"]],
            [L("היא לא כאן", "Hi lo kan", "Elle n'est pas là"), L("היא תחזור בארבע", "Hi takhzor be-arba", "Elle revient à quatre heures")],
            L("רוצה להשאיר הודעה?", g("Rotse lehash'ir hoda'a?", "Rotsa lehash'ir hoda'a?"), "Vous voulez laisser un message ?"), L("כן, תגידי לה שהתקשרתי", "Ken, tagidi la she-hitkasharti", "Oui, dites-lui que j'ai appelé"), "une collègue qui répond au téléphone", "Demander quelqu'un et laisser un message"),
          dialogDay("u19d5", "Chez le médecin", "Le médecin pose des questions rapides sur ce qui ne va pas. Écoute où, depuis quand, et ce qu'il décide.",
            L("מה כואב לך? הבטן כואבת לי מאתמול. יש לך חום? קצת. אני אתן לך מרשם.", "Ma ko'ev lekha? Ha-beten ko'evet li me-etmol. Yesh lekha khom? Ktsat. Ani eten lekha mirsham.", "Où avez-vous mal ? J'ai mal au ventre depuis hier. Vous avez de la fièvre ? Un peu. Je vais vous donner une ordonnance."),
            [["Où le patient a-t-il mal ?", "Au ventre", "À la tête", "À la gorge", "Au dos"], ["Depuis quand ?", "Depuis hier", "Depuis ce matin", "Depuis une semaine", "Depuis demain"], ["Que va faire le médecin ?", "Donner une ordonnance", "Faire une opération", "Renvoyer le patient", "Prendre un rendez-vous"]],
            [L("הבטן כואבת לי מאתמול", "Ha-beten ko'evet li me-etmol", "J'ai mal au ventre depuis hier"), L("יש לך חום?", "Yesh lekha khom?", "Vous avez de la fièvre ?")],
            L("מה כואב לך?", g("Ma ko'ev lekha?", "Ma ko'ev lakh?"), "Où avez-vous mal ?"), L("הבטן כואבת לי מאתמול", "Ha-beten ko'evet li me-etmol", "J'ai mal au ventre depuis hier"), "un médecin pressé", "Décrire ce qui ne va pas et comprendre le traitement"),
          dialogDay("u19d6", "Une invitation", "Entre amis, on parle vite et on coupe les phrases. Cherche l'heure et ce que chacun apporte.",
            L("מה אתה עושה בערב? אין לי תוכניות. בוא לארוחה אצלנו. באיזו שעה? בשבע. אני אביא יין.", "Ma ata ose ba-erev? Ein li tokhniyot. Bo le-arukha etslenu. Be-eizo sha'a? Be-sheva. Ani avi yayin.", "Tu fais quoi ce soir ? Je n'ai rien de prévu. Viens dîner chez nous. À quelle heure ? À sept heures. J'apporterai du vin."),
            [["Quelle est l'invitation ?", "Un dîner chez eux", "Un film au cinéma", "Une sortie à la plage", "Un déjeuner au restaurant"], ["À quelle heure ?", "À sept heures", "À huit heures", "À six heures", "À midi"], ["Qu'apporte l'invité ?", "Du vin", "Un gâteau", "Du pain", "Rien"]],
            [L("בוא לארוחה אצלנו", "Bo le-arukha etslenu", "Viens dîner chez nous"), L("אני אביא יין", "Ani avi yayin", "J'apporterai du vin")],
            L("מה אתה עושה בערב?", g("Ma ata ose ba-erev?", "Ma at osa ba-erev?"), "Tu fais quoi ce soir ?"), L("אין לי תוכניות", "Ein li tokhniyot", "Je n'ai rien de prévu"), "un ami qui t'invite", "Accepter une invitation et proposer d'apporter quelque chose"),
        ],
      },
      {
        id: "u20", title: "Lire dans la vraie vie",
        days: [
          readDay("u20d1", "Panneaux et affiches", "Dans la rue, les panneaux s'écrivent sans voyelles et en lettres simples. Voici ceux que tu croiseras tous les jours : l'entrée, la sortie, ouvert, fermé, pousser, tirer. Lis chaque mot, écoute-le et répète.",
            [L("כניסה", "knisa", "entrée"), L("יציאה", "yetsi'a", "sortie"), L("פתוח", "patu'akh", "ouvert"), L("סגור", "sagur", "fermé"), L("זהירות", "zehirut", "attention")],
            L("אסור לעשן", "Asur le'ashen", "Interdit de fumer"), ["אסור", "asur"],
            [{ say: L("כניסה", "knisa", "entrée"), bad: ["יציאה", "פתוח", "סגור"] }, { say: L("סגור", "sagur", "fermé"), bad: ["פתוח", "יציאה", "זהירות"] }, { say: L("זהירות", "zehirut", "attention"), bad: ["יציאה", "כניסה", "סגור"] }]),
          readDay("u20d2", "Lire un menu", "Un menu israélien est écrit sans voyelles. Les mots à connaître : mana rishona (entrée), mana ikarit (plat principal), kinuakh (dessert), shtiya (boisson). Lis, écoute et répète.",
            [L("מנה ראשונה", "mana rishona", "entrée"), L("מנה עיקרית", "mana ikarit", "plat principal"), L("קינוח", "kinuakh", "dessert"), L("שתייה", "shtiya", "boisson"), L("חומוס", "khumus", "houmous")],
            L("מנה עיקרית ושתייה", "Mana ikarit ve-shtiya", "Un plat principal et une boisson"), ["ושתייה", "ve-shtiya"],
            [{ say: L("קינוח", "kinuakh", "dessert"), bad: ["שתייה", "חומוס", "מנה עיקרית"] }, { say: L("שתייה", "shtiya", "boisson"), bad: ["קינוח", "חומוס", "מנה ראשונה"] }, { say: L("מנה עיקרית", "mana ikarit", "plat principal"), bad: ["מנה ראשונה", "קינוח", "שתייה"] }]),
          readDay("u20d3", "Messages et tickets", "Les messages de tous les jours sont courts et sans voyelles : « ani ba-derekh » (je suis en route), « matai ata magia ? » (tu arrives quand ?). Sur un ticket, cherche le prix et le total : « mekhir », « sakh ha-kol ».",
            [L("אני בדרך", "ani ba-derekh", "je suis en route"), L("מחיר", "mekhir", "prix"), L("סך הכול", "sakh ha-kol", "total"), L("קבלה", "kabala", "reçu"), L("תאריך", "ta'arikh", "date")],
            L("מתי אתה מגיע?", "Matai ata magia?", "Tu arrives quand ?"), ["מתי", "matai"],
            [{ say: L("אני בדרך", "ani ba-derekh", "je suis en route"), bad: ["מחיר", "קבלה", "תאריך"] }, { say: L("סך הכול", "sakh ha-kol", "total"), bad: ["מחיר", "קבלה", "תאריך"] }, { say: L("קבלה", "kabala", "reçu"), bad: ["מחיר", "סך הכול", "אני בדרך"] }]),
        ],
      },
      {
        id: "u13", title: "Voyager",
        days: [
          day("u13d1", "À l'hôtel", L("יש לכם חדר פנוי?", "Yesh lakhem kheder panui?", "Vous avez une chambre libre ?"), [
            intro("À la réception, tu peux commencer par « yesh lakhem » (vous avez) : yesh lakhem kheder panui, une chambre libre. Une réservation se dit « hazmana »."),
            rep(L("יש לכם חדר פנוי?", "Yesh lakhem kheder panui?", "Vous avez une chambre libre ?")),
            rep(L("הזמנתי חדר על שם כהן", "Hizmanti kheder al shem Cohen", "J'ai réservé une chambre au nom de Cohen")),
            rep(L("כמה עולה לילה?", "Kama ole layla?", "Combien coûte une nuit ?")),
            rep(L("ארוחת הבוקר כלולה?", "Arukhat ha-boker kelula?", "Le petit-déjeuner est compris ?")),
            rep(L("מה הסיסמה של הוויפי?", "Ma ha-sisma shel ha-wifi?", "C'est quoi le mot de passe du wifi ?")),
            listen(L("ארוחת הבוקר כלולה", "Arukhat ha-boker kelula", "Le petit-déjeuner est compris"), "Que dit le réceptionniste ?", "Le petit-déjeuner est compris", "Le petit-déjeuner est payant", "La chambre est occupée", "Le wifi est en panne"),
            swap("Demande deux nuits au lieu de trois.", L("שלושה לילות, בבקשה", "Shlosha leilot, bevakasha", "Trois nuits, s'il vous plaît"), L("שני לילות, בבקשה", "Shnei leilot, bevakasha", "Deux nuits, s'il vous plaît")),
            fill(L("יש לכם חדר פנוי?", "Yesh lakhem kheder panui?", "Vous avez une chambre libre ?"), "פנוי", "panui"),
            ask(L("כמה לילות?", "Kama leilot?", "Combien de nuits ?"), L("שלושה לילות, בבקשה", "Shlosha leilot, bevakasha", "Trois nuits, s'il vous plaît")),
          ], "un réceptionniste d'hôtel", "Réserver une chambre et poser des questions pratiques", L(g("שלום, ברוך הבא! יש לך הזמנה?", "שלום, ברוכה הבאה! יש לך הזמנה?"), g("Shalom, baruch ha-ba! Yesh lekha hazmana?", "Shalom, brukha ha-ba'a! Yesh lakh hazmana?"), "Bonjour, bienvenue ! Vous avez une réservation ?")),
          day("u13d2", "Les transports", L("כרטיס אחד לירושלים, בבקשה", "Kartis ekhad li-Yerushalayim, bevakasha", "Un billet pour Jérusalem, s'il vous plaît"), [
            intro("À la gare ou à l'arrêt : « kartis » (billet), « kav » (ligne), « rakevet » (train), « otobus » (bus). Un aller-retour se dit « halokh vekhazor »."),
            rep(L("כרטיס אחד לירושלים, בבקשה", "Kartis ekhad li-Yerushalayim, bevakasha", "Un billet pour Jérusalem, s'il vous plaît")),
            rep(L("מאיפה יוצא האוטובוס?", "Me'eifo yotse ha-otobus?", "D'où part le bus ?")),
            rep(L("מתי יוצאת הרכבת הבאה?", "Matai yotset ha-rakevet ha-ba'a?", "Quand part le prochain train ?")),
            rep(L("זה הקו הנכון?", "Ze ha-kav ha-nakhon?", "C'est la bonne ligne ?")),
            rep(L("הרכבת מאחרת", "Ha-rakevet me'akheret", "Le train est en retard")),
            listen(L("הרכבת מאחרת", "Ha-rakevet me'akheret", "Le train est en retard"), "Quel est le problème ?", "Le train est en retard", "Le train est complet", "Le train est annulé", "Le train est en avance"),
            ask(L("כרטיס לכיוון אחד או הלוך וחזור?", "Kartis le-kivun ekhad o halokh vekhazor?", "Un aller simple ou un aller-retour ?"), L("הלוך וחזור, בבקשה", "Halokh vekhazor, bevakasha", "Un aller-retour, s'il vous plaît")),
            swap("Demande un aller simple.", L("כרטיס הלוך וחזור, בבקשה", "Kartis halokh vekhazor, bevakasha", "Un aller-retour, s'il vous plaît"), L("כרטיס לכיוון אחד, בבקשה", "Kartis le-kivun ekhad, bevakasha", "Un aller simple, s'il vous plaît")),
            fill(L("זה הקו הנכון?", "Ze ha-kav ha-nakhon?", "C'est la bonne ligne ?"), "הנכון", "ha-nakhon"),
          ], "un employé à la gare", "Acheter un billet et te renseigner sur les horaires", L("שלום, במה אפשר לעזור?", "Shalom, ba-ma efshar la'azor?", "Bonjour, en quoi puis-je vous aider ?")),
          day("u13d3", "Le temps qu'il fait", L("חם היום", "Kham ha-yom", "Il fait chaud aujourd'hui"), [
            intro("Pour parler du temps : « kham » (chaud), « kar » (froid), « yored geshem » (il pleut). Pour demain, ajoute « yihye » : yihye shimshi, il fera beau."),
            rep(L("חם היום", "Kham ha-yom", "Il fait chaud aujourd'hui")),
            rep(L("קר מאוד", "Kar me'od", "Il fait très froid")),
            rep(L("יורד גשם", "Yored geshem", "Il pleut")),
            rep(L("מה מזג האוויר מחר?", "Ma mezeg ha-avir makhar?", "Quel temps fera-t-il demain ?")),
            rep(L("מחר יהיה שמשי", "Makhar yihye shimshi", "Demain, il fera beau")),
            listen(L("יורד גשם", "Yored geshem", "Il pleut"), "Quel temps fait-il ?", "Il pleut", "Il fait chaud", "Il y a du soleil", "Il neige"),
            swap("Dis qu'il fait froid au lieu de chaud.", L("חם היום", "Kham ha-yom", "Il fait chaud aujourd'hui"), L("קר היום", "Kar ha-yom", "Il fait froid aujourd'hui")),
            fill(L("יורד גשם", "Yored geshem", "Il pleut"), "גשם", "geshem"),
            ask(L("איך מזג האוויר?", "Eikh mezeg ha-avir?", "Il fait quel temps ?"), L("חם מאוד היום", "Kham me'od ha-yom", "Il fait très chaud aujourd'hui")),
            free(L("מה מזג האוויר בעיר שלך?", "Ma mezeg ha-avir ba-ir shelkha?", "Quel temps fait-il dans ta ville ?"), L("בעיר שלי קר בחורף", "Ba-ir sheli kar ba-khoref", "Dans ma ville, il fait froid en hiver")),
          ], "un voisin qui parle de la météo", "Parler du temps qu'il fait", L("איזה יום חם, נכון?", "Eize yom kham, nakhon?", "Quelle chaleur aujourd'hui, non ?")),
          day("u13d4", "Vêtements et couleurs", L(g("אני מחפש חולצה כחולה", "אני מחפשת חולצה כחולה"), g("Ani mekhapes khultsa kekhula", "Ani mekhapeset khultsa kekhula"), "Je cherche une chemise bleue"), [
            intro("Les couleurs : adom (rouge), kakhol (bleu), yarok (vert), shakhor (noir), lavan (blanc), tsahov (jaune). Elles s'accordent : khultsa kekhula, une chemise bleue ; mikhnasayim shkhorim, un pantalon noir."),
            rep(L(g("אני מחפש חולצה כחולה", "אני מחפשת חולצה כחולה"), g("Ani mekhapes khultsa kekhula", "Ani mekhapeset khultsa kekhula"), "Je cherche une chemise bleue")),
            rep(L("יש לכם מכנסיים שחורים?", "Yesh lakhem mikhnasayim shkhorim?", "Vous avez un pantalon noir ?")),
            rep(L("אפשר למדוד?", "Efshar limdod?", "Je peux essayer ?")),
            rep(L("זה מתאים לי", "Ze mat'im li", "Ça me va")),
            rep(L("אני אקח את זה", "Ani ekakh et ze", "Je prends ça")),
            listen(L("אפשר למדוד?", "Efshar limdod?", "Je peux essayer ?"), "Que demande le client ?", "S'il peut essayer", "S'il peut payer", "S'il y a une promo", "S'il y a une autre couleur"),
            swap("Demande une chemise rouge.", L("חולצה כחולה", "Khultsa kekhula", "Une chemise bleue"), L("חולצה אדומה", "Khultsa aduma", "Une chemise rouge")),
            fill(L("זה מתאים לי", "Ze mat'im li", "Ça me va"), "מתאים", "mat'im"),
            ask(L("איזו מידה?", "Eize mida?", "Quelle taille ?"), L("מידה בינונית", "Mida beinonit", "Taille moyenne")),
          ], "une vendeuse dans un magasin de vêtements", "Chercher un vêtement, l'essayer et l'acheter", L("שלום! מחפשים משהו מיוחד?", "Shalom! Mekhapsim mashehu meyukhad?", "Bonjour ! Vous cherchez quelque chose de particulier ?")),
        ],
      },
      {
        id: "u14", title: "Au restaurant",
        days: [
          day("u14d1", "Choisir un plat", L("אפשר תפריט, בבקשה?", "Efshar tafrit, bevakasha?", "Je peux avoir le menu, s'il vous plaît ?"), [
            intro("Pour commencer : « efshar tafrit ? ». Pour choisir, dis « ani ekakh » (je prends) plus le plat, ou demande conseil avec « ma atem mamlitsim ? »."),
            rep(L("אפשר תפריט, בבקשה?", "Efshar tafrit, bevakasha?", "Je peux avoir le menu, s'il vous plaît ?")),
            rep(L("מה אתם ממליצים?", "Ma atem mamlitsim?", "Qu'est-ce que vous recommandez ?")),
            rep(L("מה המנה היומית?", "Ma ha-mana ha-yomit?", "C'est quoi le plat du jour ?")),
            rep(L("אני אתחיל עם מרק", "Ani atkhil im marak", "Je commence par une soupe")),
            rep(L("אני אקח את הסלט", "Ani ekakh et ha-salat", "Je prends la salade")),
            listen(L("מה המנה היומית?", "Ma ha-mana ha-yomit?", "C'est quoi le plat du jour ?"), "Que demande le client ?", "Le plat du jour", "L'addition", "Le prix", "La carte des vins"),
            swap("Prends la soupe au lieu de la salade.", L("אני אקח את הסלט", "Ani ekakh et ha-salat", "Je prends la salade"), L("אני אקח את המרק", "Ani ekakh et ha-marak", "Je prends la soupe")),
            fill(L("אפשר תפריט, בבקשה?", "Efshar tafrit, bevakasha?", "Je peux avoir le menu, s'il vous plaît ?"), "תפריט", "tafrit"),
            ask(L(g("מה תרצה לאכול?", "מה תרצי לאכול?"), g("Ma tirtse le'ekhol?", "Ma tirtsi le'ekhol?"), "Qu'est-ce que vous voulez manger ?"), L("אני אקח את הסלט, בבקשה", "Ani ekakh et ha-salat, bevakasha", "Je prends la salade, s'il vous plaît")),
          ], "un serveur dans un restaurant de Tel-Aviv", "Demander la carte, te faire conseiller et commander", L("ערב טוב! הנה התפריט.", "Erev tov! Hine ha-tafrit.", "Bonsoir ! Voici le menu.")),
          day("u14d2", "Allergies et régimes", L(g("אני צמחוני", "אני צמחונית"), g("Ani tsimkhoni", "Ani tsimkhonit"), "Je suis végétarien(ne)"), [
            intro("Pour dire ce que tu ne manges pas : « ani » plus ton régime, ou « bli » (sans) plus l'ingrédient : bli batsal, sans oignon. Une allergie : « ani alergi le- » (je suis allergique à)."),
            rep(L(g("אני צמחוני", "אני צמחונית"), g("Ani tsimkhoni", "Ani tsimkhonit"), "Je suis végétarien(ne)")),
            rep(L(g("אני אלרגי לאגוזים", "אני אלרגית לאגוזים"), g("Ani alergi le-egozim", "Ani alergit le-egozim"), "Je suis allergique aux noix")),
            rep(L("יש בזה בשר?", "Yesh be-ze basar?", "Il y a de la viande dedans ?")),
            rep(L("אפשר בלי בצל?", "Efshar bli batsal?", "Je peux avoir ça sans oignon ?")),
            rep(L("בלי גלוטן, בבקשה", "Bli gluten, bevakasha", "Sans gluten, s'il vous plaît")),
            listen(L("יש בזה בשר?", "Yesh be-ze basar?", "Il y a de la viande dedans ?"), "Que demande le client ?", "S'il y a de la viande", "S'il y a du poisson", "S'il y a du fromage", "S'il y a du pain"),
            swap("Demande sans ail au lieu de sans oignon.", L("אפשר בלי בצל?", "Efshar bli batsal?", "Je peux avoir ça sans oignon ?"), L("אפשר בלי שום?", "Efshar bli shum?", "Je peux avoir ça sans ail ?")),
            fill(L(g("אני אלרגי לאגוזים", "אני אלרגית לאגוזים"), g("Ani alergi le-egozim", "Ani alergit le-egozim"), "Je suis allergique aux noix"), "לאגוזים", "le-egozim"),
            ask(L(g("יש משהו שאתה לא אוכל?", "יש משהו שאת לא אוכלת?"), g("Yesh mashehu she-ata lo okhel?", "Yesh mashehu she-at lo okhelet?"), "Il y a quelque chose que tu ne manges pas ?"), L(g("אני צמחוני", "אני צמחונית"), g("Ani tsimkhoni", "Ani tsimkhonit"), "Je suis végétarien(ne)")),
          ], "un serveur attentif", "Expliquer ton régime ou ton allergie", L(g("יש משהו שאתה לא אוכל?", "יש משהו שאת לא אוכלת?"), g("Yesh mashehu she-ata lo okhel?", "Yesh mashehu she-at lo okhelet?"), "Il y a quelque chose que tu ne manges pas ?")),
          day("u14d3", "Faire une remarque", L("המרק קר", "Ha-marak kar", "La soupe est froide"), [
            intro("Pour signaler un problème poliment : décris-le simplement (« ha-marak kar ») puis demande une solution : « efshar lehakhlif ? » (on peut changer ?)."),
            rep(L("המרק קר", "Ha-marak kar", "La soupe est froide")),
            rep(L("יש טעות בחשבון", "Yesh ta'ut ba-kheshbon", "Il y a une erreur dans l'addition")),
            rep(L("לא הזמנו את זה", "Lo hizmanu et ze", "Nous n'avons pas commandé ça")),
            rep(L("אפשר להחליף?", "Efshar lehakhlif?", "On peut changer ?")),
            rep(L("הכול היה טעים, תודה", "Ha-kol haya ta'im, toda", "Tout était bon, merci")),
            listen(L("יש טעות בחשבון", "Yesh ta'ut ba-kheshbon", "Il y a une erreur dans l'addition"), "Quel est le problème ?", "Une erreur dans l'addition", "Un plat froid", "Un plat manquant", "Un verre cassé"),
            swap("Dis que le plat est froid, pas la soupe.", L("המרק קר", "Ha-marak kar", "La soupe est froide"), L("המנה קרה", "Ha-mana kara", "Le plat est froid")),
            fill(L("אפשר להחליף?", "Efshar lehakhlif?", "On peut changer ?"), "להחליף", "lehakhlif"),
            ask(L("משהו לא בסדר?", "Mashehu lo beseder?", "Quelque chose ne va pas ?"), L("המרק קר, אפשר להחליף?", "Ha-marak kar, efshar lehakhlif?", "La soupe est froide, on peut changer ?")),
          ], "un serveur qui vient prendre ton avis", "Signaler un problème avec politesse", L("הכול בסדר? אפשר לעזור במשהו?", "Ha-kol beseder? Efshar la'azor be-mashehu?", "Tout va bien ? Je peux vous aider en quelque chose ?")),
          day("u14d4", "Payer et partir", L("אפשר לחלק את החשבון?", "Efshar lekhalek et ha-kheshbon?", "On peut partager l'addition ?"), [
            intro("Pour payer à plusieurs : « efshar lekhalek ? » (on peut partager ?). Pour demander si le service est compris : « ha-sherut kalul ? ». En partant, on remercie : « toda, erev metsuyan »."),
            rep(L("אפשר לחלק את החשבון?", "Efshar lekhalek et ha-kheshbon?", "On peut partager l'addition ?")),
            rep(L("השירות כלול?", "Ha-sherut kalul?", "Le service est compris ?")),
            rep(L(g("אני משלם בכרטיס", "אני משלמת בכרטיס"), g("Ani meshalem be-kartis", "Ani meshalemet be-kartis"), "Je paie par carte")),
            rep(L("תודה, ערב מצוין", "Toda, erev metsuyan", "Merci, excellente soirée")),
            listen(L("השירות כלול?", "Ha-sherut kalul?", "Le service est compris ?"), "Que demande le client ?", "Si le service est compris", "Si on peut payer par carte", "Si on peut réserver", "Si la table est libre"),
            swap("Dis que tu paies en espèces.", L(g("אני משלם בכרטיס", "אני משלמת בכרטיס"), g("Ani meshalem be-kartis", "Ani meshalemet be-kartis"), "Je paie par carte"), L(g("אני משלם במזומן", "אני משלמת במזומן"), g("Ani meshalem be-mezuman", "Ani meshalemet be-mezuman"), "Je paie en espèces")),
            fill(L("תודה, ערב מצוין", "Toda, erev metsuyan", "Merci, excellente soirée"), "מצוין", "metsuyan"),
            ask(L("איך תרצו לשלם?", "Eikh tirtsu leshalem?", "Comment voulez-vous payer ?"), L(g("אני משלם בכרטיס", "אני משלמת בכרטיס"), g("Ani meshalem be-kartis", "Ani meshalemet be-kartis"), "Je paie par carte")),
          ], "un serveur à la fin du repas", "Régler l'addition à plusieurs", L("הנה החשבון.", "Hine ha-kheshbon.", "Voici l'addition.")),
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
      {
        id: "u15", title: "Vivre en Israël",
        days: [
          day("u15d1", "Shabbat et fêtes", L("שבת שלום", "Shabat shalom", "Bon Shabbat"), [
            intro("Le shabbat commence le vendredi soir et finit le samedi soir. On se souhaite « shabat shalom », et pour une fête « khag sameakh ». Le vendredi soir, la famille mange ensemble."),
            rep(L("שבת שלום", "Shabat shalom", "Bon Shabbat")),
            rep(L("חג שמח", "Khag sameakh", "Bonne fête")),
            rep(L("ארוחת שישי אצל המשפחה", "Arukhat shishi etsel ha-mishpakha", "Le repas du vendredi chez la famille")),
            rep(L("הכול סגור בשבת", "Ha-kol sagur ba-shabat", "Tout est fermé le samedi")),
            rep(L("אין תחבורה ציבורית בשבת", "Ein takhbura tsiburit ba-shabat", "Il n'y a pas de transports en commun le samedi")),
            listen(L("הכול סגור בשבת", "Ha-kol sagur ba-shabat", "Tout est fermé le samedi"), "Que dit cette personne ?", "Tout est fermé le samedi", "Tout est ouvert le samedi", "Tout est cher le samedi", "Tout est gratuit le samedi"),
            swap("Dis « bonne fête » au lieu de « bon Shabbat ».", L("שבת שלום", "Shabat shalom", "Bon Shabbat"), L("חג שמח", "Khag sameakh", "Bonne fête")),
            fill(L("אין תחבורה ציבורית בשבת", "Ein takhbura tsiburit ba-shabat", "Il n'y a pas de transports en commun le samedi"), "בשבת", "ba-shabat"),
            free(L(g("מה אתה עושה בשבת?", "מה את עושה בשבת?"), g("Ma ata ose ba-shabat?", "Ma at osa ba-shabat?"), "Tu fais quoi le samedi ?"), L(g("אני נח ופוגש חברים", "אני נחה ופוגשת חברים"), g("Ani nakh u-fogesh khaverim", "Ani nakha u-fogeshet khaverim"), "Je me repose et je vois des amis")),
          ], "un voisin qui t'invite pour le vendredi soir", "Parler du shabbat et accepter une invitation", L(g("שבת שלום! רוצה לבוא לארוחת שישי?", "שבת שלום! רוצה לבוא לארוחת שישי?"), g("Shabat shalom! Rotse lavo le-arukhat shishi?", "Shabat shalom! Rotsa lavo le-arukhat shishi?"), "Shabbat shalom ! Tu veux venir au repas du vendredi ?")),
          day("u15d2", "Au marché : négocier", L("זה יקר מדי בשבילי", "Ze yakar midai bishvili", "C'est trop cher pour moi"), [
            intro("Au marché, on discute le prix : c'est normal et poli. On dit « ze yakar midai » (trop cher), on demande une réduction avec « hanakha », et on propose un prix."),
            rep(L("זה יקר מדי בשבילי", "Ze yakar midai bishvili", "C'est trop cher pour moi")),
            rep(L(g("תן לי הנחה", "תני לי הנחה"), g("Ten li hanakha", "Teni li hanakha"), "Fais-moi une réduction")),
            rep(L("מה המחיר הסופי?", "Ma ha-mekhir ha-sofi?", "C'est quoi le prix final ?")),
            rep(L("אני אקח שלושה בעשרים שקל", "Ani ekakh shlosha be-esrim shekel", "Je prends trois pour vingt shekels")),
            rep(L("אולי בפעם הבאה", "Ulai ba-pa'am ha-ba'a", "Peut-être la prochaine fois")),
            listen(L("מה המחיר הסופי?", "Ma ha-mekhir ha-sofi?", "C'est quoi le prix final ?"), "Que demande le client ?", "Le prix final", "Le prix au kilo", "L'heure de fermeture", "Le nom du produit"),
            swap("Dis « trop cher » au lieu de demander une réduction.", L(g("תן לי הנחה", "תני לי הנחה"), g("Ten li hanakha", "Teni li hanakha"), "Fais-moi une réduction"), L("זה יקר מדי", "Ze yakar midai", "C'est trop cher")),
            fill(L("זה יקר מדי בשבילי", "Ze yakar midai bishvili", "C'est trop cher pour moi"), "בשבילי", "bishvili"),
            ask(L(g("כמה אתה מוכן לשלם?", "כמה את מוכנה לשלם?"), g("Kama ata mukhan leshalem?", "Kama at mukhana leshalem?"), "Combien tu es prêt(e) à payer ?"), L(g("אני מוכן לשלם שלושים שקל", "אני מוכנה לשלם שלושים שקל"), g("Ani mukhan leshalem shloshim shekel", "Ani mukhana leshalem shloshim shekel"), "Je suis prêt(e) à payer trente shekels")),
          ], "un vendeur au marché Carmel", "Discuter le prix et conclure", L("בוא, בוא! רק חמישים שקל, מחיר מיוחד!", "Bo, bo! Rak khamishim shekel, mekhir meyukhad!", "Viens, viens ! Seulement cinquante shekels, prix spécial !")),
          day("u15d3", "Les démarches", L(g("אני צריך לקבוע תור", "אני צריכה לקבוע תור"), g("Ani tsarikh likbo'a tor", "Ani tsrikha likbo'a tor"), "Je dois prendre rendez-vous"), [
            intro("Dans une administration, on prend un « tor » (rendez-vous, mais aussi file d'attente). Pour demander qui est le dernier : « mi akharon ba-tor ? »."),
            rep(L(g("אני צריך לקבוע תור", "אני צריכה לקבוע תור"), g("Ani tsarikh likbo'a tor", "Ani tsrikha likbo'a tor"), "Je dois prendre rendez-vous")),
            rep(L("מי אחרון בתור?", "Mi akharon ba-tor?", "Qui est le dernier dans la file ?")),
            rep(L("איזה מסמכים צריך להביא?", "Eize mismakhim tsarikh lehavi?", "Quels documents faut-il apporter ?")),
            rep(L("אפשר למלא את הטופס?", "Efshar lemale et ha-tofes?", "Je peux remplir le formulaire ?")),
            rep(L("מתי אפשר לקבל תשובה?", "Matai efshar lekabel tshuva?", "Quand peut-on avoir une réponse ?")),
            listen(L("מי אחרון בתור?", "Mi akharon ba-tor?", "Qui est le dernier dans la file ?"), "Que demande cette personne ?", "Qui est le dernier dans la file", "Quelle heure il est", "Où est le guichet", "Combien ça coûte"),
            swap("Demande quand tu auras une réponse, pas quels documents.", L("איזה מסמכים צריך להביא?", "Eize mismakhim tsarikh lehavi?", "Quels documents faut-il apporter ?"), L("מתי אפשר לקבל תשובה?", "Matai efshar lekabel tshuva?", "Quand peut-on avoir une réponse ?")),
            fill(L("אפשר למלא את הטופס?", "Efshar lemale et ha-tofes?", "Je peux remplir le formulaire ?"), "הטופס", "ha-tofes"),
            ask(L("במה אפשר לעזור?", "Ba-ma efshar la'azor?", "En quoi puis-je vous aider ?"), L(g("אני צריך לקבוע תור", "אני צריכה לקבוע תור"), g("Ani tsarikh likbo'a tor", "Ani tsrikha likbo'a tor"), "Je dois prendre rendez-vous")),
          ], "un employé d'une administration", "Prendre rendez-vous et te renseigner sur les documents", L("שלום, במה אפשר לעזור?", "Shalom, ba-ma efshar la'azor?", "Bonjour, en quoi puis-je vous aider ?")),
          day("u15d4", "Avec les voisins", L(g("שלום, אני השכן החדש", "שלום, אני השכנה החדשה"), g("Shalom, ani ha-shakhen ha-khadash", "Shalom, ani ha-shkhena ha-khadasha"), "Bonjour, je suis le nouveau voisin"), [
            intro("Avec les voisins, on se présente : « shakhen » (voisin) au masculin, « shkhena » au féminin. Pour signaler un problème avec tact : « ha-ra'ash mafri'a li » (le bruit me dérange), puis une demande polie."),
            rep(L(g("שלום, אני השכן החדש", "שלום, אני השכנה החדשה"), g("Shalom, ani ha-shakhen ha-khadash", "Shalom, ani ha-shkhena ha-khadasha"), "Bonjour, je suis le nouveau voisin")),
            rep(L("הרעש מפריע לי", "Ha-ra'ash mafri'a li", "Le bruit me dérange")),
            rep(L("אפשר להנמיך את המוזיקה?", "Efshar lehanmikh et ha-muzika?", "Vous pouvez baisser la musique ?")),
            rep(L(g("אפשר לשאול אותך משהו?", "אפשר לשאול אותך משהו?"), g("Efshar lish'ol otkha mashehu?", "Efshar lish'ol otakh mashehu?"), "Je peux te demander quelque chose ?")),
            rep(L("תודה על העזרה", "Toda al ha-ezra", "Merci pour l'aide")),
            listen(L("הרעש מפריע לי", "Ha-ra'ash mafri'a li", "Le bruit me dérange"), "Quel est le problème ?", "Le bruit", "L'odeur", "Le prix", "La poubelle"),
            swap("Demande de baisser la musique poliment.", L("הרעש מפריע לי", "Ha-ra'ash mafri'a li", "Le bruit me dérange"), L("אפשר להנמיך את המוזיקה?", "Efshar lehanmikh et ha-muzika?", "Vous pouvez baisser la musique ?")),
            fill(L("תודה על העזרה", "Toda al ha-ezra", "Merci pour l'aide"), "העזרה", "ha-ezra"),
            free(L("יש לך בעיה עם הרעש?", g("Yesh lekha be'aya im ha-ra'ash?", "Yesh lakh be'aya im ha-ra'ash?"), "Tu as un problème avec le bruit ?"), L("כן, הרעש מפריע לי בלילה", "Ken, ha-ra'ash mafri'a li ba-layla", "Oui, le bruit me dérange la nuit")),
          ], "un voisin qui sonne à ta porte", "Te présenter et régler un petit problème de voisinage", L("שלום! סליחה על ההפרעה. אפשר לדבר רגע?", "Shalom! Slikha al ha-hafra'a. Efshar ledaber rega?", "Bonjour ! Excusez-moi de vous déranger. On peut parler un instant ?")),
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
  {
    id: "adv2", title: "Avancé 2", cefr: "C2",
    units: [
      {
        id: "u11", title: "Registres et nuances",
        days: [
          day("u11d1", "Un courriel formel", L("בהמשך לשיחתנו אתמול", "Be-hemshekh le-sikhatenu etmol", "Suite à notre conversation d'hier"), [
            intro("Dans un courriel formel, on garde un ton neutre et poli. « Shalom rav » ouvre la lettre, « be-vrakha » la ferme."),
            rep(L("שלום רב,", "Shalom rav,", "Bonjour, (formel)")),
            rep(L("בהמשך לשיחתנו אתמול", "Be-hemshekh le-sikhatenu etmol", "Suite à notre conversation d'hier")),
            rep(L("אשמח לקבל תשובה בהקדם", "Esmakh lekabel tshuva be-hekdem", "Je serais ravi(e) d'avoir une réponse rapidement")),
            rep(L("בברכה", "Be-vrakha", "Cordialement")),
            listen(L("אשמח לקבל תשובה בהקדם", "Esmakh lekabel tshuva be-hekdem", "Je serais ravi(e) d'avoir une réponse rapidement"), "Que demande l'auteur ?", "Une réponse rapide", "Un rendez-vous", "Un remboursement", "Un devis"),
            swap("Rends la formule plus familière : dis « merci d'avance ».", L("אשמח לקבל תשובה בהקדם", "Esmakh lekabel tshuva be-hekdem", "Je serais ravi(e) d'avoir une réponse rapidement"), L("תודה מראש", "Toda mi-reshet", "Merci d'avance")),
            fill(L("בהמשך לשיחתנו אתמול", "Be-hemshekh le-sikhatenu etmol", "Suite à notre conversation d'hier"), "לשיחתנו", "le-sikhatenu"),
          ], "ton responsable, qui attend ton courriel", "Dicter à l'oral un courriel formel", L(g("אפשר לקבל ממך הודעה קצרה ללקוח? נסח אותה, בבקשה.", "אפשר לקבל ממך הודעה קצרה ללקוח? נסחי אותה, בבקשה."), g("Efshar lekabel mimkha hoda'a ketsara la-lakokh? Nasekh ota, bevakasha.", "Efshar lekabel mimekh hoda'a ketsara la-lakokh? Nasekhi ota, bevakasha."), "Je peux avoir de ta part un court message au client ? Rédige-le, s'il te plaît.")),
          day("u11d2", "Expressions du quotidien", L("בא לי קפה", "Ba li kafe", "J'ai envie d'un café"), [
            intro("Quatre expressions que tu entendras tout le temps : « ba li » (j'ai envie), « lo ikhpat li » (ça m'est égal), « ein ma la'asot » (on n'y peut rien), « lo nora » (pas grave)."),
            rep(L("בא לי קפה", "Ba li kafe", "J'ai envie d'un café")),
            rep(L("לא אכפת לי", "Lo ikhpat li", "Ça m'est égal")),
            rep(L("אין מה לעשות", "Ein ma la'asot", "On n'y peut rien")),
            rep(L("לא נורא", "Lo nora", "Pas grave")),
            listen(L("בא לי ללכת לים", "Ba li lalekhet la-yam", "J'ai envie d'aller à la plage"), "Que veut cette personne ?", "Aller à la plage", "Aller au travail", "Rester à la maison", "Manger"),
            swap("Dis que tu n'as pas envie.", L("בא לי קפה", "Ba li kafe", "J'ai envie d'un café"), L("לא בא לי קפה", "Lo ba li kafe", "Je n'ai pas envie d'un café")),
            fill(L("אין מה לעשות", "Ein ma la'asot", "On n'y peut rien"), "מה", "ma"),
            ask(L("מה בא לך?", g("Ma ba lekha?", "Ma ba lakh?"), "Tu as envie de quoi ?"), L("בא לי ללכת לים", "Ba li lalekhet la-yam", "J'ai envie d'aller à la plage")),
          ], "un ami qui ne sait pas quoi faire ce soir", "Dire ce dont tu as envie et ce qui t'est égal", L("אין לי מושג מה לעשות הערב. מה בא לך?", g("Ein li musag ma la'asot ha-erev. Ma ba lekha?", "Ein li musag ma la'asot ha-erev. Ma ba lakh?"), "Aucune idée de ce qu'on fait ce soir. Tu as envie de quoi ?")),
          day("u11d3", "Atténuer et arrondir", L("זה די טוב", "Ze dai tov", "C'est assez bien"), [
            intro("Pour parler naturellement, on arrondit : « be'erekh » (environ), « dai » (assez), « ktsat » (un peu), « kim'at » (presque). Ça adoucit tes phrases."),
            rep(L("בערך שעה", "Be'erekh sha'a", "Environ une heure")),
            rep(L("זה די טוב", "Ze dai tov", "C'est assez bien")),
            rep(L("זה קצת מסובך", "Ze ktsat mesubakh", "C'est un peu compliqué")),
            rep(L("כמעט גמרנו", "Kim'at gamarnu", "On a presque fini")),
            listen(L("זה די טוב", "Ze dai tov", "C'est assez bien"), "Quel avis entends-tu ?", "Plutôt positif", "Très négatif", "Neutre", "Excellent"),
            swap("Atténue : « c'est cher » devient « c'est un peu cher ».", L("זה יקר", "Ze yakar", "C'est cher"), L("זה קצת יקר", "Ze ktsat yakar", "C'est un peu cher")),
            fill(L("כמעט גמרנו", "Kim'at gamarnu", "On a presque fini"), "כמעט", "kim'at"),
            free(L("איך היה הסרט?", "Eikh haya ha-seret?", "Il était comment, le film ?"), L("הוא היה די טוב", "Hu haya dai tov", "Il était assez bien")),
          ], "un ami qui demande ton avis sur un restaurant", "Donner un avis nuancé", L("אז איך היה המקום?", "Az eikh haya ha-makom?", "Alors, c'était comment, l'endroit ?")),
          day("u11d4", "Comprendre les médias", L("ההחלטה עוררה ביקורת", "Ha-hakhlata orera bikoret", "La décision a suscité des critiques"), [
            intro("Dans les infos, le vocabulaire est plus soutenu : « medavkhim she- » (on rapporte que), « li-dvarav » (selon lui), « orer bikoret » (a suscité des critiques)."),
            rep(L("מדווחים שיש עיכובים בכבישים", "Medavkhim she-yesh ikuvim ba-kvishim", "On rapporte des retards sur les routes")),
            rep(L("לדברי הדובר, אין שינוי", "Li-dvarav shel ha-dover, ein shinui", "Selon le porte-parole, il n'y a pas de changement")),
            rep(L("ההחלטה עוררה ביקורת", "Ha-hakhlata orera bikoret", "La décision a suscité des critiques")),
            rep(L("המחאה נמשכת", "Ha-makha'a nimshekhet", "La manifestation se poursuit")),
            listen(L("ההחלטה עוררה ביקורת", "Ha-hakhlata orera bikoret", "La décision a suscité des critiques"), "Que dit le journal ?", "La décision a suscité des critiques", "La décision a été annulée", "La décision est appliquée", "La décision est reportée"),
            swap("Passe à la forme négative.", L("יש שינוי", "Yesh shinui", "Il y a un changement"), L("אין שינוי", "Ein shinui", "Il n'y a pas de changement")),
            fill(L("המחאה נמשכת", "Ha-makha'a nimshekhet", "La manifestation se poursuit"), "נמשכת", "nimshekhet"),
            ask(L("מה חדש בחדשות?", "Ma khadash ba-khadashot?", "Quoi de neuf dans l'actualité ?"), L("מדווחים שיש עיכובים בכבישים", "Medavkhim she-yesh ikuvim ba-kvishim", "On rapporte des retards sur les routes")),
          ], "un ami qui regarde le journal télévisé", "Résumer une actualité et donner ton avis", L(g("תקשיב, בחדשות אמרו שהמחאה נמשכת. מה דעתך?", "תקשיבי, בחדשות אמרו שהמחאה נמשכת. מה דעתך?"), g("Takshiv, ba-khadashot amru she-ha-makha'a nimshekhet. Ma da'atkha?", "Takshivi, ba-khadashot amru she-ha-makha'a nimshekhet. Ma da'atekh?"), "Écoute, aux infos ils ont dit que la manifestation continue. Qu'en penses-tu ?")),
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
      const produce = d.steps.find((x) => x.kind === "answer" || x.kind === "free") ?? d.steps.find((x) => x.kind === "fill" || x.kind === "swap");
      if (produce) steps.push(produce);
    }
    const sc = last.scenario;
    unit.days.push(day(`${unit.id}r`, "Révision", unit.days[0].key, steps, sc.role, sc.goal, { he: sc.starter.text, tr: sc.starter.transliteration, fr: sc.starter.translation.fr ?? "" }));
  }
}

// Consignes : les mots hébreux écrits en translittération entre « » sont lus par la voix hébraïque, pas par la voix française
// du système (qui les prononce mal). On retrouve l'hébreu dans les phrases du cours, puis dans ces compléments.
const EXTRA_HE: Record<string, string> = {
  im: "אם", "hayiti nose'a": "הייתי נוסע | הייתי נוסעת", sherutim: "שירותים", "kafe ekhad": "קפה אחד", "shtei ugot": "שתי עוגות", "efshar et ha-kheshbon": "אפשר את החשבון", "ani esa": "אני אסע",
  "ko'ev li": "כואב לי", "ko'evet li": "כואבת לי", kheder: "חדר", "skhar dira": "שכר דירה", "efshar ledaber im": "אפשר לדבר עם",
  "eifo ani yakhol limtso": "איפה אני יכול למצוא", "eifo ani yekhola limtso": "איפה אני יכולה למצוא", "makhar ani nose'a": "מחר אני נוסע",
  "mi-tsad ekhad": "מצד אחד", "mi-tsad sheni": "מצד שני", lamrot: "למרות", "be-sakh ha-kol": "בסך הכול", khaval: "חבל",
  "ani mitsta'er": "אני מצטער", "mitsta'eret": "מצטערת", "akhar kakh": "אחר כך", tkhum: "תחום", tsevet: "צוות", "ani matsi'a": "אני מציע",
  karati: "קראתי", shamati: "שמעתי", "le-marbe ha-tsa'ar": "למרבה הצער", "hayiti rotse": "הייתי רוצה", "hayiti rotsa": "הייתי רוצה",
  "i efshar lehit'alem me-ha-uvda": "אי אפשר להתעלם מהעובדה", "ha-kavana hi": "הכוונה היא", "ba li": "בא לי", medavkhim: "מדווחים",
  "li-dvarav": "לדברי", "orer bikoret": "עורר ביקורת", "ani khoshev": "אני חושב", khoshevet: "חושבת", "ya'ni": "יעני", "lo ikhpat li": "לא אכפת לי",
  "ein ma la'asot": "אין מה לעשות", "lo nora": "לא נורא", "be'erekh": "בערך", dai: "די", ktsat: "קצת", "kim'at": "כמעט", "be-vrakha": "בברכה", "shalom rav": "שלום רב",
};
const trKey = (t: string) => t.toLowerCase().replace(/[?!.,…:;()]/g, "").replace(/\s+/g, " ").trim();
const HE_OF = new Map<string, G>();
{
  const put = (tr: string, m: string, f: string) => { const k = trKey(tr); if (k && !HE_OF.has(k)) HE_OF.set(k, { m: m.replace(/[?!.,…:;]/g, "").trim(), f: f.replace(/[?!.,…:;]/g, "").trim() }); };
  const words = (t: string) => t.replace(/[?!.,…]/g, "").split(/\s+/).filter(Boolean);
  // Les compléments passent en premier : ils lèvent les ambiguïtés (« im » = si, pas « avec »).
  for (const [tr, he] of Object.entries(EXTRA_HE)) { const [m, f] = he.split("|").map((x) => x.trim()); put(tr, m, f ?? m); }
  for (const lvl of COURSE) for (const u of lvl.units) for (const d of u.days) for (const l of [d.key, ...d.steps.flatMap(linesOf)]) {
    put(l.tr.m, l.he.m, l.he.f);
    for (const g of ["m", "f"] as const) {
      const h = words(l.he[g]), t = words(l.tr[g]);
      if (h.length === t.length) h.forEach((x, i) => put(t[i], x, x));
    }
  }
  for (const w of [...THEMES.flatMap((t) => t.words), ...PHRASES]) put(w.tr.split(" / ")[0], w.he.split(" / ")[0], w.he.split(" / ").pop() ?? w.he);
}
/** Hébreu d'un morceau « translittération » d'une consigne, ou undefined si on ne le connaît pas (il reste alors en français). */
/** Mots que la voix ne sait pas dire seuls (« או », « את », « גר » : aucune variante testée n'est reconnue) : on les fait dire dans une courte phrase d'exemple. Les autres petits mots passent seuls. */
const CARRIER: Record<string, G> = {
  o: { m: "קפה או תה", f: "קפה או תה" }, at: { m: "את רעבה", f: "את רעבה" }, et: { m: "את החשבון", f: "את החשבון" },
  gar: { m: "אני גר בפריז", f: "אני גר בפריז" }, gara: { m: "אני גרה בפריז", f: "אני גרה בפריז" },
};
/** Fragments de mots (préfixes collés) : isolés, ils seraient lus comme d'autres mots (« ba » = בא), on les laisse en français. */
const FRAGMENTS = new Set(["ba", "la", "be", "le", "ha", "ti", "ni", "mi", "me", "she", "ve", "ke", "ni-"]);
function hebrewOf(chunk: string): G | undefined {
  if (FRAGMENTS.has(trKey(chunk).replace(/-$/, ""))) return undefined;
  const alts = chunk.split("/").map((a) => trKey(a.replace(/\+.*$/, "")).replace(/\s+she-?$/, "").replace(/-$/, "").trim()).filter(Boolean);
  if (!alts.length) return undefined;
  if (alts.length === 1 && CARRIER[alts[0]]) return CARRIER[alts[0]];
  const found = alts.map((a) => HE_OF.get(a) ?? HE_OF.get(a.replace(/-/g, " ")));
  if (found.some((x) => !x)) return undefined;
  return { m: found.map((x) => x!.m).join(", "), f: found.map((x) => x!.f).join(", ") };
}
/** Mots courts toujours pris pour de l'hébreu translittéré hors « » (les autres doivent avoir une apostrophe, un trait d'union ou 4 lettres). */
const SHORT_TR = new Set(["ani", "ata", "yesh", "ein", "ken", "kam", "gar", "kama", "gara", "akhat", "shtayim", "shalosh"]);
/** Découpe un morceau de français : les mots hébreux translittérés (même sans « ») deviennent des morceaux `he`. */
function splitPlain(text: string): IntroPart[] {
  const out: IntroPart[] = [];
  const toks = [...text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map((m) => ({ w: m[0], i: m.index, he: undefined as G | undefined }));
  for (const t of toks) {
    const ok = SHORT_TR.has(t.w.toLowerCase()) || /['’-]/.test(t.w.replace(/^[A-Za-z]'/, "")) || t.w.length >= 4;
    t.he = ok && !/^[A-Z]/.test(t.w.slice(1)) ? HE_OF.get(trKey(t.w)) : undefined;
  }
  let at = 0;
  for (let k = 0; k < toks.length; k++) {
    if (!toks[k].he) continue;
    // Mots hébreux voisins séparés par une virgule ou une espace : un seul morceau (« akhat, shtayim, shalosh », « hayiti nose'a »).
    let e = k;
    while (e + 1 < toks.length && toks[e + 1].he && /^[,\s]+$/.test(text.slice(toks[e].i + toks[e].w.length, toks[e + 1].i))) e++;
    const from = toks[k].i, to = toks[e].i + toks[e].w.length;
    if (from > at) out.push({ t: text.slice(at, from) });
    // Même séparateur qu'à l'écrit : une virgule donne une pause, une espace non.
    const join = (pick: (x: G) => string) => toks.slice(k, e + 1).map((x, n, a) => (n ? (/,/.test(text.slice(a[n - 1].i + a[n - 1].w.length, x.i)) ? ", " : " ") : "") + pick(x.he!)).join("");
    const single = e === k ? CARRIER[trKey(toks[k].w)] : undefined; // un mot court seul : phrase d'exemple
    out.push({ t: text.slice(from, to), he: single ?? { m: join((x) => x.m), f: join((x) => x.f) } });
    at = to;
    k = e;
  }
  if (at < text.length) out.push({ t: text.slice(at) });
  return out;
}
for (const lvl of COURSE) for (const u of lvl.units) for (const d of u.days) for (const st of d.steps) {
  if (st.kind !== "intro") continue;
  const parts: IntroPart[] = [];
  let at = 0;
  const plain = (a: number, b: number) => { if (b > a) parts.push(...splitPlain(st.fr.slice(a, b))); };
  for (const m of st.fr.matchAll(/«\s*([^»]+?)\s*»/g)) {
    const he = hebrewOf(m[1]);
    if (!he) continue;
    plain(at, m.index);
    parts.push({ t: m[1], he });
    at = m.index + m[0].length;
  }
  plain(at, st.fr.length);
  if (parts.some((p) => p.he)) st.parts = parts;
}

export const ALL_DAYS = COURSE.flatMap((l) => l.units.flatMap((u) => u.days.map((d) => ({ level: l, unit: u, day: d }))));

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Parcours d'un apprenant : les jours de son niveau jusqu'au niveau qu'il vise. Un B1 qui vise le B2 n'a ni l'alphabet ni les bases du A1 à refaire. */
export function pathFor(level: string, target?: string): typeof ALL_DAYS {
  const startLevel = courseLevelFor(level);
  const start = COURSE.indexOf(startLevel);
  const cap = Math.max(CEFR.indexOf(target ?? level), CEFR.indexOf(startLevel.cefr));
  return ALL_DAYS.filter((x) => COURSE.indexOf(x.level) >= start && CEFR.indexOf(x.level.cefr) <= cap);
}

/** Le niveau du parcours pour un apprenant : le sien, ou le plus haut déjà écrit en dessous (un B2 commence au B1). */
export function courseLevelFor(level: string): CourseLevel {
  const ready = COURSE.filter((l) => l.units.length && CEFR.indexOf(l.cefr) <= Math.max(0, CEFR.indexOf(level)));
  return ready[ready.length - 1] ?? COURSE[0];
}
