"use client";
import { useEffect, useRef, useState } from "react";
import { RiEyeLine, RiKeyboardLine, RiLightbulbLine, RiMicFill, RiStopFill, RiTranslate2, RiVolumeUpLine } from "react-icons/ri";
import { LANGUAGES, type Level } from "@/lib/languages";
import type { LlmSettings } from "@/lib/llm";
import { PLACEMENT, SCORING_EXPLANATION, estimateLevel, scoreAnswer, type AnswerScore, type PlacementQuestion } from "@/lib/placement";
import { LEVEL_RATE, STT_ERRORS, cancelSpeech, speak, useVoiceInput } from "@/lib/speech";
import type { PlacementResult, Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Radar } from "./Radar";
import { Btn, Header } from "./ui";

type Phase = "intro" | "test" | "report";

export function Placement({ profile, llm, onDone, onSkip }: { profile: Profile; llm: LlmSettings; onDone: (r: PlacementResult) => void; onSkip: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<PlacementResult | null>(null);
  if (phase === "intro") return <Intro onStart={() => setPhase("test")} onSkip={onSkip} />;
  if (phase === "report" && result) return <PlacementReport r={result} profile={profile} onContinue={() => onDone(result)} />;
  return <Test profile={profile} llm={llm} onExit={onSkip} onFinish={(r) => { setResult(r); setPhase("report"); }} />;
}

function Intro({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-gradient-to-b from-[#3b6ee8] to-[#1d3fa8] px-6 pb-[max(env(safe-area-inset-bottom),20px)] pt-16 text-white">
      <h1 className="text-center text-3xl font-bold leading-tight">Découvre ton niveau d&apos;hébreu en 3 minutes</h1>
      <div className="relative my-auto grid size-64 place-items-center">
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full animate-[spin_24s_linear_infinite]" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <ellipse key={i} cx="100" cy="100" rx={70 + (i % 4) * 6} ry={60 + ((i * 3) % 5) * 5} fill="none" stroke={i % 2 ? "#a5c0ff" : "#ffffff"} strokeOpacity={0.18 + (i % 3) * 0.08} strokeWidth="0.8" transform={`rotate(${i * 13} 100 100)`} />
          ))}
        </svg>
        <div className="flex items-center gap-2 text-3xl font-bold">
          <span className="flex items-end gap-0.5" aria-hidden>
            {[10, 18, 26, 18, 12].map((h, i) => <span key={i} className="w-1 rounded-full bg-white" style={{ height: h }} />)}
          </span>
          Parle
        </div>
      </div>
      <p className="text-center font-semibold text-[#bfe6ff]">6 questions à l&apos;oral, de A1 à B2</p>
      <p className="mb-6 text-center text-sm text-white/70">Notation transparente, calculée sur ton appareil</p>
      <button onClick={onStart} className="min-h-14 w-full max-w-md rounded-full bg-white text-lg font-semibold text-[#1d3fa8] active:scale-[0.99]">Démarrer</button>
      <button onClick={onSkip} className="mt-3 min-h-11 text-sm text-white/80 underline">Plus tard</button>
    </main>
  );
}

interface Turn { answer: string; score: AnswerScore }

