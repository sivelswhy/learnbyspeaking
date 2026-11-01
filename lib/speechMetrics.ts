/**
 * Analyse de la voix pendant le test de niveau : pauses, débit, temps de réaction.
 * Tout se calcule sur l'audio (16 kHz mono) déjà enregistré pour Whisper : rien n'est envoyé ailleurs.
 *
 * Détection de parole (VAD) à seuil adaptatif :
 *  1. énergie (dB) par trame de 20 ms ;
 *  2. plancher de bruit = 10e centile, plafond = 95e centile ;
 *  3. seuil haut (début de parole) et seuil bas (fin) entre les deux : hystérésis, pas de clignotement ;
 *  4. les trous de moins de 150 ms sont recollés (consonnes occlusives), les bouts de moins de 80 ms ignorés.
 */
export interface SpeechMetrics {
  /** Durée totale enregistrée (s). */
  duration: number;
  /** Temps de réaction : silence avant le premier mot (s). */
  latency: number;
  /** Durée réellement parlée (s). */
  speechTime: number;
  /** Du premier au dernier mot, silences compris (s). */
  span: number;
  /** Pauses entre deux groupes de mots (≥ 250 ms). */
  pauses: number;
  /** Pauses d'hésitation (≥ 700 ms). */
  longPauses: number;
  /** Part du temps passée en pause entre le premier et le dernier mot (0-1). */
  pauseRatio: number;
  /** Mots hébreux par minute de parole effective (hors pauses) ; null si le texte n'est pas connu. */
  wpm: number | null;
}

const FRAME = 320; // 20 ms à 16 kHz
const PAUSE_S = 0.25;
const LONG_PAUSE_S = 0.7;

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/** Segments de parole [début, fin] en secondes. */
export function detectSpeech(audio: Float32Array, rate = 16000): [number, number][] {
  const frame = Math.round((rate * 20) / 1000) || FRAME;
  const n = Math.floor(audio.length / frame);
  if (n < 5) return [];
  const db = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * frame; j < (i + 1) * frame; j++) s += audio[j] * audio[j];
    db[i] = 10 * Math.log10(s / frame + 1e-10);
  }
  const sorted = Array.from(db).sort((a, b) => a - b);
  const floor = pct(sorted, 0.1);
  const ceil = pct(sorted, 0.95);
  // Pas de vraie dynamique : silence ou bruit constant.
  if (ceil - floor < 8) return [];
  const hi = floor + 0.3 * (ceil - floor);
  const lo = floor + 0.18 * (ceil - floor);
  const segs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (start < 0 && db[i] > hi) start = i;
    else if (start >= 0 && db[i] < lo) {
      segs.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) segs.push([start, n]);
  const merged: [number, number][] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s[0] - last[1] < 7.5) last[1] = s[1]; // 150 ms
    else merged.push([s[0], s[1]]);
  }
  return merged.filter(([a, b]) => b - a >= 4).map(([a, b]) => [(a * frame) / rate, (b * frame) / rate]);
}

/** Mesures de fluidité. `words` : nombre de mots hébreux compris par Whisper. */
export function analyzeSpeech(audio: Float32Array, words: number | null, rate = 16000): SpeechMetrics | null {
  const segs = detectSpeech(audio, rate);
  if (!segs.length) return null;
  const duration = audio.length / rate;
  const first = segs[0][0];
  const last = segs[segs.length - 1][1];
  const span = last - first;
  let speechTime = 0;
  let pauseTime = 0;
  let pauses = 0;
  let longPauses = 0;
  segs.forEach(([a, b], i) => {
    speechTime += b - a;
    if (i === 0) return;
    const gap = a - segs[i - 1][1];
    if (gap >= PAUSE_S) {
      pauses++;
      pauseTime += gap;
      if (gap >= LONG_PAUSE_S) longPauses++;
    }
  });
  const spokenCore = Math.max(0.3, speechTime);
  return {
    duration,
    latency: first,
    speechTime,
    span,
    pauses,
    longPauses,
    pauseRatio: span > 0 ? Math.min(1, pauseTime / span) : 0,
    wpm: words !== null && words > 0 ? Math.round((words / spokenCore) * 60) : null,
  };
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Débit visé (mots/min de parole effective) selon le niveau de la question : un débutant n'a pas à parler vite. */
const TARGET_WPM: Record<string, number> = { A1: 55, A2: 75, B1: 95, B2: 115, C1: 125, C2: 135 };

export interface Fluency {
  score: number;
  /** Conseil prioritaire (le point le plus faible), ou null si tout va bien. */
  hint: string | null;
}

/**
 * Note de fluidité (0-100). null si la réponse est trop courte pour juger (moins de 3 mots ou 1 s de parole).
 *  30 % pauses · 25 % hésitations longues · 30 % débit · 15 % temps de réaction.
 */
export function fluencyScore(m: SpeechMetrics | null | undefined, words: number, level: string): Fluency | null {
  if (!m || words < 3 || m.speechTime < 1) return null;
  const pauseScore = clamp(100 * (1 - (m.pauseRatio - 0.08) / 0.42));
  const steadiness = clamp(100 - 18 * m.longPauses - 6 * Math.max(0, m.pauses - m.longPauses - 2));
  const rateScore = m.wpm === null ? pauseScore : clamp(100 * Math.min(1, m.wpm / (TARGET_WPM[level] ?? 90)));
  const latencyScore = m.latency <= 2 ? 100 : clamp(100 - (m.latency - 2) * 20);
  const score = clamp(0.3 * pauseScore + 0.25 * steadiness + 0.3 * rateScore + 0.15 * latencyScore);
  const parts: [number, string][] = [
    [pauseScore, "Tu fais beaucoup de pauses : prépare ta phrase en tête, puis dis-la d'un seul souffle."],
    [steadiness, "Tu t'arrêtes longtemps au milieu des phrases : remplace le silence par un petit mot (אממ, אז, כלומר)."],
    [rateScore, "Ton débit est lent : répète la phrase plusieurs fois à voix haute pour la rendre automatique."],
    [latencyScore, "Tu mets du temps à commencer : lance-toi avec une amorce (אני, אז, בעיקר) même sans phrase prête."],
  ];
  const worst = parts.reduce((a, b) => (b[0] < a[0] ? b : a));
  return { score, hint: worst[0] < 70 ? worst[1] : null };
}

/** Moyenne des notes de fluidité disponibles ; null si aucune réponse n'a pu être mesurée. */
export const avgFluency = (list: (number | null | undefined)[]): number | null => {
  const v = list.filter((x): x is number => typeof x === "number");
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
