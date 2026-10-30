/**
 * iPhone / iPad (y compris l'iPad qui se présente comme un Mac) : Safari y recharge la page
 * au-delà d'environ 1,5 à 2 Go, alors on y charge moins de modèles par défaut.
 */
export function lowMemoryDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return ios || (mem !== undefined && mem <= 4);
}
