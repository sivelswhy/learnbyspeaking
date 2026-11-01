"use client";
import { useState } from "react";
import { FOCUS, GOALS, LANGUAGES, LEVELS, NATIVE_LANGS, TARGET_LANGS, type Focus, type Goal, type Level } from "@/lib/languages";
import type { Profile } from "@/lib/types";
import { RiSpeakLine } from "react-icons/ri";
import { Btn, Chip } from "./ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

export function Onboarding({ initial, onDone }: { initial?: Profile | null; onDone: (p: Profile) => void }) {
  const [p, setP] = useState<Profile>(
    initial ?? { native: "fr", target: TARGET_LANGS[0], level: "A1", goal: "travel", dailyMinutes: 10 },
  );
  return (
    <main className="mx-auto max-w-lg lg:max-w-3xl space-y-6 px-4 py-8">
      <div>
        <span className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-ink"><RiSpeakLine aria-hidden className="size-8" /></span>
        <h1 className="mt-2 text-3xl font-bold">Apprends en parlant</h1>
        <p className="mt-1 text-muted">Règle ton profil : tout (niveau du tuteur, vocabulaire, scénarios) s&apos;adapte.</p>
      </div>
      <section className="space-y-2">
        <label htmlFor="name" className="text-sm font-semibold text-muted">Ton prénom</label>
        <input id="name" value={p.name ?? ""} onChange={(e) => setP({ ...p, name: e.target.value })} autoComplete="given-name"
          className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-base" placeholder="Ex. : Léa" />
      </section>
      <Section title="Ta langue maternelle">
        {NATIVE_LANGS.map((l) => (
          <Chip key={l} active={p.native === l} onClick={() => setP({ ...p, native: l })}>
            {LANGUAGES[l].name}
          </Chip>
        ))}
      </Section>
      <Section title="Langue à apprendre">
        {TARGET_LANGS.map((l) => (
          <Chip key={l} active={p.target === l} onClick={() => setP({ ...p, target: l })}>
            {LANGUAGES[l].name} <span className="he ms-1">{LANGUAGES[l].native}</span>
          </Chip>
        ))}
      </Section>
      {LANGUAGES[p.target].genderedYou && (
        <Section title={`En ${LANGUAGES[p.target].name.toLowerCase()}, on s'adresse à toi au…`}>
          <Chip active={p.gender !== "f"} onClick={() => setP({ ...p, gender: "m" })}>Masculin</Chip>
          <Chip active={p.gender === "f"} onClick={() => setP({ ...p, gender: "f" })}>Féminin</Chip>
        </Section>
      )}
      <Section title="Ton niveau">
        {LEVELS.map((l: Level) => (
          <Chip key={l} active={p.level === l} onClick={() => setP({ ...p, level: l })}>
            {l}
          </Chip>
        ))}
      </Section>
      <Section title="Ton objectif">
        {(Object.keys(GOALS) as Goal[]).map((g) => (
          <Chip key={g} active={p.goal === g} onClick={() => setP({ ...p, goal: g })}>
            {GOALS[g]}
          </Chip>
        ))}
      </Section>
      <Section title="À améliorer">
        {(Object.keys(FOCUS) as Focus[]).map((f) => {
          const on = p.focus?.includes(f) ?? false;
          return (
            <Chip key={f} active={on} aria-pressed={on} onClick={() => setP({ ...p, focus: on ? p.focus!.filter((x) => x !== f) : [...(p.focus ?? []), f] })}>
              {FOCUS[f]}
            </Chip>
          );
        })}
      </Section>
      <Section title="Temps par jour">
        {[5, 10, 15, 20, 30].map((m) => (
          <Chip key={m} active={p.dailyMinutes === m} onClick={() => setP({ ...p, dailyMinutes: m })}>
            {m} min
          </Chip>
        ))}
      </Section>
      <Btn onClick={() => onDone(p)} className="w-full">
        Commencer
      </Btn>
    </main>
  );
}
