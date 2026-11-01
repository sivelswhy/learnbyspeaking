"use client";
import { useState } from "react";
import { SCENARIOS } from "@/lib/languages";
import type { Profile, SessionRecord } from "@/lib/types";
import { Avatar } from "./Avatar";
import { streakInfo, weekStats } from "@/lib/streak";
import { Report } from "./Report";
import { ScenarioIcon } from "./icons";
import { Card, Header } from "./ui";

export function Progress({ profile, sessions, rtl, onBack }: { profile: Profile; sessions: SessionRecord[]; rtl: boolean; onBack?: () => void }) {
  const [open, setOpen] = useState<SessionRecord | null>(null);
  if (open) return <Report s={open} rtl={rtl} onClose={() => setOpen(null)} />;

  const wk = weekStats(sessions);
  const scored = sessions.filter((s) => s.report).slice(-12);
  const total = sessions.reduce((a, s) => a + s.seconds, 0);
  const cats = new Map<string, number>();
  sessions.flatMap((s) => s.corrections).forEach((c) => cats.set(c.category, (cats.get(c.category) ?? 0) + 1));
  const W = 320, H = 110;
  const pts = scored.map((s, i) => [scored.length === 1 ? W / 2 : (i / (scored.length - 1)) * (W - 20) + 10, H - 10 - ((s.report!.score) / 100) * (H - 20)]);

  // temps par jour, 7 derniers jours
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const sec = sessions.filter((s) => new Date(s.date).toDateString() === d.toDateString()).reduce((a, s) => a + s.seconds, 0);
    return { label: d.toLocaleDateString("fr-FR", { weekday: "short" }), min: sec / 60 };
  });
  const maxMin = Math.max(profile.dailyMinutes, ...week.map((w) => w.min));

  return (
    <div className="mx-auto max-w-lg lg:max-w-3xl">
      <Header title="Progression" onBack={onBack} />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Card><p className="text-2xl font-bold">{streakInfo(sessions).days}</p><p className="text-xs text-muted">jours d&apos;affilée</p></Card>
          <Card><p className="text-2xl font-bold">{Math.round(total / 60)}</p><p className="text-xs text-muted">min de pratique</p></Card>
          <Card><p className="text-2xl font-bold">{sessions.length}</p><p className="text-xs text-muted">sessions</p></Card>
        </div>
        <Card className="flex items-center gap-4">
          <Avatar size={64} mood={wk.minutes >= profile.dailyMinutes * 3 ? "cheer" : wk.minutes > 0 ? "happy" : "sad"} className="shrink-0" />
          <div className="text-sm">
            <h2 className="font-bold">Bilan de la semaine</h2>
            <p>{wk.minutes} min · {wk.activeDays} jour{wk.activeDays > 1 ? "s" : ""} sur 7 · {wk.sessions} séance{wk.sessions > 1 ? "s" : ""}{wk.best !== null ? ` · meilleur score ${wk.best}` : ""}</p>
            <p className="text-muted">{wk.prevMinutes === 0 ? (wk.minutes ? "Beau début !" : "Une petite séance aujourd'hui ?") : wk.minutes >= wk.prevMinutes ? `+${wk.minutes - wk.prevMinutes} min par rapport à la semaine dernière.` : `${wk.minutes - wk.prevMinutes} min par rapport à la semaine dernière : tu peux rattraper.`}</p>
            {streakInfo(sessions).frozen && <p className="text-xs text-muted">Un jour manqué a été pardonné : ta série continue.</p>}
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Cette semaine (min)</h2>
          <div className="flex h-28 items-end gap-2" role="img" aria-label="Minutes de pratique par jour">
            {week.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-20 w-full items-end"><div className="w-full rounded-t bg-accent" style={{ height: `${(w.min / maxMin) * 100}%`, minHeight: w.min ? 3 : 0 }} /></div>
                <span className="text-[11px] text-muted">{w.label}</span>
              </div>
            ))}
          </div>
        </Card>
        {scored.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Score des sessions</h2>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Évolution du score">
              <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={pts.map((p) => p.join(",")).join(" ")} />
              {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="var(--accent)" />)}
            </svg>
          </Card>
        )}
        {cats.size > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Erreurs fréquentes</h2>
            {[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="text-muted">{n}</span></div>
            ))}
          </Card>
        )}
        <h2 className="font-semibold">Historique</h2>
        {sessions.length === 0 && <p className="flex items-center gap-3 text-sm text-muted"><Avatar size={56} mood="sad" className="shrink-0" /> Aucune session pour l&apos;instant. Viens parler avec moi !</p>}
        {[...sessions].reverse().map((s) => {
          const sc = SCENARIOS.find((x) => x.id === s.scenarioId);
          return (
            <button key={s.id} onClick={() => s.report && setOpen(s)} className="flex w-full items-center justify-between rounded-2xl bg-card shadow-card p-3 text-left">
              <span className="flex items-center gap-3"><ScenarioIcon id={s.scenarioId} className="size-5 shrink-0 text-accent" /><span>{s.title ?? sc?.title}<span className="block text-xs text-muted">{new Date(s.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · {Math.max(1, Math.round(s.seconds / 60))} min</span></span></span>
              <span className="text-xl font-bold text-accent">{s.report?.score ?? "–"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
