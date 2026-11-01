import type { VocabCard } from "./types";

/**
 * Révision espacée (famille SM-2, 4 notes).
 *  - ease : facilité du mot (2,5 au départ, entre 1,3 et 3) ; plus elle est haute, plus l'intervalle grandit vite.
 *  - ivl : intervalle courant en jours ; reps : réussites d'affilée ; lapses : oublis.
 *  - À revoir : retour dans 10 minutes (revu dans la même séance), facilité −0,2.
 *  - Difficile : intervalle ×1,2, facilité −0,15.  Bien : 1 j, puis 3 j, puis ×facilité.  Facile : ×facilité×1,3, facilité +0,15.
 * Les cartes de l'ancien système (boîtes de Leitner 0-4) gardent leur avancement : boîte → intervalle 0, 1, 3, 7, 21 jours.
 */
export type Grade = "again" | "hard" | "good" | "easy";

const LEITNER_DAYS = [0, 1, 3, 7, 21];
const DAY = 864e5;

type Srs = Pick<VocabCard, "box" | "due" | "ease" | "ivl" | "reps" | "lapses">;

/** Niveau de maîtrise 0-4 d'après l'intervalle (pour l'affichage). */
export const mastery = (ivl: number) => (ivl < 1 ? 0 : ivl < 3 ? 1 : ivl < 7 ? 2 : ivl < 21 ? 3 : 4);

export function schedule(card: Pick<VocabCard, "box" | "ease" | "ivl" | "reps" | "lapses">, grade: Grade, now = Date.now()): Srs {
  const ease0 = card.ease ?? 2.5;
  const ivl0 = card.ivl ?? LEITNER_DAYS[Math.max(0, Math.min(4, card.box))];
  const reps0 = card.reps ?? card.box;
  const lapses = card.lapses ?? 0;
  let ease = ease0;
  let ivl: number;
  let reps = reps0 + 1;
  let due: number;
  switch (grade) {
    case "again":
      ease = Math.max(1.3, ease0 - 0.2);
      ivl = 0;
      reps = 0;
      due = now + 10 * 60_000;
      return { box: 0, due: new Date(due).toISOString(), ease, ivl, reps, lapses: lapses + 1 };
    case "hard":
      ease = Math.max(1.3, ease0 - 0.15);
      ivl = reps0 === 0 ? 1 : Math.max(ivl0 + 1, Math.round(ivl0 * 1.2));
      break;
    case "good":
      ivl = reps0 === 0 ? 1 : reps0 === 1 ? 3 : Math.max(ivl0 + 1, Math.round(ivl0 * ease0));
      break;
    case "easy":
      ease = Math.min(3, ease0 + 0.15);
      ivl = reps0 === 0 ? 3 : Math.max(ivl0 + 2, Math.round(Math.max(ivl0, 1) * ease0 * 1.3));
      break;
  }
  due = now + ivl * DAY;
  return { box: mastery(ivl), due: new Date(due).toISOString(), ease, ivl, reps, lapses };
}

/** Cartes à réviser maintenant, les plus en retard et les plus fragiles d'abord. */
export function dueCards(vocab: VocabCard[], now = Date.now()): VocabCard[] {
  return vocab.filter((c) => new Date(c.due).getTime() <= now).sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime() || a.box - b.box);
}
