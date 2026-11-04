import { ALL_DAYS, COURSE, courseLevelFor, pathFor, type CourseLevel, type Day, type Unit } from "./content/course-he";
import { LEVEL_B } from "./adaptive";
import { targetLevelOf } from "./languages";
import type { CourseProgress, PlacementResult, Profile } from "./types";

/**
 * Plan de cours sur mesure : combien de jours il faut vraiment à CET apprenant.
 *
 * 1. Chemin de base : les jours de son niveau jusqu'au niveau qu'il vise (`pathFor`).
 * 2. Maîtrise de chaque unité : le test de niveau (réponses notées par l'IA : pertinence, grammaire, développement, vocabulaire)
 *    donne une compétence `theta` sur l'échelle de la TRI (lib/adaptive.ts). Une unité a une difficulté `b` : celle de son niveau,
 *    décalée selon sa place dans le niveau (les premières unités sont plus faciles). Probabilité de maîtrise = sigmoïde(1,6 × (theta − b)).
 * 3. Décision par unité : maîtrise ≥ 0,90 → « acquis » (on la saute) ; ≥ 0,65 → « accéléré » (révision + les jours les plus productifs,
 *    40 % des jours) ; sinon « complet ». Sans test de niveau, rien n'est sauté.
 * 4. Durée : minutes estimées par jour (0,8 min par étape), séances = minutes / objectif quotidien.
 * 5. Mise à jour en continu : les jours terminés sortent du « reste à faire », et la fluidité mesurée sur les derniers jours faits
 *    corrige la compétence (± 0,4) : un élève qui réussit mieux que prévu voit s'accélérer les unités à venir, un élève en difficulté
 *    garde des unités complètes. Les jours déjà faits ne disparaissent jamais du plan.
 */
export type UnitStatus = "acquis" | "accéléré" | "complet";
export interface UnitPlan { unit: Unit; level: CourseLevel; mastery: number; status: UnitStatus; days: Day[] }
export interface DayRef { level: CourseLevel; unit: Unit; day: Day }
export interface CoursePlan {
  units: UnitPlan[]; days: DayRef[]; minutes: number; sessions: number; skipped: number;
  /** Ce qu'il reste à faire : jours non terminés, minutes et séances. */
  remaining: DayRef[]; remainingMinutes: number; remainingSessions: number; doneCount: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const ACQUIS = 0.9, ACCELERE = 0.65, SLOPE = 1.6, KEEP = 0.4, MIN_PER_STEP = 0.8;

/** Probabilité que l'apprenant maîtrise déjà une unité (compétence `theta`, niveau de l'unité, place dans le niveau entre 0 et 1). */
export function unitMastery(theta: number, cefr: string, pos: number): number {
  const b = (LEVEL_B[cefr as keyof typeof LEVEL_B] ?? 0) + (pos - 0.5) * 1.0;
  return sigmoid(SLOPE * (theta - b));
}

const production = (d: Day) => d.steps.filter((s) => s.kind === "free" || s.kind === "answer" || s.kind === "fill" || s.kind === "swap").length;

/** Jours gardés d'une unité « accélérée » : la révision d'unité et les jours qui font le plus produire, dans l'ordre du cours. */
export function acceleratedDays(unit: Unit): Day[] {
  const want = Math.max(2, Math.ceil(unit.days.length * KEEP));
  const keep = new Set<string>(unit.days.filter((d) => d.id.endsWith("r")).map((d) => d.id));
  const rest = unit.days.filter((d) => !keep.has(d.id)).sort((a, b) => production(b) - production(a));
  for (const d of rest) if (keep.size < want) keep.add(d.id);
  return unit.days.filter((d) => keep.has(d.id));
}

export const isDone = (progress: CourseProgress | undefined, id: string) => !!(progress?.[id]?.speaking && progress?.[id]?.scenario);

/** Correction de la compétence d'après la fluidité des cinq derniers jours terminés (60 = neutre) : entre −0,4 et +0,4. */
export function performanceShift(progress?: CourseProgress): number {
  const f = Object.values(progress ?? {}).filter((p) => p.speaking && p.scenario && typeof p.fluency === "number").map((p) => p.fluency as number).slice(-5);
  if (f.length < 3) return 0;
  const avg = f.reduce((a, b) => a + b, 0) / f.length;
  return Math.max(-0.4, Math.min(0.4, (avg - 60) / 100));
}

export function planCourse(profile: Pick<Profile, "level" | "targetLevel" | "dailyMinutes">, placement?: Pick<PlacementResult, "theta" | "confidence"> | null, progress?: CourseProgress): CoursePlan {
  const target = targetLevelOf(profile);
  const path = pathFor(profile.level, target);
  const levels = new Set(path.map((x) => x.level.id));
  // Compétence estimée, ramenée vers le niveau choisi quand la fiabilité est faible.
  let theta: number | null = null;
  if (typeof placement?.theta === "number") {
    const conf = Math.max(0, Math.min(100, placement.confidence ?? 60)) / 100;
    const prior = LEVEL_B[courseLevelFor(profile.level).cefr as keyof typeof LEVEL_B] ?? 0;
    theta = conf * placement.theta + (1 - conf) * prior + performanceShift(progress);
  }
  const units: UnitPlan[] = [];
  for (const level of COURSE) {
    if (!levels.has(level.id)) continue;
    level.units.forEach((unit, k) => {
      const mastery = theta === null ? 0 : unitMastery(theta, level.cefr, (k + 0.5) / level.units.length);
      const status: UnitStatus = mastery >= ACQUIS ? "acquis" : mastery >= ACCELERE ? "accéléré" : "complet";
      // Un jour déjà fait reste dans le plan, même si l'unité devient « acquise » ou « accélérée » entre-temps.
      const base = status === "acquis" ? [] : status === "accéléré" ? acceleratedDays(unit) : unit.days;
      const kept = unit.days.filter((d) => base.includes(d) || isDone(progress, d.id));
      units.push({ unit, level, mastery, status, days: kept });
    });
  }
  const days: DayRef[] = units.flatMap((u) => u.days.map((day) => ({ level: u.level, unit: u.unit, day })));
  const minutes = Math.round(days.reduce((a, x) => a + x.day.steps.length * MIN_PER_STEP, 0));
  const sessions = Math.max(1, Math.ceil(minutes / Math.max(5, profile.dailyMinutes || 10)));
  const remaining = days.filter((x) => !isDone(progress, x.day.id));
  const remainingMinutes = Math.round(remaining.reduce((a, x) => a + x.day.steps.length * MIN_PER_STEP, 0));
  const per = Math.max(5, profile.dailyMinutes || 10);
  return { units, days, minutes, sessions, skipped: path.length - days.length, remaining, remainingMinutes, remainingSessions: remaining.length ? Math.max(1, Math.ceil(remainingMinutes / per)) : 0, doneCount: days.length - remaining.length };
}

/** Prochain jour du plan non terminé (le dernier si tout est fait). */
export function nextPlanDay(plan: CoursePlan, done: (id: string) => boolean): DayRef {
  return plan.days.find((x) => !done(x.day.id)) ?? plan.days[plan.days.length - 1] ?? ALL_DAYS[0];
}
