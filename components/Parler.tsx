"use client";
import { RiArrowRightSLine, RiBookOpenLine, RiFireLine, RiMicFill, RiQuestionAnswerLine, RiSearchLine, RiSpeedUpLine, RiTimeLine, RiTranslate2 } from "react-icons/ri";
import type { IconType } from "react-icons";
import { ALL_DAYS } from "@/lib/content/course-he";
import { SCENARIOS } from "@/lib/languages";
import type { CourseProgress, Profile, SessionRecord } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ScenarioIcon } from "./icons";
import { Header } from "./ui";

export function todaySeconds(sessions: SessionRecord[]) {
  const d = new Date().toDateString();
  return sessions.filter((s) => new Date(s.date).toDateString() === d).reduce((a, s) => a + s.seconds, 0);
}

export function streak(sessions: SessionRecord[]) {
  const days = new Set(sessions.map((s) => new Date(s.date).toDateString()));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function nextDay(progress: CourseProgress, level: string) {
  const pool = ALL_DAYS.filter((x) => x.level.cefr === level);
  const list = pool.length ? pool : ALL_DAYS;
  return list.find((x) => !(progress[x.day.id]?.speaking && progress[x.day.id]?.scenario)) ?? list[list.length - 1];
}

export function Parler({ profile, sessions, progress, go }: {
  profile: Profile; sessions: SessionRecord[]; progress: CourseProgress;
  go: (to: "hub" | "talk" | "scenarios" | "placement" | "translate" | "define" | "course" | "next") => void;
}) {
  const nd = nextDay(progress, profile.level);
  const lvlDays = ALL_DAYS.filter((x) => x.level.id === nd.level.id);
  const done = lvlDays.filter((x) => progress[x.day.id]?.speaking && progress[x.day.id]?.scenario).length;
  const minutes = Math.floor(todaySeconds(sessions) / 60);
  const chips: [IconType, string, string][] = [
    [RiFireLine, `${streak(sessions)} j`, "Jours d'affilée"],
    [RiTimeLine, `${minutes}/${profile.dailyMinutes} min`, "Aujourd'hui"],
    [RiSpeedUpLine, profile.level, "Ton niveau"],
  ];
  const cards: { to: "hub" | "scenarios" | "placement"; title: string; sub: string; Icon?: IconType }[] = [
    { to: "hub", title: "Parler avec Noa", sub: "Discussion libre, professeur, grammaire…" },
    { to: "scenarios", title: "Situations réelles", sub: "Restaurant, taxi, entretien…", Icon: RiQuestionAnswerLine },
    { to: "placement", title: "Test de niveau", sub: profile.placementDone ? "Refaire le test (3 min)" : "Découvre ton niveau en 3 min", Icon: RiSpeedUpLine },
  ];
  return (
    <div className="space-y-5 pb-24">
      <div className="flex gap-2">
        {chips.map(([I, v, label]) => (
          <span key={label} title={label} className="flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-semibold">
            <I aria-hidden className="text-accent" /> {v}
          </span>
        ))}
      </div>
      <p className="text-lg">Salut{profile.name ? ` ${profile.name}` : ""} ! Je suis Noa.</p>

      <div className="relative overflow-hidden rounded-3xl bg-accent p-5 text-accent-ink">
        <div className="absolute -end-2 -top-1 opacity-95"><Avatar size={96} /></div>
        <p className="text-sm font-medium opacity-80">{nd.level.title} · {nd.unit.title}</p>
        <h2 className="max-w-[65%] text-xl font-bold">Prochaine leçon : {nd.day.title}</h2>
        <div className="mt-3 h-1.5 max-w-[70%] overflow-hidden rounded-full bg-white/25"><div className="h-full bg-white" style={{ width: `${(done / lvlDays.length) * 100}%` }} /></div>
        <button onClick={() => go("course")} className="mt-3 flex min-h-9 items-center gap-1 rounded-full border border-white/60 px-3 text-xs font-semibold">
          <RiBookOpenLine aria-hidden /> Vue du cours <RiArrowRightSLine aria-hidden />
        </button>
        <button onClick={() => go("next")} className="mt-4 min-h-12 w-full rounded-2xl bg-white font-semibold text-accent active:scale-[0.99]">Démarrer</button>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">S&apos;entraîner à parler</h2>
        {cards.map((c) => (
          <button key={c.to} onClick={() => go(c.to)} className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 text-left shadow-sm active:scale-[0.99]">
            {c.Icon ? <span className="grid size-14 place-items-center rounded-full bg-accent/10 text-accent"><c.Icon aria-hidden className="size-7" /></span> : <Avatar size={56} />}
            <span className="flex-1">
              <span className="block font-semibold">{c.title}</span>
              <span className="block text-sm text-muted">{c.sub}</span>
            </span>
            <RiArrowRightSLine aria-hidden className="text-muted" />
          </button>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">Outils gratuits</h2>
        <div className="grid grid-cols-2 gap-2">
          {([["translate", "Traduction", "Avec prononciation", RiTranslate2], ["define", "Dictionnaire", "Sens, genre, exemples", RiSearchLine]] as const).map(([to, t, sub, I]) => (
            <button key={to} onClick={() => go(to)} className="flex min-h-24 flex-col justify-between rounded-2xl bg-card p-4 text-left shadow-sm">
              <span><span className="block font-semibold">{t}</span><span className="block text-xs text-muted">{sub}</span></span>
              <I aria-hidden className="size-7 self-end text-accent" />
            </button>
          ))}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-6">
        <button onClick={() => go("talk")} className="mx-auto flex min-h-14 w-full max-w-lg items-center gap-3 rounded-full border-2 border-accent bg-card px-2 text-left">
          <Avatar size={40} />
          <span className="flex-1 text-muted">Je suis Noa, ta tutrice d&apos;hébreu</span>
          <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-ink"><RiMicFill aria-hidden className="size-5" /></span>
        </button>
      </div>
    </div>
  );
}

export function ScenarioList({ onBack, start }: { onBack: () => void; start: (id: string) => void }) {
  return (
    <div className="mx-auto max-w-lg">
      <Header title="Situations réelles" onBack={onBack} />
      <div className="grid grid-cols-2 gap-2 p-4">
        {SCENARIOS.filter((s) => s.id !== "free").map((s) => (
          <button key={s.id} onClick={() => start(s.id)} className="rounded-2xl border border-line bg-card p-3 text-left active:scale-[0.98]">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><ScenarioIcon id={s.id} className="size-5" /></span>
            <span className="mt-2 block text-sm font-semibold">{s.title}</span>
            <span className="mt-0.5 block text-xs text-muted">{s.goal}</span>
            <span className="mt-2 block text-[11px] text-muted">{"●".repeat(s.difficulty)}<span className="opacity-30">{"●".repeat(3 - s.difficulty)}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}
