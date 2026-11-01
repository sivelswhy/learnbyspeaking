"use client";
import { useState } from "react";
import { FOCUS, GOALS, type Focus, type Goal } from "@/lib/languages";
import type { PlacementResult, Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Btn, Chip } from "./ui";

/** Axes du test de niveau qui révèlent un point à travailler (score < 60). */
function weakFocus(r: PlacementResult | null): Focus[] {
  if (!r) return [];
  const map: [number | null | undefined, Focus][] = [
    [r.axes.grammar, "grammar"],
    [r.axes.vocabulary, "vocabulary"],
    [r.axes.development, "speaking"],
    [r.axes.relevance, "listening"],
  ];
  return map.filter(([v]) => v != null && v < 60).map(([, f]) => f);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

/** Après le test de niveau : objectif, points à améliorer, prénom et temps par jour. */
export function GoalSetup({ profile, placement, onDone }: { profile: Profile; placement: PlacementResult | null; onDone: (p: Profile) => void }) {
  const weak = weakFocus(profile.placementDone ? placement : null);
  const [goal, setGoal] = useState<Goal | null>(profile.focus ? profile.goal : null);
  const [focus, setFocus] = useState<Focus[]>(profile.focus ?? weak);
  const [name, setName] = useState(profile.name ?? "");
  const [minutes, setMinutes] = useState(profile.dailyMinutes);
  const toggle = (f: Focus) => setFocus((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  return (
    <main className="mx-auto max-w-lg lg:max-w-3xl space-y-6 px-4 pb-32 pt-8">
      <div>
        {profile.placementDone && (
          <p className="inline-flex items-center gap-2 rounded-full bg-soft px-3 py-1 text-sm font-semibold text-accent">Ton niveau : {profile.level}</p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Avatar size={72} mood="wink" className="pop-in shrink-0" />
          <h1 className="text-2xl font-extrabold">Qu&apos;est-ce qui te motive ?</h1>
        </div>
        <p className="mt-1 text-muted">Shuli adapte les conversations et le cours à ton objectif.</p>
      </div>

      <Section title="Ton objectif en hébreu">
        {(Object.keys(GOALS) as Goal[]).map((g) => (
          <Chip key={g} active={goal === g} aria-pressed={goal === g} onClick={() => setGoal(g)}>{GOALS[g]}</Chip>
        ))}
      </Section>

      <Section title="En quoi veux-tu t'améliorer ?"
        hint={weak.length ? `D'après ton test, à travailler en priorité : ${weak.map((f) => FOCUS[f].toLowerCase()).join(", ")}. Plusieurs choix possibles.` : "Plusieurs choix possibles."}>
        {(Object.keys(FOCUS) as Focus[]).map((f) => (
          <Chip key={f} active={focus.includes(f)} aria-pressed={focus.includes(f)} onClick={() => toggle(f)}>{FOCUS[f]}</Chip>
        ))}
      </Section>

      <section className="space-y-2">
        <label htmlFor="name" className="font-semibold">Ton prénom <span className="text-sm font-normal text-muted">(facultatif)</span></label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name"
          className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-base" placeholder="Ex. : Léa" />
      </section>

      <Section title="Temps par jour">
        {[5, 10, 15, 20, 30].map((m) => (
          <Chip key={m} active={minutes === m} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} min</Chip>
        ))}
      </Section>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        <Btn disabled={!goal || !focus.length} className="mx-auto block min-h-14 w-full max-w-lg lg:max-w-3xl text-base"
          onClick={() => goal && onDone({ ...profile, goal, focus, name: name.trim() || undefined, dailyMinutes: minutes, onboarding: undefined })}>
          {!goal ? "Choisis ton objectif" : !focus.length ? "Choisis au moins un point" : "C'est parti"}
        </Btn>
      </div>
    </main>
  );
}