function Test({ profile, llm, onExit, onFinish }: { profile: Profile; llm: LlmSettings; onExit: () => void; onFinish: (r: PlacementResult) => void }) {
  const qs = PLACEMENT[profile.target] ?? [];
  const lang = LANGUAGES[profile.target];
  const gnd = profile.gender ?? "m";
  const [i, setI] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [showTr, setShowTr] = useState(false);
  const [showEx, setShowEx] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const q = qs[i];
  const done = turns.length > i; // la question courante a une réponse

  const answerRef = useRef<(a: string) => void>(() => {});
  const voice = useVoiceInput(llm.stt, profile.target, lang.speech, (heard) => answerRef.current(heard));

  useEffect(() => {
    if (q && !done) void speak(q.text[gnd], lang.speech, LEVEL_RATE[profile.level] ?? 0.85);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelSpeech(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, i, showEx, showTr]);

  function answer(a: string) {
    if (!q || done) return;
    setTurns((t) => [...t, { answer: a, score: scoreAnswer(q, a) }]);
    setText("");
    setTyping(false);
  }
  useEffect(() => {
    answerRef.current = answer;
  });

  function next() {
    if (i + 1 < qs.length) {
      setI(i + 1);
      setRevealed(false);
      setShowTr(false);
      setShowEx(false);
      return;
    }
    const scores = turns.map((t) => t.score.score);
    const avg = (k: keyof AnswerScore) => Math.round(turns.reduce((a, t) => a + t.score[k], 0) / Math.max(1, turns.length));
    onFinish({
      date: new Date().toISOString(),
      level: estimateLevel(qs, scores),
      axes: { answered: avg("answered"), length: avg("length"), vocabulary: avg("vocabulary"), relevance: avg("relevance") },
      answers: turns.map((t, k) => ({ question: qs[k].text[gnd], answer: t.answer, score: t.score.score })),
    });
  }

  if (!q) return null;
  const he = lang.rtl ? "he" : "";

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col">
      <Header title="Test de niveau" onBack={onExit} />
      <div className="flex gap-1 px-4 pt-2" aria-label={`Question ${i + 1} sur ${qs.length}`}>
        {qs.map((_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k < turns.length ? "bg-accent" : k === i ? "bg-accent/40" : "bg-line"}`} />)}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {qs.slice(0, i + 1).map((qq, k) => {
          const t = turns[k];
          const current = k === i;
          return (
            <div key={k} className="space-y-3">
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm"><Avatar size={28} /> <b>Noa</b> <span className="text-muted">{qq.level}</span></div>
                <div className="rounded-2xl bg-card p-4 shadow-sm">
                  <button onClick={() => setRevealed(true)} disabled={!current || revealed} className="block w-full text-start" aria-label={!current || revealed ? undefined : "Afficher la question"}>
                    <p className={`${he} text-xl transition ${current && !revealed ? "select-none blur-md" : ""}`}>{qq.text[gnd]}</p>
                  </button>
                  {(!current || revealed) && <p className="mt-1 text-sm text-muted">{qq.transliteration[gnd]}</p>}
                  {current && (showTr || k < i) && <p className="mt-1 text-sm">{qq.translation[profile.native]}</p>}
                  {current && !done && (
                    <div className="mt-3 flex flex-wrap gap-3 text-sm font-medium">
                      <button onClick={() => speak(qq.text[gnd], lang.speech, 0.8)} className="flex min-h-9 items-center gap-1"><RiVolumeUpLine aria-hidden /> Écouter</button>
                      {!revealed && <button onClick={() => setRevealed(true)} className="flex min-h-9 items-center gap-1"><RiEyeLine aria-hidden /> Afficher</button>}
                      <button onClick={() => setShowTr(!showTr)} className="flex min-h-9 items-center gap-1"><RiTranslate2 aria-hidden /> Traduire</button>
                      <button onClick={() => setShowEx(!showEx)} className="flex min-h-9 items-center gap-1"><RiLightbulbLine aria-hidden /> Exemple</button>
                    </div>
                  )}
                  {current && showEx && !done && (
                    <p className="mt-2 rounded-xl bg-accent/10 p-3 text-sm"><span className={`${he} block text-base`}>{qq.sample.he[gnd]}</span>{qq.sample.tr[gnd]}</p>
                  )}
                </div>
              </div>
              {t && (
                <>
                  <p dir="auto" className={`${he} ms-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-3 text-lg text-accent-ink`}>{t.answer || "—"}</p>
                  <Feedback t={t} q={qq} gnd={gnd} he={he} speech={lang.speech} />
                </>
              )}
            </div>
          );
        })}
        {voice.error && <p role="alert" className="rounded-xl bg-warn/10 p-3 text-sm text-warn">{STT_ERRORS[voice.error]}</p>}
        <div ref={bottom} />
      </div>

      <div className="border-t border-line bg-bg px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        {done ? (
          <Btn onClick={next} className="min-h-14 w-full text-base">{i + 1 < qs.length ? "Question suivante" : "Voir mon rapport"}</Btn>
        ) : typing ? (
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) answer(text.trim()); }} className="flex gap-2">
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} dir="auto" aria-label="Ta réponse" placeholder="Écris en hébreu…" className="min-h-12 flex-1 rounded-xl border border-line bg-card px-3 text-base" />
            <Btn type="submit" disabled={!text.trim()}>OK</Btn>
          </form>
        ) : (
          <button onClick={() => (voice.listening ? voice.stop() : (cancelSpeech(), voice.start()))} disabled={voice.transcribing}
            style={voice.listening && voice.level ? { boxShadow: `0 0 0 ${2 + voice.level * 10}px color-mix(in srgb, var(--accent) 25%, transparent)` } : undefined}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent/15 font-semibold text-accent disabled:opacity-60">
            {voice.listening ? <RiStopFill aria-hidden className="size-5" /> : <RiMicFill aria-hidden className="size-5" />}
            {voice.transcribing ? "Transcription…" : voice.listening ? "Je t'écoute… appuie pour terminer" : "Appuie pour répondre"}
          </button>
        )}
        {!done && (
          <div className="mt-2 flex justify-between text-sm text-muted">
            <button onClick={() => setTyping(!typing)} className="flex min-h-9 items-center gap-1"><RiKeyboardLine aria-hidden /> {typing ? "Parler plutôt" : "Écrire"}</button>
            <button onClick={() => answer("")} className="min-h-9">Je ne sais pas</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Feedback({ t, q, gnd, he, speech }: { t: Turn; q: PlacementQuestion; gnd: "m" | "f"; he: string; speech: string }) {
  const sc = t.score;
  const verdict = sc.score >= 75 ? "Très bien !" : sc.score >= 55 ? "Bien joué !" : sc.words ? "Bon début !" : "Pas de souci, voici un modèle.";
  const good: string[] = [];
  if (sc.words) good.push(`Tu as répondu en hébreu avec ${sc.words} mot${sc.words > 1 ? "s" : ""}.`);
  if (sc.relevance === 100) good.push("Ta réponse contient les mots attendus pour cette question.");
  return (
    <div className="space-y-2 rounded-2xl bg-card p-4 text-sm shadow-sm">
      <p className="flex items-center justify-between font-semibold">{verdict} <span className="text-accent">{sc.score}/100</span></p>
      {good.length > 0 && <ul className="list-disc space-y-0.5 ps-5">{good.map((g) => <li key={g}>{g}</li>)}</ul>}
      <p><b>Conseil :</b> {q.tip}</p>
      {sc.words > 0 && sc.length < 100 && <p className="text-muted">Développe un peu plus : vise au moins {Math.ceil((sc.words * 100) / Math.max(sc.length, 1))} mots.</p>}
      <div className="rounded-xl bg-accent/10 p-3">
        <p className="text-xs font-semibold uppercase text-accent">Exemple</p>
        <p className="flex items-center gap-2">
          <button onClick={() => speak(q.sample.he[gnd], speech, 0.85)} aria-label="Écouter l'exemple" className="text-accent"><RiVolumeUpLine aria-hidden /></button>
          <span className={`${he} text-base`}>{q.sample.he[gnd]}</span>
        </p>
        <p className="text-muted">{q.sample.tr[gnd]}</p>
        <p>{q.sample.fr}</p>
      </div>
    </div>
  );
}

const LEVEL_TEXT: Record<Level, string> = {
  A1: "Tu sais te présenter et répondre à des questions très simples.",
  A2: "Tu te débrouilles dans les situations du quotidien avec des phrases simples.",
  B1: "Tu peux raconter et expliquer tes choix avec des phrases reliées.",
  B2: "Tu t'exprimes avec aisance, même sur des hypothèses.",
  C1: "Tu t'exprimes avec aisance et nuance.",
  C2: "Ton niveau est proche de celui d'un natif.",
};

export function PlacementReport({ r, profile, onContinue }: { r: PlacementResult; profile: Profile; onContinue: () => void }) {
  const he = LANGUAGES[profile.target].rtl ? "he" : "";
  return (
    <div className="mx-auto max-w-lg pb-28">
      <Header title="Rapport de niveau" />
      <div className="space-y-4 p-4">
        <div className="rounded-2xl bg-card p-4 text-center shadow-sm">
          <p className="text-sm text-muted">Niveau estimé</p>
          <p className="text-5xl font-bold text-accent">{r.level}</p>
          <p className="mt-1 text-sm">{LEVEL_TEXT[r.level]}</p>
          <Radar
            values={[
              { label: "Réponses", v: r.axes.answered },
              { label: "Longueur", v: r.axes.length },
              { label: "Vocabulaire", v: r.axes.vocabulary },
              { label: "Pertinence", v: r.axes.relevance },
            ]}
          />
          <p className="text-xs text-muted">{SCORING_EXPLANATION}</p>
        </div>
        <h2 className="font-semibold">Détail des réponses</h2>
        {r.answers.map((a, k) => (
          <div key={k} className="rounded-2xl bg-card p-4 text-sm shadow-sm">
            <p className="flex items-start justify-between gap-2"><span className="text-base font-medium">{k + 1}. <span className={he}>{a.question}</span></span> <span className="shrink-0 font-semibold text-warn">{a.score} pts</span></p>
            <p className="mt-2 text-xs font-semibold uppercase text-muted">Ta réponse</p>
            <p dir="auto" className={he}>{a.answer || "—"}</p>
          </div>
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        <Btn onClick={onContinue} className="mx-auto block min-h-14 w-full max-w-lg text-base">Commencer mon parcours {r.level}</Btn>
      </div>
    </div>
  );
}
