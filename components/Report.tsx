"use client";
import { SCENARIOS } from "@/lib/languages";
import type { SessionRecord } from "@/lib/types";
import { ScenarioIcon } from "./icons";
import { Radar } from "./Radar";
import { Btn, Card } from "./ui";

export function Report({ s, rtl, onClose }: { s: SessionRecord; rtl: boolean; onClose: () => void }) {
  const r = s.report;
  const sc = SCENARIOS.find((x) => x.id === s.scenarioId);
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-28 pt-4">
      <div className="text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-soft text-accent"><ScenarioIcon id={s.scenarioId} className="size-6" /></span>
        <h1 className="mt-2 text-lg font-bold">Bilan · {s.title ?? sc?.title}</h1>
        <p className="text-sm text-muted">{Math.max(1, Math.round(s.seconds / 60))} min · {s.turns} réponses</p>
      </div>
      {r ? (
        <>
          <Card className="text-center">
            <p className="font-medium">Score</p>
            <p className="text-5xl font-bold text-accent">{r.score}<span className="text-xl text-muted">/100</span></p>
            <Radar values={
              r.relevance !== undefined
                ? [
                    { label: "Pertinence", v: r.relevance },
                    { label: "Grammaire", v: r.grammar ?? 0 },
                    { label: "Participation", v: r.participation },
                    { label: "Vocabulaire", v: r.vocabulary },
                  ]
                : [
                    { label: "Participation", v: r.participation ?? r.grammar ?? 0 },
                    { label: "Longueur", v: r.fluency },
                    { label: "Vocabulaire", v: r.vocabulary },
                  ]
            } />
            <p className="text-xs text-muted">{r.scoreExplanation}</p>
          </Card>
          {r.summary && <p>{r.summary}</p>}
          {(r.mainErrors?.length ?? 0) > 0 && <Card><h2 className="mb-1 font-semibold">{r.relevance !== undefined ? "Phrases à revoir (corrections de l'IA)" : "Erreurs principales"}</h2><ul className="list-disc ps-5 text-sm">{r.mainErrors!.map((e) => <li key={e} dir="auto" className={rtl ? "he" : ""}>{e}</li>)}</ul></Card>}
          {r.tips.length > 0 && <Card><h2 className="mb-1 font-semibold">Conseils d&apos;amélioration <span className="text-sm font-normal">({r.tips.length})</span></h2><ul className="list-disc ps-5 text-sm">{r.tips.map((e) => <li key={e}>{e}</li>)}</ul></Card>}
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
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        <Btn onClick={onClose} className="mx-auto block min-h-14 w-full max-w-lg text-base">Retour à l&apos;accueil</Btn>
      </div>
    </main>
  );
}
