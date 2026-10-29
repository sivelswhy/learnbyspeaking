"use client";
import { GOALS, LANGUAGES, SCENARIOS } from "@/lib/languages";
import type { Profile, SessionRecord, VocabCard } from "@/lib/types";
import { Card } from "./ui";

export type View = "home" | "chat" | "progress" | "vocab" | "settings";

const LVL = { A1: 1, A2: 1, B1: 2, B2: 2, C1: 3, C2: 3 } as const;

export function todaySeconds(sessions: SessionRecord[]) {
  const d = new Date().toDateString();
  return sessions.filter((s) => new Date(s.date).toDateString() === d).reduce((a, s) => a + s.seconds, 0);
}

export function Home({
  profile,
  sessions,
  vocab,
  go,
  start,
}: {
  profile: Profile;
  sessions: SessionRecord[];
  vocab: VocabCard[];
  go: (v: View) => void;
  start: (scenarioId: string) => void;
}) {
  const t = LANGUAGES[profile.target];
  const done = Math.min(100, Math.round((todaySeconds(sessions) / 60 / profile.dailyMinutes) * 100));
  const due = vocab.filter((c) => new Date(c.due) <= new Date()).length;
  const maxDiff = LVL[profile.level];
  const tiles: { v: View; emoji: string; title: string; sub: string }[] = [
    { v: "vocab", emoji: "🗂️", title: "Vocabulaire", sub: due ? `${due} à réviser` : `${vocab.length} mots` },
    { v: "progress", emoji: "📈", title: "Progression", sub: `${sessions.length} sessions` },
    { v: "settings", emoji: "⚙️", title: "Réglages", sub: "Profil et IA" },
  ];
  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {t.name} <span className="he text-xl font-normal text-muted">{t.native}</span>
          </h1>
          <p className="text-sm text-muted">
            Niveau {profile.level} · {GOALS[profile.goal]}
          </p>
        </div>
      </div>

      <button
        onClick={() => start("free")}
        className="flex w-full items-center gap-4 rounded-2xl bg-accent p-5 text-left text-accent-ink shadow-sm active:scale-[0.99]"
      >
        <span className="grid size-14 place-items-center rounded-full bg-white/20 text-3xl">🎙️</span>
        <span>
          <span className="block text-lg font-bold">Parler avec le tuteur IA</span>
          <span className="block text-sm opacity-80">Discussion libre, à la voix ou à l&apos;écrit</span>
        </span>
      </button>

      <Card>
        <div className="flex justify-between text-sm">
          <span className="font-medium">Objectif du jour</span>
          <span className="text-muted">
            {Math.floor(todaySeconds(sessions) / 60)} / {profile.dailyMinutes} min
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-good transition-all" style={{ width: `${done}%` }} />
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((x) => (
          <button key={x.v} onClick={() => go(x.v)} className="rounded-2xl border border-line bg-card p-3 text-left active:scale-[0.98]">
            <span className="text-2xl">{x.emoji}</span>
            <span className="mt-1 block text-sm font-semibold">{x.title}</span>
            <span className="block text-xs text-muted">{x.sub}</span>
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Situations réelles</h2>
        <div className="grid grid-cols-2 gap-2">
          {SCENARIOS.filter((s) => s.id !== "free").map((s) => (
            <button key={s.id} onClick={() => start(s.id)} className="rounded-2xl border border-line bg-card p-3 text-left active:scale-[0.98]">
              <span className="text-3xl">{s.emoji}</span>
              <span className="mt-1 block text-sm font-semibold">{s.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{s.goal}</span>
              <span className="mt-2 flex items-center gap-1 text-[11px] text-muted">
                {"●".repeat(s.difficulty)}
                <span className="opacity-30">{"●".repeat(3 - s.difficulty)}</span>
                {s.difficulty > maxDiff && <span className="ms-1 text-warn">difficile</span>}
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
