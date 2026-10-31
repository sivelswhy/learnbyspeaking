"use client";
import { useState } from "react";
import { RiArrowDownSLine, RiArrowUpSLine, RiBookOpenFill, RiCheckLine, RiLockLine, RiPlayFill, RiRobot2Line, RiVolumeUpLine } from "react-icons/ri";
import { COURSE, courseLevelFor, type Day, type Unit } from "@/lib/content/course-he";
import { ALPHABET, GRAMMAR, PHRASES, THEMES, type Word } from "@/lib/content/resources-he";
import { LANGUAGES } from "@/lib/languages";
import { speak } from "@/lib/speech";
import type { CourseProgress, NewWord, Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { BackButton } from "./ui";

const dayDone = (p: CourseProgress, id: string) => !!(p[id]?.speaking && p[id]?.scenario);

export type ResourceTab = "alpha" | "vocab" | "phrases" | "grammar";

export function Cours({ profile, progress, openDay, addWords, startTab }: {
  profile: Profile; progress: CourseProgress; openDay: (d: Day) => void; addWords: (w: NewWord[]) => void;
  /** Ouvre directement une rubrique des ressources (ex. la grammaire depuis le hub). */
  startTab?: ResourceTab;
}) {
  const [seg, setSeg] = useState<"path" | "res">(startTab ? "res" : "path");
  const current = courseLevelFor(profile.level);
  const [open, setOpen] = useState<string | null>(current.id);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-line/60 p-1" role="tablist">
        {(["path", "res"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={seg === k} onClick={() => setSeg(k)} className={`min-h-10 rounded-full text-sm font-semibold ${seg === k ? "bg-card text-accent shadow-card" : "text-muted"}`}>
            {k === "path" ? "Parcours" : "Ressources"}
          </button>
        ))}
      </div>
      {seg === "res" ? <Resources profile={profile} addWords={addWords} startTab={startTab} /> : COURSE.map((lvl, n) => {
        const days = lvl.units.flatMap((u) => u.days);
        const done = days.filter((d) => dayDone(progress, d.id)).length;
        const isOpen = open === lvl.id;
        return (
          <div key={lvl.id} className="space-y-4">
            <button onClick={() => setOpen(isOpen ? null : lvl.id)} disabled={!lvl.units.length}
              className="flex w-full items-center gap-4 rounded-2xl border border-soft bg-card p-4 text-left shadow-card disabled:opacity-60">
              <Avatar size={56} />
              <span className="flex-1">
                <span className="block text-lg font-bold">{lvl.title}</span>
                <span className="block text-muted">{lvl.cefr} · {lvl.units.length ? `${done}/${days.length} jours` : "Bientôt disponible"}</span>
                {isOpen && n === 0 && <span className="block text-muted">Démarrage rapide</span>}
              </span>
              <span className="grid size-10 place-items-center rounded-full bg-soft text-accent">
                {!lvl.units.length ? <RiLockLine aria-hidden /> : isOpen ? <RiArrowUpSLine aria-hidden className="size-5" /> : <RiArrowDownSLine aria-hidden className="size-5" />}
              </span>
            </button>
            {isOpen && lvl.units.map((u, k) => <UnitPath key={u.id} unit={u} index={k + 1} progress={progress} openDay={openDay} />)}
          </div>
        );
      })}
    </div>
  );
}

