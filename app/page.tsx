"use client";
import { useEffect, useState } from "react";
import { Conversation } from "@/components/Conversation";
import { Cours, DayScreen, type ResourceTab } from "@/components/Cours";
import { InstallPrompt, registerServiceWorker } from "@/components/InstallPrompt";
import { LlmSetup, allReady, useVoiceState, useWhisperState } from "@/components/LlmSetup";
import { Onboarding } from "@/components/Onboarding";
import { Parler, ScenarioList, nextDay } from "@/components/Parler";
import { Placement } from "@/components/Placement";
import { Progress } from "@/components/Progress";
import { Report } from "@/components/Report";
import { Settings } from "@/components/Settings";
import { SpeakingPractice } from "@/components/SpeakingPractice";
import { ToolChat } from "@/components/ToolChat";
import { TutorHub } from "@/components/TutorHub";
import { Vocab } from "@/components/Vocab";
import { useLoadState } from "@/components/LlmSetup";
import { ALL_DAYS, type Day } from "@/lib/content/course-he";
import { LANGUAGES, SCENARIOS, type Scenario } from "@/lib/languages";
import { warmIfCached } from "@/lib/llm";
import { setVoiceEnabled } from "@/lib/voice";
import type { ModeId } from "@/lib/modes";
import { useStore } from "@/lib/store";
import { TOPICS } from "@/lib/topics";
import type { SessionRecord } from "@/lib/types";
import { Btn } from "@/components/ui";

type Tab = "parler" | "cours" | "bilan" | "moi";
type Screen =
  | { t: "tabs" }
  | { t: "setup" }
  | { t: "placement" }
  | { t: "hub" }
  | { t: "scenarios" }
  | { t: "chat"; scenario: Scenario; dayId?: string }
  | { t: "tool"; mode: ModeId }
  | { t: "day"; day: Day }
  | { t: "practice"; day: Day }
  | { t: "report"; rec: SessionRecord };

const TABS: { id: Tab; label: string }[] = [
  { id: "parler", label: "Parler" },
  { id: "cours", label: "Cours" },
  { id: "bilan", label: "Bilan" },
  { id: "moi", label: "Moi" },
];

/** Discussion libre : Noam lance un sujet au hasard au lieu d'un simple « ça va ? ». */
function topicScenario(target: keyof typeof TOPICS, topicId?: string): Scenario {
  const list = TOPICS[target] ?? [];
  const tp = list.find((x) => x.id === topicId) ?? list[Math.floor(Math.random() * list.length)];
  const base = SCENARIOS[0];
  return tp
    ? { ...base, id: `topic-${tp.id}`, title: `Discussion · ${tp.label}`, goal: `Parler de : ${tp.label}`, role: "Noam, un tuteur israélien chaleureux et curieux qui discute naturellement", opening: `Noam lance un sujet : ${tp.label.toLowerCase()}.`, starters: { [target]: tp.starter } }
    : base;
}

function dayScenario(d: Day): Scenario {
  return { id: d.id, title: d.title, goal: d.scenario.goal, role: d.scenario.role, opening: `Jeu de rôle : ${d.scenario.role}.`, difficulty: 1, starters: { he: d.scenario.starter } };
}

