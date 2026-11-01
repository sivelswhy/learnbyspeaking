"use client";
import { useEffect, useState } from "react";
import { Conversation } from "@/components/Conversation";
import { Cours, DayScreen, type ResourceTab } from "@/components/Cours";
import { InstallPrompt, registerServiceWorker } from "@/components/InstallPrompt";
import { GoalSetup } from "@/components/GoalSetup";
import { RiLoader4Line } from "react-icons/ri";
import { LlmSetup, LoadProgress, allReady, isLoading, useAiStatus, useMtState, useVoiceState, useWhisperState } from "@/components/LlmSetup";
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
import { LANGUAGES, SCENARIOS, TARGET_LANGS, type Scenario } from "@/lib/languages";
import { hasWebGPU, warmIfCached } from "@/lib/llm";
import { setVoiceEnabled } from "@/lib/voice";
import { useKeepAwake, useKeepAwakePref } from "@/lib/wakeLock";
import type { ModeId } from "@/lib/modes";
import { useStore } from "@/lib/store";
import { applyTextScale } from "@/lib/textScale";
import { TOPICS } from "@/lib/topics";
import type { Profile, SessionRecord } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Btn } from "@/components/ui";

type Tab = "parler" | "cours" | "bilan" | "moi";
type Screen =
  | { t: "tabs" }
  | { t: "setup" }
  | { t: "placement" }
  | { t: "hub" }
  | { t: "review" }
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

/** Discussion libre : Shuli lance un sujet au hasard au lieu d'un simple « ça va ? ». */
function topicScenario(target: keyof typeof TOPICS, topicId?: string): Scenario {
  const list = TOPICS[target] ?? [];
  const tp = list.find((x) => x.id === topicId) ?? list[Math.floor(Math.random() * list.length)];
  const base = SCENARIOS[0];
  return tp
    ? { ...base, id: `topic-${tp.id}`, title: `Discussion · ${tp.label}`, goal: `Parler de : ${tp.label}`, role: "Shuli, un tuteur israélien chaleureux et curieux qui discute naturellement", opening: `Shuli lance un sujet : ${tp.label.toLowerCase()}.`, starters: { [target]: tp.starter } }
    : base;
}