function UnitPath({ unit, index, progress, openDay }: { unit: Unit; index: number; progress: CourseProgress; openDay: (d: Day) => void }) {
  const done = unit.days.filter((d) => dayDone(progress, d.id)).length;
  return (
    <div className="px-3">
      <div className="flex items-center gap-4 rounded-2xl border border-accent/15 bg-soft p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><RiBookOpenFill aria-hidden className="size-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Unité {index} · {unit.title}</span>
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-line"><span className="block h-full bg-accent" style={{ width: `${(done / unit.days.length) * 100}%` }} /></span>
          <span className="mt-2 inline-block rounded-full bg-accent/10 px-2.5 py-0.5 text-sm font-semibold text-accent">{done}/{unit.days.length}</span>
        </span>
      </div>
      <ol className="relative py-3">
        <span aria-hidden className="absolute inset-y-0 start-1/2 w-0.5 -translate-x-1/2 bg-line rtl:translate-x-1/2" />
        {unit.days.map((d, k) => {
          const p = progress[d.id];
          const complete = dayDone(progress, d.id);
          const left = k % 2 === 0;
          const card = (
            <button onClick={() => openDay(d)} className="flex w-full items-center gap-2 rounded-2xl border border-line bg-card p-3 text-left shadow-card active:scale-[0.98]">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Jour {k + 1}</span>
                <span className="block text-[15px] leading-snug">{d.title}</span>
                <span className="block text-sm text-muted">{complete ? "Terminé" : p ? "En cours" : "À apprendre"}</span>
              </span>
              <RiPlayFill aria-hidden className="size-5 shrink-0 text-accent" />
            </button>
          );
          return (
            <li key={d.id} className="relative grid grid-cols-[1fr_3.5rem_1fr] items-center py-3">
              <div>{left && card}</div>
              <span className={`z-[1] mx-auto grid size-12 place-items-center rounded-full border-4 border-bg ${complete ? "bg-good text-white" : "bg-line text-muted"}`}>
                {complete ? <RiCheckLine aria-hidden className="size-5" /> : <RiBookOpenFill aria-hidden className="size-5" />}
              </span>
              <div>{!left && card}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function DayScreen({ day, unitTitle, index, profile, progress, onBack, start }: {
  day: Day; unitTitle: string; index: number; profile: Profile; progress: CourseProgress; onBack: () => void; start: (a: "speaking" | "scenario") => void;
}) {
  const gnd = profile.gender ?? "m";
  const he = LANGUAGES[profile.target].rtl ? "he" : "";
  const p = progress[day.id] ?? {};
  const acts = [
    { id: "speaking" as const, title: "Entraînement à la parole", sub: `${day.steps.length} étapes · ~4 min`, Icon: RiPlayFill, color: "bg-gradient-to-br from-[#6d63ff] to-accent" },
    { id: "scenario" as const, title: "Jeu de rôle avec Noam", sub: "Conversation libre · ~5 min", Icon: RiRobot2Line, color: "bg-gradient-to-br from-[#f472b6] to-pink" },
  ];
  return (
    <div className="mx-auto max-w-lg">
      <div className="px-4 pt-3"><BackButton onClick={onBack} /></div>
      <div className="px-4 pb-8 text-center">
        <div className="flex justify-center"><Avatar size={120} /></div>
        <p className="mt-3 text-sm font-semibold text-muted">{unitTitle} · Jour {index}</p>
        <h1 className="text-2xl font-bold">{day.title}</h1>
        <p className={`${he} mt-2 text-xl`}>{day.key.he[gnd]}</p>
        <p className="text-sm text-muted">{day.key.tr[gnd]} — {day.key.fr}</p>
        <p className="mt-8 text-start font-semibold text-muted">2 activités</p>
        <div className="mt-2 rounded-2xl bg-card text-start shadow-card">
          {acts.map((a) => (
            <button key={a.id} onClick={() => start(a.id)} className="flex w-full items-center gap-3 p-4 text-left">
              <span className={`grid size-12 shrink-0 place-items-center rounded-full text-white ${a.color}`}><a.Icon aria-hidden className="size-6" /></span>
              <span className="flex-1">
                <span className="block font-medium">{a.title}</span>
                <span className="block text-sm text-muted">{a.sub}</span>
              </span>
              <span className={`grid size-10 place-items-center rounded-full ${p[a.id] ? "bg-good text-white" : "bg-line text-card"}`}><RiCheckLine aria-hidden /></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Resources({ profile, addWords, startTab }: { profile: Profile; addWords: (w: NewWord[]) => void; startTab?: ResourceTab }) {
  const [tab, setTab] = useState<ResourceTab>(startTab ?? "alpha");
  const [theme, setTheme] = useState(THEMES[0].id);
  const [added, setAdded] = useState<string[]>([]);
  const speech = LANGUAGES[profile.target].speech;
  const say = (t: string) => speak(t.replace(/[…/]/g, " "), speech, 0.8);
  const tabs = { alpha: "Alphabet", vocab: "Vocabulaire", phrases: "Phrases", grammar: "Grammaire" } as const;
  const save = (ws: Word[], id: string) => {
    addWords(ws.map((w) => ({ word: w.he, transliteration: w.tr, meaning: w.fr })));
    setAdded((a) => [...a, id]);
  };
  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
        {(Object.keys(tabs) as (keyof typeof tabs)[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`min-h-9 shrink-0 rounded-full border px-3 text-sm ${tab === k ? "border-accent bg-accent text-accent-ink" : "border-line bg-card"}`}>{tabs[k]}</button>
        ))}
      </div>
      {tab === "alpha" && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {ALPHABET.map((l) => (
            <button key={l.he} onClick={() => say(l.example.he)} className="rounded-2xl bg-card shadow-card p-3 text-center">
              <span className="he block text-4xl">{l.he}{l.final && <span className="text-2xl text-muted"> {l.final}</span>}</span>
              <span className="block text-sm font-semibold">{l.name}</span>
              <span className="block text-xs text-muted">{l.sound}</span>
              <span className="mt-1 block text-xs"><span className="he">{l.example.he}</span> · {l.example.fr}</span>
            </button>
          ))}
        </div>
      )}
      {tab === "vocab" && (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
            {THEMES.map((t) => (
              <button key={t.id} onClick={() => setTheme(t.id)} className={`min-h-9 shrink-0 rounded-full px-3 text-sm ${theme === t.id ? "bg-accent/15 font-semibold text-accent" : "bg-line/50"}`}>{t.title}</button>
            ))}
          </div>
          {THEMES.filter((t) => t.id === theme).map((t) => (
            <div key={t.id} className="space-y-2">
              <WordList words={t.words} say={say} />
              <button onClick={() => save(t.words, t.id)} disabled={added.includes(t.id)} className="min-h-11 w-full rounded-xl border border-accent text-sm font-medium text-accent disabled:opacity-50">
                {added.includes(t.id) ? "Ajouté à tes révisions ✓" : "Ajouter ces mots à mes révisions"}
              </button>
            </div>
          ))}
        </>
      )}
      {tab === "phrases" && <WordList words={PHRASES} say={say} />}
      {tab === "grammar" && GRAMMAR.map((g) => (
        <details key={g.id} className="rounded-2xl bg-card shadow-card p-3">
          <summary className="cursor-pointer font-semibold">{g.title}</summary>
          <p className="mt-2 text-sm">{g.rule}</p>
          <div className="mt-2"><WordList words={g.examples} say={say} /></div>
        </details>
      ))}
    </div>
  );
}

function WordList({ words, say }: { words: Word[]; say: (t: string) => void }) {
  return (
    <ul className="divide-y divide-line rounded-2xl bg-card shadow-card">
      {words.map((w) => (
        <li key={w.he + w.fr} className="flex items-center gap-3 px-3 py-2">
          <button onClick={() => say(w.he)} aria-label={`Écouter ${w.tr}`} className="grid size-9 shrink-0 place-items-center text-accent"><RiVolumeUpLine aria-hidden /></button>
          <span className="min-w-0 flex-1">
            <span className="he block text-lg">{w.he}</span>
            <span className="block text-xs text-muted">{w.tr}{w.note ? ` · ${w.note}` : ""}</span>
          </span>
          <span className="text-end text-sm">{w.fr}</span>
        </li>
      ))}
    </ul>
  );
}
