"use client";
import type { LlmSettings } from "@/lib/llm";
import type { Profile } from "@/lib/types";
import { LlmSetup } from "./LlmSetup";
import { Onboarding } from "./Onboarding";
import { BackupCard, DiagnosticCard, TextSizeCard } from "./DataTools";
import { Header } from "./ui";

export function Settings({ profile, llm, setLlm, setProfile, reset, onBack }: {
  profile: Profile; llm: LlmSettings; setLlm: (l: LlmSettings) => void;
  setProfile: (p: Profile) => void; reset: () => void; onBack?: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg lg:max-w-3xl">
      <Header title="Réglages" onBack={onBack} />
      <div className="space-y-4 p-4">
        <LlmSetup llm={llm} onChange={setLlm} />
        <BackupCard reset={reset} />
        <TextSizeCard />
        <DiagnosticCard />
        <h2 className="font-semibold">Profil</h2>
      </div>
      <Onboarding initial={profile} onDone={(p) => { setProfile(p); onBack?.(); }} />
    </div>
  );
}
