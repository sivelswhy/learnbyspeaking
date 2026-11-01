import type { SessionRecord } from "./types";

const dayKey = (d: Date) => d.toDateString();

export function todaySeconds(sessions: SessionRecord[]) {
  const d = dayKey(new Date());
  return sessions.filter((s) => dayKey(new Date(s.date)) === d).reduce((a, s) => a + s.seconds, 0);
}

export interface Streak {
  /** Jours de pratique d'affilée (les jours « gelés » ne comptent pas mais ne cassent pas la série). */
  days: number;
  /** Un jour manqué a été pardonné dans la série en cours. */
  frozen: boolean;
  /** Il reste à pratiquer aujourd'hui pour garder la série. */
  atRisk: boolean;
}

/**
 * Série de jours d'affilée avec « gel » : un seul jour manqué est pardonné par période de 7 jours,
 * à condition que la veille de ce jour ait été pratiquée. Évite de tout perdre pour un jour de maladie.
 */
export function streakInfo(sessions: SessionRecord[], now = new Date()): Streak {
  const active = new Set(sessions.map((s) => dayKey(new Date(s.date))));
  const d = new Date(now);
  const practicedToday = active.has(dayKey(d));
  if (!practicedToday) d.setDate(d.getDate() - 1);
  let days = 0;
  let i = 0;
  let lastFreeze = -99;
  let frozen = false;
  for (;;) {
    const cur = new Date(d);
    cur.setDate(cur.getDate() - i);
    if (active.has(dayKey(cur))) {
      days++;
    } else {
      const before = new Date(cur);
      before.setDate(before.getDate() - 1);
      if (i - lastFreeze >= 7 && days > 0 && active.has(dayKey(before))) {
        lastFreeze = i;
        frozen = true;
      } else break;
    }
    i++;
    if (i > 3650) break;
  }
  return { days, frozen, atRisk: days > 0 && !practicedToday };
}

export const streak = (sessions: SessionRecord[]) => streakInfo(sessions).days;

export interface WeekStats {
  minutes: number;
  prevMinutes: number;
  activeDays: number;
  sessions: number;
  /** Meilleur score de la semaine (séances notées), ou null. */
  best: number | null;
}

/** Bilan des 7 derniers jours, comparé aux 7 précédents. */
export function weekStats(sessions: SessionRecord[], now = new Date()): WeekStats {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - 7);
  const inWeek = sessions.filter((s) => new Date(s.date) >= start);
  const prev = sessions.filter((s) => new Date(s.date) >= prevStart && new Date(s.date) < start);
  const scores = inWeek.map((s) => s.report?.score).filter((x): x is number => typeof x === "number");
  return {
    minutes: Math.round(inWeek.reduce((a, s) => a + s.seconds, 0) / 60),
    prevMinutes: Math.round(prev.reduce((a, s) => a + s.seconds, 0) / 60),
    activeDays: new Set(inWeek.map((s) => dayKey(new Date(s.date)))).size,
    sessions: inWeek.length,
    best: scores.length ? Math.max(...scores) : null,
  };
}