export default function Page() {
  const st = useStore();
  const [tab, setTab] = useState<Tab>("parler");
  const [screen, setScreen] = useState<Screen>({ t: "tabs" });
  const [coursTab, setCoursTab] = useState<ResourceTab | undefined>();
  const load = useLoadState();
  const ws = useWhisperState();
  const vs = useVoiceState();

  useEffect(() => registerServiceWorker(), []);
  // Modèles déjà téléchargés : on les charge en tâche de fond dès l'ouverture.
  useEffect(() => {
    if (st.ready && st.profile) void warmIfCached(st.llm);
  }, [st.ready, st.profile, st.llm]);
  useEffect(() => setVoiceEnabled(st.llm.voice === "natural"), [st.llm.voice]);

  if (!st.ready) return null;
  if (!st.profile) return <Onboarding onDone={(p) => { st.setProfile(p); setScreen({ t: "setup" }); }} />;
  const profile = st.profile;
  const rtl = LANGUAGES[profile.target].rtl;
  const home = () => setScreen({ t: "tabs" });
  const ready = allReady(st.llm, ws, vs);
  void load; // l'état de chargement re-rend la page quand le modèle est prêt

  switch (screen.t) {
    case "setup":
      return (
        <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
          <h1 className="text-2xl font-bold">Prépare Noam, ton tuteur</h1>
          <p className="text-muted">Tout tourne sur ton appareil : télécharge une fois le cerveau de Noam et la reconnaissance de ta voix.</p>
          <LlmSetup llm={st.llm} onChange={st.setLlm} onReady={() => setScreen(profile.placementDone ? { t: "tabs" } : { t: "placement" })} />
          {!ready && <Btn variant="ghost" className="w-full" onClick={() => setScreen({ t: "placement" })}>Continuer sans attendre</Btn>}
        </main>
      );
    case "placement":
      return (
        <Placement profile={profile} llm={st.llm} onSkip={home}
          onDone={(r) => { st.setPlacement(r); st.setProfile({ ...profile, level: r.level, placementDone: true }); setTab("cours"); home(); }} />
      );
    case "hub":
      return (
        <TutorHub profile={profile} onBack={home} open={(m) => {
          if (m === "grammar") {
            setCoursTab("grammar");
            setTab("cours");
            home();
          } else setScreen(m === "talk" || m === "daily" ? { t: "chat", scenario: topicScenario(profile.target) } : { t: "tool", mode: m });
        }} />
      );
    case "scenarios":
      return <ScenarioList onBack={home} start={(id) => setScreen({ t: "chat", scenario: SCENARIOS.find((s) => s.id === id)! })} />;
    case "tool":
      return <ToolChat profile={profile} llm={st.llm} setLlm={st.setLlm} mode={screen.mode} onBack={home} />;
    case "day": {
      const ref = ALL_DAYS.find((x) => x.day.id === screen.day.id)!;
      return (
        <DayScreen day={screen.day} unitTitle={ref.unit.title} index={ref.unit.days.indexOf(screen.day) + 1} profile={profile} progress={st.course}
          onBack={() => { setTab("cours"); home(); }}
          start={(a) => setScreen(a === "speaking" ? { t: "practice", day: screen.day } : { t: "chat", scenario: dayScenario(screen.day), dayId: screen.day.id })} />
      );
    }
    case "practice":
      return (
        <SpeakingPractice day={screen.day} profile={profile} llm={st.llm} onExit={() => setScreen({ t: "day", day: screen.day })}
          onDone={() => { st.completeActivity(screen.day.id, "speaking"); setScreen({ t: "day", day: screen.day }); }} />
      );
    case "chat": {
      const dayId = screen.dayId;
      return (
        <Conversation key={screen.scenario.id + st.sessions.length} profile={profile} llm={st.llm} setLlm={st.setLlm} scenario={screen.scenario}
          pastCorrections={st.sessions.slice(-5).flatMap((s) => s.corrections)}
          onExit={home}
          onFinish={(rec, words) => {
            st.addSession(rec);
            st.addWords(words);
            if (dayId) st.completeActivity(dayId, "scenario");
            setScreen({ t: "report", rec });
          }} />
      );
    }
    case "report":
      return <Report s={screen.rec} rtl={rtl} onClose={home} />;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4">
      <InstallPrompt />
      <nav className="sticky top-0 z-10 -mx-4 flex justify-center bg-bg/90 px-4 py-3 backdrop-blur" aria-label="Sections">
        <div className="flex rounded-full border border-line bg-card/80 p-1 shadow-card" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setCoursTab(undefined); }}
              className={`min-h-10 rounded-full px-4 text-[15px] font-semibold transition ${tab === t.id ? "bg-line/70 text-accent" : "text-ink"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      {!ready && ![load, ws, vs].some((x) => x.phase === "download" || x.phase === "init") && (
        <button onClick={() => setScreen({ t: "setup" })} className="mb-4 w-full rounded-2xl border border-warn/40 bg-warn/10 p-3 text-left text-sm text-warn">
          Noam n&apos;est pas encore téléchargé sur cet appareil. Touche ici pour le préparer.
        </button>
      )}
      {tab === "parler" && (
        <Parler profile={profile} sessions={st.sessions} progress={st.course}
          go={(to) => {
            if (to === "hub") setScreen({ t: "hub" });
            else if (to === "talk") setScreen({ t: "chat", scenario: topicScenario(profile.target) });
            else if (to === "scenarios") setScreen({ t: "scenarios" });
            else if (to === "placement") setScreen({ t: "placement" });
            else if (to === "translate" || to === "define") setScreen({ t: "tool", mode: to });
            else if (to === "course") { setCoursTab(undefined); setTab("cours"); }
            else setScreen({ t: "day", day: nextDay(st.course, profile.level).day });
          }} />
      )}
      {tab === "cours" && <div className="pb-10"><Cours key={coursTab ?? "path"} profile={profile} progress={st.course} openDay={(d) => setScreen({ t: "day", day: d })} addWords={st.addWords} startTab={coursTab} /></div>}
      {tab === "bilan" && <div className="-mx-4"><Progress profile={profile} sessions={st.sessions} rtl={rtl} /></div>}
      {tab === "moi" && (
        <div className="-mx-4 space-y-2">
          <Vocab profile={profile} vocab={st.vocab} review={st.reviewCard} />
          <Settings profile={profile} llm={st.llm} setLlm={st.setLlm} setProfile={st.setProfile} reset={st.reset} />
        </div>
      )}
    </div>
  );
}
