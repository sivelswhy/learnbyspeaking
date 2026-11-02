"use client";
import { useEffect, useRef } from "react";

/**
 * Barre d'espace = bouton principal de l'écran (parler / arrêter). Ignorée dans un champ de saisie, et sur un bouton
 * atteint au clavier (Tab) où elle garde son rôle normal. Un bouton simplement cliqué à la souris (« Traduire »…)
 * ne la capture plus : sinon l'espace relançait ce bouton au lieu du micro.
 */
export function useSpaceKey(on: () => void, enabled = true) {
  const ref = useRef(on);
  useEffect(() => {
    ref.current = on;
  });
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input,textarea,select,[contenteditable]")) return;
      if (el?.closest?.("button,a,[role=button],[role=radio]") && el.matches(":focus-visible")) return;
      e.preventDefault();
      if (el && el !== document.body) el.blur();
      ref.current();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [enabled]);
}
