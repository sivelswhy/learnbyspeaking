/**
 * Exporte les contenus et règles partagés vers l'app Mac native (Swift) : mac/native/Resources/content.json.
 * Les expressions régulières sont exportées par leur source (lues par NSRegularExpression).
 * Lancer : npx jiti scripts/export-native.ts
 */
import { writeFileSync, copyFileSync } from "node:fs";
const R = new URL("../lib/", import.meta.url).pathname;
const scenes = await import(R + "scenes.ts");
const prompts = await import(R + "prompts.ts");
const langs = await import(R + "languages.ts");
const placement = await import(R + "placement.ts");
const course = await import(R + "content/course-he.ts");
const res = await import(R + "content/resources-he.ts");
const topics = await import(R + "topics.ts");
const human = await import(R + "humanDialogue.ts");
const feedback = await import(R + "feedback.ts");
const fem = await import(R + "sayInHebrew.ts");

/** Consignes de Gemma, rendues avec des trous ({{Q}}, {{A}}, {{LEVEL}}…) que Swift remplit : une seule source de vérité. */
type M = { role: string; content: string };
const levelHole = (msgs: M[] | string) => JSON.parse(JSON.stringify(msgs).replaceAll("{{LEVEL}}: undefined", "{{LEVEL}}: {{LEVELDESC}}"));
const prof = (g: "m" | "f") => ({ native: "fr", target: "he", level: "{{LEVEL}}", goal: "daily", dailyMinutes: 10, gender: g }) as any;
const genders = ["m", "f"] as const;
const humanSystems: Record<string, Record<string, string>> = {};
for (const sc of langs.SCENARIOS as any[]) humanSystems[sc.id] = Object.fromEntries(genders.map((g) => [g, levelHole(human.humanSystem(prof(g), sc))]));
// Situation sans script (sujet de discussion, jeu de rôle d'un jour de cours) : le rôle est un trou.
humanSystems["*"] = Object.fromEntries(genders.map((g) => [g, levelHole(human.humanSystem(prof(g), { id: "*", role: "{{ROLE}}", goal: "", title: "", opening: "", difficulty: 1 } as any))]));
const templates = {
  humanSystem: humanSystems,
  hintClarify: Object.fromEntries(genders.map((g) => [g, human.turnHint("לא הבנתי", "{{LASTAI}}", g === "f")])),
  hintQuestion: Object.fromEntries(genders.map((g) => [g, human.turnHint("{{SAID}}?", "", g === "f")])),
  relevance: placement.relevancePrompt("{{Q}}", "{{A}}"),
  grammarCorrect: placement.grammarPrompts("{{A}}").correct,
  grammarMistake: placement.grammarPrompts("{{A}}").mistake,
  correction: placement.correctionPrompt("{{A}}"),
  translate: prompts.translateMessages(prof("m"), "{{T}}"),
  toHebrew: Object.fromEntries(genders.map((g) => [g, prompts.translateMessages(prof(g), "{{T}}", true)])),
  word: prompts.wordMessages("{{W}}"),
  example: prompts.exampleMessages("{{W}}"),
  feminine: prompts.feminineMessages("{{T}}"),
  better: Object.fromEntries(["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => [l, Object.fromEntries(genders.map((g) => [g, feedback.betterMessages("{{Q}}", "{{A}}", g === "f", l as any)]))])),
};
const rules = {
  mascYou: prompts.MASC_YOU.source, femYou: prompts.FEM_YOU.source, noamFem: prompts.NOAM_FEM.source,
  atToMan: human.AT_TO_MAN.source, filler: human.FILLER.source,
  mustAnswer: human.MUST_ANSWER.map(([q, a]: RegExp[]) => [q.source, a.source]),
  fem: fem.FEM,
  devWords: feedback.DEV_WORDS, goalTip: feedback.GOAL_TIP,
  levelSkill: Object.fromEntries(Object.entries(feedback.LEVEL_SKILL as Record<string, any>).map(([k, v]) => [k, { has: v.has.source, tip: v.tip }])),
};

const re = (r?: RegExp) => (r ? r.source : undefined);
const sceneOut = Object.fromEntries(Object.entries(scenes.SCENES as Record<string, any>).map(([id, s]) => {
  const missions = s.missions.map((m: any) => {
    if (!m.detect.spec) throw new Error(`Mission ${id}/${m.id} : détection non exportable`);
    return { id: m.id, fr: m.fr, example: m.example, requires: m.requires, reply: m.reply, detect: m.detect.spec };
  });
  return [id, { facts: s.facts, never: s.never.map(re), fallback: s.fallback, missions, extras: (s.extras ?? []).map((e: any) => ({ detect: re(e.detect), reply: e.reply })) }];
}));
const out = {
  regex: { clarify: re(scenes.CLARIFY), thanksOnly: re(scenes.THANKS_ONLY), bye: re(scenes.BYE) },
  heLevel: prompts.HE_LEVEL, heScene: prompts.HE_SCENE,
  scenarios: langs.SCENARIOS, goals: langs.GOALS, focus: langs.FOCUS,
  scenes: sceneOut,
  templates, rules,
  topics: topics.TOPICS.he,
  placement: (placement.PLACEMENT.he as any[]).map((q) => ({ ...q, pattern: re(q.pattern) })),
  course: course.COURSE,
  resources: { alphabet: res.ALPHABET, themes: res.THEMES, phrases: res.PHRASES, grammar: res.GRAMMAR },
};
writeFileSync(new URL("../mac/native/Resources/content.json", import.meta.url), JSON.stringify(out));
copyFileSync(new URL("../public/dict-fr-he.json", import.meta.url), new URL("../mac/native/Resources/dict-fr-he.json", import.meta.url));
console.log("content.json :", JSON.stringify(out).length, "octets,", Object.keys(sceneOut).length, "scènes,", out.placement.length, "questions");
