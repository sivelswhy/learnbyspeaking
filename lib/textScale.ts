"use client";
/** Taille du texte (réglage d'accessibilité) : change la taille de base, tout le reste suit (rem). */
export const TEXT_SCALES = { normal: 16, large: 18, xlarge: 20 } as const;
export type TextScale = keyof typeof TEXT_SCALES;
const KEY = "lbs.textScale";

export function getTextScale(): TextScale {
  try {
    const v = localStorage.getItem(KEY);
    if (v && v in TEXT_SCALES) return v as TextScale;
  } catch {
    /* stockage bloqué */
  }
  return "normal";
}

export function applyTextScale(s: TextScale = getTextScale()) {
  document.documentElement.style.fontSize = `${TEXT_SCALES[s]}px`;
}

export function setTextScale(s: TextScale) {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* stockage bloqué */
  }
  applyTextScale(s);
}
