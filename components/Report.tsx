"use client";
import { SCENARIOS } from "@/lib/languages";
import type { SessionRecord } from "@/lib/types";
import { ScenarioIcon } from "./icons";
import { Btn, Card } from "./ui";

export function Bar({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="text-muted">{v}/100</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent" style={{ width: `${v}%` }} /></div>
    </div>
  );
}

export function Report({ s, rtl, onClose }: { s: SessionRecord; rtl: boolean; onClose: () => void }) {
  const r = s.report;
  const sc = SCENARIOS.find((x) => x.id === s.scenarioId);
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold"><span className="flex items-center gap-2"><ScenarioIcon id={s.scenarioId} className="text-accent" /> Bilan · {sc?.title}</span></h1>
      <p className="text-sm text-muted">{Math.max(1, Math.round(s.seconds / 60))} min · {s.turns} réponses</p>
      {r ? (
        <>
          <Card className="text-center">
            <p className="text-6xl font-bold text-accent">{r.score}<span className="text-2xl text-muted">/100</span></p>
            <p className="mt-2 text-sm text-muted">{r.scoreExplanation}</p>
          </Card>
          <Card className="space-y-3">
            <Bar label="Grammaire" v={r.grammar} /><Bar label="Vocabulaire" v={r.vocabulary} /><Bar label="Fluidité" v={r.fluency} />
          </Card>
          {r.summary && <p>{r.summary}</p>}
          {r.mainErrors.length > 0 && <Card><h2 className="mb-1 font-semibold">Erreurs principales</h2><ul className="list-disc ps-5 text-sm">{r.mainErrors.map((e) => <li key={e}>{e}</li>)}</ul></Card>}
          {r.tips.length > 0 && <Card><h2 className="mb-1 font-semibold">Conseils</h2><ul className="list-disc ps-5 text-sm">{r.tips.map((e) => <li key={e}>{e}</li>)}</ul></Card>}
        </>
      ) : (
        <Card className="text-sm text-muted">Le rapport détaillé n&apos;a pas pu être généré (l&apos;IA locale a échoué). La session est quand même enregistrée.</Card>
      )}
      {s.words.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Nouveaux mots (ajoutés à ton vocabulaire)</h2>
          <ul className="space-y-1">
            {s.words.map((w) => (
              <li key={w.word} className="flex items-baseline justify-between gap-2">
                <span className={`${rtl ? "he" : ""} text-lg`}>{w.word} <span className="text-sm text-muted">{w.transliteration}</span></span>
                <span className="text-sm">{w.meaning}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Btn onClick={onClose} className="w-full">Retour à l&apos;accueil</Btn>
    </main>
  );
}
