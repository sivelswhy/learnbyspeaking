import type { Level } from "./languages";

/**
 * Test adaptatif (CAT, test informatisé adaptatif) : la compétence θ de l'apprenant est estimée en continu
 * et chaque question est choisie pour être la plus informative à cet instant.
 *
 *  - Modèle : réussite P(θ, b) = sigmoïde(a·(θ − b)), b = difficulté de la question (échelle logit).
 *  - Estimation : posterior bayésien sur une grille de θ (prior normal), mis à jour à chaque réponse. La note
 *    s ∈ [0,1] est vue comme la réussite attendue plus un bruit de notation (σ = 0,2, IA et voix comprises) :
 *    L ∝ exp(−(s − P)² / 2σ²).
 *  - Sélection : question non posée qui maximise l'information de Fisher I = (a·P·(1−P))² au θ courant,
 *    avec un petit bruit déterministe pour ne pas toujours proposer la même séquence.
 *  - Arrêt : le niveau estimé a au moins 85 % de probabilité (masse du posterior dans sa tranche de θ) après
 *    4 questions, ou 8 questions au plus.
 */
export interface Item {
  /** Difficulté (logit). */
  b: number;
  /** Pouvoir discriminant. */
  a: number;
}

/** Difficulté de référence par niveau CEFR. */
export const LEVEL_B: Record<Level, number> = { A1: -2, A2: -0.7, B1: 0.6, B2: 1.9, C1: 3, C2: 4 };

const GRID = Array.from({ length: 81 }, (_, i) => -4 + i * 0.1);
const PRIOR_MEAN = -0.7; // on part de A2 : la plupart des apprenants s'y trouvent
const PRIOR_SD = 1.5;

export const MIN_QUESTIONS = 4;
export const MAX_QUESTIONS = 8;
const STOP_PROB = 0.85;

const SIGMA = 0.2;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export interface Estimate {
  theta: number;
  sd: number;
  /** Probabilité de chaque θ de la grille (somme = 1). */
  post: number[];
}

const normalize = (p: number[]) => {
  const s = p.reduce((a, b) => a + b, 0) || 1;
  return p.map((x) => x / s);
};

function summarize(post: number[]): Estimate {
  const theta = post.reduce((a, p, i) => a + p * GRID[i], 0);
  const sd = Math.sqrt(post.reduce((a, p, i) => a + p * (GRID[i] - theta) ** 2, 0));
  return { theta, sd, post };
}

export function prior(): Estimate {
  return summarize(normalize(GRID.map((t) => Math.exp(-0.5 * ((t - PRIOR_MEAN) / PRIOR_SD) ** 2))));
}

/** Met à jour l'estimation avec la note `s` (0-1) obtenue à une question. */
export function update(est: Estimate, item: Item, s: number): Estimate {
  const sc = Math.max(0, Math.min(1, s));
  const post = est.post.map((p, i) => {
    const P = sigmoid(item.a * (GRID[i] - item.b));
    return p * Math.exp(-((sc - P) ** 2) / (2 * SIGMA * SIGMA));
  });
  return summarize(normalize(post));
}

/** Estimation à partir d'une liste de réponses déjà données. */
export function estimateFrom(answers: { item: Item; s: number }[]): Estimate {
  return answers.reduce((e, x) => update(e, x.item, x.s), prior());
}

/** Information de Fisher d'une question au niveau θ. */
export const information = (item: Item, theta: number) => {
  const P = sigmoid(item.a * (theta - item.b));
  return (item.a * P * (1 - P)) ** 2;
};

/** Indice de la prochaine question parmi `pool` (déjà filtré : questions non posées). -1 si vide. */
export function pickNext(est: Estimate, pool: Item[], seed = 0): number {
  let best = -1;
  let bestScore = -Infinity;
  pool.forEach((it, i) => {
    // bruit déterministe ≤ 4 % : départage les questions presque équivalentes
    const noise = 0.04 * Math.abs(Math.sin((i + 1) * 12.9898 + seed * 78.233));
    const sc = information(it, est.theta) * (1 + noise);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  });
  return best;
}

/** Frontières entre niveaux : milieu entre les difficultés de référence. */
const CUTS: [Level, number][] = [["A1", -1.35], ["A2", -0.05], ["B1", 1.25]];

export function levelOf(theta: number): Level {
  for (const [lv, cut] of CUTS) if (theta < cut) return lv;
  return "B2"; // la banque de questions s'arrête à B2
}

/** Probabilité (0-1) que le niveau estimé soit le bon : masse du posterior qui tombe dans sa tranche de θ. */
export function levelProb(est: Estimate): number {
  const lv = levelOf(est.theta);
  return est.post.reduce((a, p, i) => a + (levelOf(GRID[i]) === lv ? p : 0), 0);
}

export function shouldStop(est: Estimate, asked: number): boolean {
  return asked >= MAX_QUESTIONS || (asked >= MIN_QUESTIONS && levelProb(est) >= STOP_PROB);
}

/** Fiabilité affichée (0-100) : probabilité que le niveau annoncé soit le bon. */
export const confidence = (est: Estimate) => Math.round(levelProb(est) * 100);
