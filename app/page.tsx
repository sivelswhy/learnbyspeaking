"use client";
import { useEffect, useState } from "react";
import { useLoadState } from "@/components/LlmSetup";
import { Conversation } from "@/components/Conversation";
import { Home, type View } from "@/components/Home";
import { Onboarding } from "@/components/Onboarding";
import { Progress } from "@/components/Progress";
import { Report } from "@/components/Report";
import { Settings } from "@/components/Settings";
import { Vocab } from "@/components/Vocab";
import { LANGUAGES } from "@/lib/languages";
import { warmIfCached } from "@/lib/llm";
import { useStore } from "@/lib/store";
import type { SessionRecord } from "@/lib/types";

export default function Page() {
  const st = useStore();
  const [view, setView] = useState<View>("home");
  const [scenario, setScenario] = useState("free");
  const [report, setReport] = useState<SessionRecord | null>(null);
  const load = useLoadState();

  // Modèle déjà téléchargé : on le charge en tâche de fond dès l'ouverture.
  useEffect(() => {
    if (st.ready && st.profile) void warmIfCached(st.llm);
  }, [st.ready, st.profile, st.llm]);

  if (!st.ready) return null;
  if (!st.profile) return <Onboarding onDone={st.setProfile} />;
  const { profile } = st;
  const rtl = LANGUAGES[profile.target].rtl;
  const home = () => setView("home");

  if (report) return <Report s={report} rtl={rtl} onClose={() => { setReport(null); home(); }} />;
  if (view === "chat")
    return (
      <Conversation
        key={scenario + st.sessions.length}
        profile={profile} llm={st.llm} setLlm={st.setLlm} scenarioId={scenario}
        pastCorrections={st.sessions.slice(-5).flatMap((s) => s.corrections)}
        onExit={home}
        onFinish={(rec, words) => { st.addSession(rec); st.addWords(words); setReport(rec); }}
      />
    );
  if (view === "progress") return <Progress profile={profile} sessions={st.sessions} rtl={rtl} onBack={home} />;
  if (view === "vocab") return <Vocab profile={profile} vocab={st.vocab} review={st.reviewCard} onBack={home} />;
  if (view === "settings")
    return <Settings profile={profile} llm={st.llm} setLlm={st.setLlm} setProfile={st.setProfile} reset={st.reset} onBack={home} />;
  return (
    <Home load={load} profile={profile} sessions={st.sessions} vocab={st.vocab} go={setView}
      start={(id) => { setScenario(id); setView("chat"); }} />
  );
}