/** Profil du premier lancement : objectif, genre et prénom sont demandés autour du test de niveau. */
const NEW_PROFILE: Profile = { native: "fr", target: TARGET_LANGS[0], level: "A1", goal: "daily", dailyMinutes: 10, onboarding: "placement" };

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
  const ms = useMtState();
  const keepAwake = useKeepAwakePref();
  const ai = useAiStatus(st.llm);
  // Écran allumé tant qu'un modèle se télécharge : en veille, le téléphone coupe le téléchargement.
  useKeepAwake(keepAwake && [load, ws, vs, ms].some(isLoading));

  useEffect(() => registerServiceWorker(), []);
  useEffect(() => applyTextScale(), []);
  // Raccourcis clavier : ⌘/Ctrl + 1 à 4 = onglets, Échap = retour à l'accueil.
  const screenT = screen.t;
  const hasProfile = !!st.profile && !st.profile.onboarding;
  useEffect(() => {
    if (!hasProfile) return;
    const h = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable]");
      if ((e.metaKey || e.ctrlKey) && !e.altKey && screenT === "tabs" && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        setTab(TABS[Number(e.key) - 1].id);
        setCoursTab(undefined);
      } else if (e.key === "Escape" && !typing && !["tabs", "chat", "placement"].includes(screenT)) {
        setScreen({ t: "tabs" });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [hasProfile, screenT]);
  // Modèles déjà téléchargés : on les charge en tâche de fond dès l'ouverture.
  useEffect(() => {
    if (st.ready && st.profile) void warmIfCached(st.llm);
  }, [st.ready, st.profile, st.llm]);
  useEffect(() => setVoiceEnabled(st.llm.voice === "natural"), [st.llm.voice]);

  if (!st.ready) return null;
  // Premier lancement, dans l'ordre : modèles (obligatoire), test de niveau, objectif.
  if (!st.profile) {
    return (
      <main className="mx-auto max-w-lg lg:max-w-3xl space-y-4 px-4 py-8">
        <div className="flex items-center gap-4">
          <Avatar size={96} mood="cheer" className="pop-in shrink-0" />
          <h1 className="text-2xl font-extrabold">Bienvenue ! Prépare Shuli, ton tuteur</h1>
        </div>
        <p className="text-muted">Tout tourne sur ton appareil, sans compte ni serveur. Avant de commencer, télécharge une fois les modèles d&apos;IA : le cerveau de Shuli, la reconnaissance de ta voix, sa voix et les traducteurs.</p>
        <LlmSetup required llm={st.llm} onChange={st.setLlm} onReady={() => st.setProfile(NEW_PROFILE)} />
        {!hasWebGPU() && <Btn variant="ghost" className="w-full" onClick={() => st.setProfile(NEW_PROFILE)}>Continuer quand même</Btn>}
      </main>
    );
  }
  const profile = st.profile;
  if (profile.onboarding === "goal") {
    return <GoalSetup profile={profile} placement={st.placement} onDone={(p) => { st.setProfile(p); setTab("cours"); setScreen({ t: "tabs" }); }} />;
  }
  if (profile.onboarding === "placement") {
    return (
      <Placement profile={profile} llm={st.llm} onGender={(g) => st.setProfile({ ...profile, gender: g })}
        onSkip={() => st.setProfile({ ...profile, onboarding: "goal" })}
        onDone={(r) => { st.setPlacement(r); st.setProfile({ ...profile, level: r.level, placementDone: true, onboarding: "goal" }); }} />
    );
  }
  const rtl = LANGUAGES[profile.target].rtl;
  const home = () => setScreen({ t: "tabs" });
  const ready = allReady(st.llm, ws, vs);
  void load; // l'état de chargement re-rend la page quand le modèle est prêt

  switch (screen.t) {
    case "setup":
      return (
        <main className="mx-auto max-w-lg lg:max-w-3xl space-y-4 px-4 py-8">
          <h1 className="text-2xl font-bold">Prépare Shuli, ton tuteur</h1>
          <p className="text-muted">Tout tourne sur ton appareil : télécharge une fois le cerveau de Shuli et la reconnaissance de ta voix.</p>
          <LlmSetup llm={st.llm} onChange={st.setLlm} onReady={() => setScreen(profile.placementDone ? { t: "tabs" } : { t: "placement" })} />
          {!ready && <Btn variant="ghost" className="w-full" onClick={() => setScreen({ t: "placement" })}>Continuer sans attendre</Btn>}
        </main>
      );
    case "placement":
      return (
        <Placement profile={profile} llm={st.llm} onSkip={home}
          onDone={(r) => { st.setPlacement(r); st.setProfile({ ...profile, level: r.level, placementDone: true, onboarding: "goal" }); home(); }} />
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
    case "review":
      return <Vocab profile={profile} llm={st.llm} vocab={st.vocab} review={st.reviewCard} onBack={home} />;
    case "scenarios":
      return <ScenarioList onBack={home} start={(id) => setScreen({ t: "chat", scenario: SCENARIOS.find((s) => s.id === id)! })} />;
    case "tool":
      return <ToolChat profile={profile} llm={st.llm} setLlm={st.setLlm} mode={screen.mode} onBack={home} />;
    case "day": {
      const ref = ALL_DAYS.find((x) => x.day.id === screen.day.id)!;
      return (
        <DayScreen day={screen.day} unitTitle={ref.unit.title} index={ref.unit.days.indexOf(screen.day) + 1} profile={profile} progress={st.course} ai={ai} onSetup={() => setScreen({ t: "setup" })}
          onBack={() => { setTab("cours"); home(); }}
          start={(a) => setScreen(a === "speaking" ? { t: "practice", day: screen.day } : { t: "chat", scenario: dayScenario(screen.day), dayId: screen.day.id })} />
      );
    }
    case "practice":
      return (
        <SpeakingPractice day={screen.day} profile={profile} llm={st.llm} onExit={() => setScreen({ t: "day", day: screen.day })}
          onDone={(r) => {
            st.completeActivity(screen.day.id, "speaking", r.fluency);
            // L'entraînement compte dans le temps de pratique et la série (séance sans note).
            st.addSession({ id: `p-${Date.now()}`, date: new Date().toISOString(), scenarioId: "daily", title: `Entraînement · ${screen.day.title}`, seconds: Math.max(30, r.seconds), turns: r.turns, corrections: [], words: [] });
            setScreen({ t: "day", day: screen.day });
          }} />
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
    <div className="mx-auto min-h-dvh max-w-lg px-4 lg:grid lg:max-w-5xl lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
      <nav className="sticky top-0 z-10 -mx-4 flex justify-center bg-bg/90 px-4 py-3 backdrop-blur lg:mx-0 lg:h-dvh lg:flex-col lg:justify-start lg:gap-6 lg:bg-transparent lg:px-0 lg:py-8 lg:backdrop-blur-none" aria-label="Sections">
        <div className="hidden items-center gap-3 lg:flex">
          <Avatar size={44} />
          <span className="text-lg font-black leading-tight text-accent">LearnBy<br />Speaking</span>
        </div>
        <div className="flex rounded-full border border-line bg-card/80 p-1 shadow-card lg:flex-col lg:rounded-2xl lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setCoursTab(undefined); }}
              className={`min-h-10 rounded-full px-4 text-[15px] font-bold transition lg:min-h-12 lg:rounded-2xl lg:border-2 lg:px-4 lg:text-start lg:text-base ${tab === t.id ? "bg-line/70 text-accent lg:border-accent/40 lg:bg-soft" : "text-ink lg:border-transparent"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="min-w-0 lg:pt-8">
      <InstallPrompt />
      {ai === "loading" && (
        <div className="mb-4 space-y-2 rounded-2xl border border-accent/30 bg-soft p-3 text-sm" role="status">
          <p className="flex items-center gap-2 font-semibold text-accent"><RiLoader4Line aria-hidden className="animate-spin" /> Shuli se réveille : chargement depuis ton appareil (rien à télécharger).</p>
          {[load, ws, vs].filter(isLoading).map((x) => <LoadProgress key={x.model} ls={x} compact />)}
        </div>
      )}
      {ai === "missing" && (
        <button onClick={() => setScreen({ t: "setup" })} className="mb-4 w-full rounded-2xl border border-warn/40 bg-warn/10 p-3 text-left text-sm text-warn">
          Shuli n&apos;est pas encore téléchargé sur cet appareil. Touche ici pour le préparer.
        </button>
      )}
      {ai === "downloading" && (
        <button onClick={() => setScreen({ t: "setup" })} className="mb-4 w-full rounded-2xl border border-accent/30 bg-soft p-3 text-left text-sm font-semibold text-accent">
          Téléchargement en cours… touche ici pour suivre la progression.
        </button>
      )}
      {tab === "parler" && (
        <Parler profile={profile} sessions={st.sessions} progress={st.course} ai={ai} vocab={st.vocab}
          go={(to) => {
            if (to === "review") setScreen({ t: "review" });
            else if (to === "setup") setScreen({ t: "setup" });
            else if (to === "hub") setScreen({ t: "hub" });
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
          <Vocab profile={profile} llm={st.llm} vocab={st.vocab} review={st.reviewCard} />
          <Settings profile={profile} llm={st.llm} setLlm={st.setLlm} setProfile={st.setProfile} reset={st.reset} />
        </div>
      )}
      </div>
    </div>
  );
}
