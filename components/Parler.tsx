"use client";
import { RiArrowRightSLine, RiCalendarCheckLine, RiCheckLine, RiFlashlightFill, RiLineChartLine, RiMicFill, RiQuestionAnswerLine, RiSearchLine, RiSpeedUpLine, RiTimeLine, RiTranslate2 } from "react-icons/ri";
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
  const doneAll = ALL_DAYS.filter((x) => progress[x.day.id]?.speaking && progress[x.day.id]?.scenario).length;
  const pct = Math.round((doneAll / ALL_DAYS.length) * 100);
  const minutes = Math.floor(todaySeconds(sessions) / 60);
  const chips: [IconType, string, string][] = [
    [RiCalendarCheckLine, `${streak(sessions)}`, "Jours d'affilée"],
    [RiTimeLine, `${minutes}/${profile.dailyMinutes}`, "Minutes aujourd'hui"],
    [RiLineChartLine, profile.level, "Ton niveau"],
  ];
  const cards: { to: "hub" | "scenarios" | "placement"; title: string; sub: string; Icon?: IconType; tint?: string }[] = [
    { to: "hub", title: "Parler avec Noa", sub: "Discussion libre, professeur, grammaire…" },
    { to: "scenarios", title: "Situations réelles", sub: "Restaurant, taxi, entretien…", Icon: RiQuestionAnswerLine, tint: "bg-gradient-to-br from-[#f472b6] to-pink" },
    { to: "placement", title: "Test de niveau", sub: profile.placementDone ? "Refaire le test · 3 min" : "Découvre ton niveau en 3 min", Icon: RiSpeedUpLine, tint: "bg-gradient-to-br from-[#6d63ff] to-accent" },
  ];
  return (
    <div className="space-y-6 pb-28">
      <div className="flex items-center gap-2">
        <button onClick={() => go("talk")} aria-label="Conversation rapide" className="grid size-11 place-items-center rounded-full bg-card shadow-card active:scale-95">
          <RiFlashlightFill aria-hidden className="size-5" />
        </button>
        <span className="flex-1" />
        {chips.map(([I, v, label]) => (
          <span key={label} title={label} aria-label={`${label} : ${v}`} className="flex min-h-11 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-bold shadow-card">
            <I aria-hidden className="size-[18px]" /> {v}
          </span>
        ))}
      </div>
      <p className="text-lg">Salut{profile.name ? ` ${profile.name}` : ""} ! Je suis Noa !</p>

      <div className="relative rounded-3xl bg-accent p-5 pt-6 text-accent-ink">
        <div className="pointer-events-none absolute -top-7 end-2"><Avatar size={104} /></div>
        <h2 className="max-w-[68%] text-xl font-bold leading-snug">Parle hébreu en {ALL_DAYS.length} jours</h2>
        <div className="relative mt-4 h-1 max-w-[74%] rounded-full bg-white/30">
          <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
          <span className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-accent rtl:translate-x-1/2" style={{ insetInlineStart: `${pct}%` }}>
            <RiCheckLine aria-hidden className="size-3.5" />
          </span>
        </div>
        <p className="mt-3 text-[15px] opacity-90">Prochaine leçon : {nd.day.title}</p>
        <button onClick={() => go("course")} className="mt-3 flex min-h-8 items-center gap-0.5 rounded-full border border-white/70 ps-3 pe-2 text-xs font-bold">
          Vue du cours <RiArrowRightSLine aria-hidden className="size-4" />
        </button>
        <button onClick={() => go("next")} className="mt-4 min-h-12 w-full rounded-full bg-white text-[17px] font-semibold text-accent active:scale-[0.99]">Démarrer</button>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">S&apos;entraîner à parler</h2>
        {cards.map((c) => (
          <button key={c.to} onClick={() => go(c.to)} className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 text-left shadow-card active:scale-[0.99]">
            {c.Icon ? <span className={`grid size-14 shrink-0 place-items-center rounded-full text-white ${c.tint}`}><c.Icon aria-hidden className="size-7" /></span> : <Avatar size={56} />}
            <span className="flex-1">
              <span className="block font-bold">{c.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{c.sub}</span>
            </span>
          </button>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Assistant gratuit</h2>
        <div className="grid grid-cols-2 gap-3">
          {([["translate", "Traduction", "Avec prononciation", RiTranslate2], ["define", "Dictionnaire", "Sens, genre, exemples", RiSearchLine]] as const).map(([to, t, sub, I]) => (
            <button key={to} onClick={() => go(to)} className="flex min-h-28 flex-col justify-between rounded-2xl bg-card p-4 text-left shadow-card active:scale-[0.99]">
              <span><span className="block font-bold">{t}</span><span className="mt-0.5 block text-xs text-muted">{sub}</span></span>
              <span className="grid size-10 place-items-center self-end rounded-xl bg-soft text-accent"><I aria-hidden className="size-6" /></span>
            </button>
          ))}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-6">
        <button onClick={() => go("hub")} className="mx-auto flex min-h-14 w-full max-w-lg items-center gap-3 rounded-full border-[1.5px] border-accent bg-card ps-2 pe-2 text-left shadow-card">
          <Avatar size={40} />
          <span className="flex-1 truncate text-muted">Je suis Noa, ta tutrice d&apos;hébreu</span>
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
          <button key={s.id} onClick={() => start(s.id)} className="rounded-2xl bg-card shadow-card p-3 text-left active:scale-[0.98]">
            <span className="grid size-10 place-items-center rounded-xl bg-soft text-accent"><ScenarioIcon id={s.id} className="size-5" /></span>
            <span className="mt-2 block text-sm font-semibold">{s.title}</span>
            <span className="mt-0.5 block text-xs text-muted">{s.goal}</span>
            <span className="mt-2 block text-[11px] text-muted">{"●".repeat(s.difficulty)}<span className="opacity-30">{"●".repeat(3 - s.difficulty)}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}
