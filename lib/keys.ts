"use client";
import { useEffect, useRef } from "react";

/** Barre d'espace = bouton principal de l'écran (parler / arrêter). Ignorée dans un champ de saisie ou sur un bouton ciblé. */
export function useSpaceKey(on: () => void, enabled = true) {
  const ref = useRef(on);
  useEffect(() => {
    ref.current = on;
  });
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest?.("input,textarea,select,button,a,[contenteditable],[role=button],[role=radio]")) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [enabled]);
}
