"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Btn({
  variant = "solid",
  className = "",
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
  const v = {
    solid: "bg-accent text-accent-ink font-semibold",
    soft: "bg-accent/10 text-accent font-medium",
    ghost: "border border-line text-ink",
  }[variant];
  return (
    <button
      {...p}
      className={`min-h-11 rounded-xl px-4 text-sm transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${v} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-card p-4 ${className}`}>{children}</div>;
}

export function Chip({ active, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...p}
      className={`min-h-11 rounded-xl border px-3.5 text-sm transition ${
        active ? "border-accent bg-accent text-accent-ink font-semibold" : "border-line bg-card text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur">
      {onBack && (
        <button onClick={onBack} aria-label="Retour" className="-ml-2 grid size-11 place-items-center text-xl">
          ←
        </button>
      )}
      <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
      {right}
    </header>
  );
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** Part des mots attendus retrouvés dans ce que la reconnaissance vocale a compris. */
export function wordMatch(expected: string, heard: string): number {
  const e = norm(expected).split(" ").filter(Boolean);
  const h = new Set(norm(heard).split(" "));
  if (!e.length) return 0;
  return Math.round((e.filter((w) => h.has(w)).length / e.length) * 100);
}
