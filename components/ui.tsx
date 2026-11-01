"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { RiArrowLeftSLine } from "react-icons/ri";

export function Btn({
  variant = "solid",
  className = "",
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
  const v = {
    solid: "bg-accent text-accent-ink font-extrabold shadow-[0_4px_0_0_var(--accent-deep)] [--slice:var(--accent-deep)]",
    soft: "bg-soft text-accent font-bold shadow-[0_4px_0_0_var(--line-deep)] [--slice:var(--line-deep)]",
    ghost: "border-2 border-line bg-card text-ink font-bold shadow-[0_4px_0_0_var(--line-deep)] [--slice:var(--line-deep)]",
  }[variant];
  return (
    <button
      {...p}
      className={`slice-btn mb-1 min-h-11 rounded-2xl px-5 text-sm disabled:opacity-40 disabled:shadow-none ${v} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-card shadow-card p-4 ${className}`}>{children}</div>;
}

export function Chip({ active, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...p}
      className={`slice-btn mb-1 min-h-11 rounded-2xl border-2 px-3.5 text-sm font-bold ${
        active ? "border-accent bg-accent text-accent-ink shadow-[0_4px_0_0_var(--accent-deep)] [--slice:var(--accent-deep)]" : "border-line bg-card text-ink shadow-[0_4px_0_0_var(--line-deep)] [--slice:var(--line-deep)]"
      }`}
    >
      {children}
    </button>
  );
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 bg-bg/90 px-4 py-2 backdrop-blur lg:pt-5">
      {onBack && <BackButton onClick={onBack} />}
      <h1 className={`flex-1 truncate text-lg font-bold ${onBack ? "text-center" : ""}`}>{title}</h1>
      {right ?? (onBack && <span className="size-11 shrink-0" aria-hidden />)}
    </header>
  );
}

/** Flèche retour ronde, comme sur les écrans plein page. */
export function BackButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} aria-label="Retour" className={`grid size-11 shrink-0 place-items-center rounded-full bg-card text-xl shadow-card active:scale-95 ${className}`}>
      <RiArrowLeftSLine aria-hidden />
    </button>
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
