"use client";
import type { LlmSettings } from "@/lib/llm";
import type { Profile } from "@/lib/types";
import { LlmSetup } from "./LlmSetup";
import { Onboarding } from "./Onboarding";
import { Btn, Card, Header } from "./ui";

export function Settings({ profile, llm, setLlm, setProfile, reset, onBack }: {
  profile: Profile; llm: LlmSettings; setLlm: (l: LlmSettings) => void;
  setProfile: (p: Profile) => void; reset: () => void; onBack: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg">
      <Header title="Réglages" onBack={onBack} />
      <div className="space-y-4 p-4">
        <LlmSetup llm={llm} onChange={setLlm} />
        <Card>
          <h2 className="font-semibold">Sauvegarde</h2>
          <p className="mt-1 text-sm text-muted">Tes progrès sont enregistrés sur cet appareil (navigateur), sans compte. Vider les données du site les efface.</p>
          <Btn variant="ghost" className="mt-3 w-full !border-warn !text-warn" onClick={() => confirm("Tout effacer ?") && reset()}>Effacer toutes mes données</Btn>
        </Card>
        <h2 className="font-semibold">Profil</h2>
      </div>
      <Onboarding initial={profile} onDone={(p) => { setProfile(p); onBack(); }} />
    </div>
  );
}
