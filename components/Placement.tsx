"use client";
import { useEffect, useRef, useState } from "react";
import { RiEyeLine, RiKeyboardLine, RiLightbulbLine, RiShareBoxLine, RiStopFill, RiVoiceprintLine, RiTranslate2, RiVolumeUpLine } from "react-icons/ri";
import { LANGUAGES, type Gender, type Level } from "@/lib/languages";
import type { LlmSettings } from "@/lib/llm";
import { judge } from "@/lib/judge";
import { MAX_QUESTIONS, confidence, estimateFrom, levelOf, pickNext, prior, shouldStop } from "@/lib/adaptive";
import {
  PLACEMENT, SCORING_EXPLANATION, SCORING_EXPLANATION_NO_AI, itemOf, scoreAnswer, type AnswerScore, type PlacementQuestion,
} from "@/lib/placement";
import { avgFluency, type SpeechMetrics } from "@/lib/speechMetrics";
import { LEVEL_RATE, STT_ERRORS, cancelSpeech, speak, useVoiceInput } from "@/lib/speech";
import type { PlacementResult, Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Radar } from "./Radar";
import { Btn, Header } from "./ui";

type Phase = "intro" | "test" | "report";

export function Placement({ profile, llm, onDone, onSkip, onGender }: {
  profile: Profile; llm: LlmSettings; onDone: (r: PlacementResult) => void; onSkip: () => void;
  /** Premier lancement : le genre n'est pas encore connu, on le demande avant les questions (elles s'accordent). */
  onGender?: (g: Gender) => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<PlacementResult | null>(null);
  if (phase === "intro") return <Intro onStart={() => setPhase("test")} onSkip={onSkip} gender={profile.gender} onGender={LANGUAGES[profile.target].genderedYou ? onGender : undefined} />;
  if (phase === "report" && result) return <PlacementReport r={result} profile={profile} onContinue={() => onDone(result)} />;
  return <Test profile={profile} llm={llm} onExit={onGender ? undefined : onSkip} onFinish={(r) => { setResult(r); setPhase("report"); }} />;
}

/** Anneau ondulé : cercle déformé par quelques harmoniques. */
function wavyPath(r: number, amp: number, k: number, phase: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const rr = r + amp * Math.sin(k * a + phase) + amp * 0.6 * Math.sin((k + 2) * a - phase * 1.7);
    pts.push(`${(100 + rr * Math.cos(a)).toFixed(1)},${(100 + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

function Intro({ onStart, onSkip, gender, onGender }: { onStart: () => void; onSkip: () => void; gender?: Gender; onGender?: (g: Gender) => void }) {
  return (
    <main className="fixed inset-0 flex flex-col items-center overflow-y-auto bg-gradient-to-b from-[#3f9a77] via-[#1f6f50] to-[#14513a] px-6 pt-10 text-white">
      <h1 className="text-center text-3xl font-bold leading-tight">Découvre ton niveau d&apos;hébreu en 3 minutes</h1>
      <div className="relative my-auto grid size-[min(18rem,26dvh)] shrink-0 place-items-center">
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd166" />
              <stop offset="0.5" stopColor="#f29b2f" />
              <stop offset="1" stopColor="#46b97f" />
            </linearGradient>
          </defs>
          {Array.from({ length: 18 }, (_, i) => (
            <path key={i} className="ring-wobble" style={{ animationDelay: `${-i * 0.35}s` }} d={wavyPath(62 + (i % 6) * 1.6, 3 + (i % 4), 3 + (i % 3), i * 0.45)}
              fill="none" stroke="url(#ring)" strokeOpacity={0.35 + (i % 3) * 0.12} strokeWidth="0.6" />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 whitespace-nowrap text-[26px] font-bold">
          <span className="flex items-center gap-[3px]" aria-hidden>
            {[14, 26, 40, 26, 16].map((h, i) => <span key={i} className="w-1.5 rounded-full bg-white" style={{ height: h }} />)}
          </span>
          LearnBySpeaking
        </div>
      </div>
      <p className="mt-2 text-center text-lg font-semibold text-[#ffd166]">6 questions à l&apos;oral, de A1 à B2</p>
      <p className="mb-4 text-center text-sm text-[#cfe9dc]/80">Notée par l&apos;IA, sur ton appareil</p>
      {/* Boutons toujours visibles, même sur un écran bas : le reste de la page défile derrière. */}
      <div className="sticky bottom-0 mt-auto flex w-[calc(100%+3rem)] flex-col items-center bg-[#14513a] px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 shadow-[0_-12px_16px_-4px_#14513a]">
      {onGender && (
        <div className="mb-4 w-full max-w-md text-center">
          <p className="text-sm font-medium">En hébreu, Shuli s&apos;adresse à toi au…</p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Genre">
            {([["m", "Masculin"], ["f", "Féminin"]] as const).map(([g, label]) => (
              <button key={g} role="radio" aria-checked={gender === g} onClick={() => onGender(g)}
                className={`min-h-11 rounded-full border text-sm font-semibold ${gender === g ? "border-white bg-white text-accent" : "border-white/50 text-white"}`}>{label}</button>
            ))}
          </div>
        </div>
      )}
      <button onClick={onStart} disabled={!!onGender && !gender} className="min-h-14 w-full max-w-md rounded-full bg-white text-lg font-semibold text-accent active:scale-[0.99] disabled:opacity-50">{onGender && !gender ? "Choisis d'abord ci-dessus" : "Démarrer"}</button>
      <button onClick={onSkip} className="mt-2 min-h-11 text-sm text-white/80 underline">Plus tard</button>
      </div>
    </main>
  );
}

/** score null : l'IA est en train de noter la réponse. */
interface Turn { answer: string; score: AnswerScore | null; speech?: SpeechMetrics | null }

const clock = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function Test({ profile, llm, onExit, onFinish }: { profile: Profile; llm: LlmSettings; onExit?: () => void; onFinish: (r: PlacementResult) => void }) {
  const bank = PLACEMENT[profile.target] ?? [];
  const lang = LANGUAGES[profile.target];
  const gnd = profile.gender ?? "m";
  // Test adaptatif : la banque contient plus de questions que l'on n'en pose ; la suivante est choisie selon les réponses (lib/adaptive.ts).
  const [qs, setQs] = useState<PlacementQuestion[]>(() => {
    const k = pickNext(prior(), bank.map(itemOf));
    return k >= 0 ? [bank[k]] : [];
  });
  const [i, setI] = useState(0);
  const [times, setTimes] = useState<string[]>(() => [clock()]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [showTr, setShowTr] = useState(false);
  const [showEx, setShowEx] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const q = qs[i];
  const done = turns.length > i; // la question courante a une réponse

  const answerRef = useRef<(a: string, speech?: SpeechMetrics | null) => void>(() => {});
  const voice = useVoiceInput(llm.stt, profile.target, lang.speech, (heard, _c, speech) => answerRef.current(heard, speech));
  // Micro ouvert dès l'arrivée sur l'écran : le premier enregistrement ne perd pas le début de la phrase.
  const prewarm = voice.prewarm;
  useEffect(() => prewarm(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (q && !done) void speak(q.text[gnd], lang.speech, LEVEL_RATE[profile.level] ?? 0.85);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelSpeech(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, i, showEx, showTr]);

  function answer(a: string, speech?: SpeechMetrics | null) {
    if (!q || done) return;
    const k = i;
    setTurns((t) => [...t, { answer: a, score: null, speech }]);
    setText("");
    setTyping(false);
    void judge(llm, q.text[gnd], a, gnd).then((ai) =>
      setTurns((t) => t.map((turn, j) => (j === k ? { ...turn, score: scoreAnswer(q, a, ai, speech) } : turn))),
    );
  }
  useEffect(() => {
    answerRef.current = answer;
  });

  function next() {
    // Estimation de la compétence d'après les réponses déjà notées, puis question suivante ou fin.
    const est = estimateFrom(turns.map((t, k) => ({ item: itemOf(qs[k]), s: (t.score?.score ?? 0) / 100 })));
    const pool = bank.filter((b) => !qs.includes(b));
    if (!shouldStop(est, qs.length) && pool.length) {
      const nextQ = pool[pickNext(est, pool.map(itemOf), qs.length)];
      setQs((cur) => [...cur, nextQ]);
      setI(i + 1);
      setTimes((t) => [...t, clock()]);
      setRevealed(false);
      setShowTr(false);
      setShowEx(false);
      return;
    }
    const sc = turns.map((t) => t.score!);
    const avg = (k: "relevance" | "development" | "vocabulary" | "grammar") => Math.round(sc.reduce((a, s) => a + (s[k] ?? 0), 0) / Math.max(1, sc.length));
    const ai = sc.some((s) => s.ai);
    const measured = turns.filter((t) => t.speech && t.score?.fluency != null);
    const mean = (f: (m: SpeechMetrics) => number) => measured.reduce((a, t) => a + f(t.speech!), 0) / Math.max(1, measured.length);
    const wpms = measured.map((t) => t.speech!.wpm).filter((x): x is number => x !== null);
    onFinish({
      date: new Date().toISOString(),
      level: levelOf(est.theta),
      theta: Math.round(est.theta * 100) / 100,
      confidence: confidence(est),
      axes: { relevance: avg("relevance"), grammar: ai ? avg("grammar") : null, development: avg("development"), vocabulary: avg("vocabulary"), fluency: avgFluency(sc.map((s) => s.fluency)) },
      ai,
      voice: measured.length
        ? { wpm: wpms.length ? Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length) : null, pauseRatio: mean((m) => m.pauseRatio), longPauses: Math.round(mean((m) => m.longPauses) * 10) / 10, latency: Math.round(mean((m) => m.latency) * 10) / 10, spoken: measured.length }
        : undefined,
      answers: turns.map((t, k) => ({ question: qs[k].text[gnd], answer: t.answer, score: t.score!.score, fluency: t.score!.fluency, wpm: t.speech?.wpm ?? null })),
    });
  }

  if (!q) return null;
  const he = lang.rtl ? "he" : "";

  return (
    <div className="mx-auto flex h-dvh max-w-lg lg:max-w-3xl flex-col">
      <Header title="Test de niveau" onBack={onExit} />
      <div className="relative mx-6 mt-2 h-1 rounded-full bg-accent/15" role="progressbar" aria-valuemin={0} aria-valuemax={MAX_QUESTIONS} aria-valuenow={turns.length} aria-label={`Question ${i + 1}`}>
        <div className="h-full rounded-full bg-accent/60 transition-[width]" style={{ width: `${Math.min(100, Math.max(turns.length / MAX_QUESTIONS, confidence(estimateFrom(turns.map((t, k) => ({ item: itemOf(qs[k]), s: (t.score?.score ?? 0) / 100 })))) / 100 * 0.9) * 100)}%` }} />
        <span className="absolute -start-1 top-1/2 grid size-3.5 -translate-y-1/2 place-items-center rounded-full bg-accent/70" />
        <span className="absolute -end-1 top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-accent/25" />
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {qs.map((qq, k) => {
          const t = turns[k];
          const current = k === i;
          return (
            <div key={k} className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-sm"><Avatar size={36} mood={!t ? (current && voice.listening ? "wow" : "happy") : !t.score ? "think" : t.score.score >= 75 ? "cheer" : t.score.score >= 40 ? "happy" : "sad"} /> <span className="font-medium">Shuli</span> <span className="text-muted">{times[k]}</span></div>
                <div className="rounded-2xl bg-card p-4 shadow-card">
                  <button onClick={() => setRevealed(true)} disabled={!current || revealed} className="block w-full text-start" aria-label={!current || revealed ? undefined : "Afficher la question"}>
                    <p className={`${he} text-xl transition ${current && !revealed && !done ? "select-none blur-md" : ""}`}>{qq.text[gnd]}</p>
                  </button>
                  {(!current || revealed || done) && <p className="mt-1 text-sm text-muted">{qq.transliteration[gnd]}</p>}
                  {current && (showTr || k < i) && <p className="mt-1 text-sm">{qq.translation[profile.native] ?? qq.translation.en ?? qq.translation.fr}</p>}
                  {current && !done && (
                    <div className="mt-3 flex flex-wrap gap-3 text-sm font-medium">
                      <button onClick={() => speak(qq.text[gnd], lang.speech, 0.8)} className="flex min-h-9 items-center gap-1"><RiVolumeUpLine aria-hidden /> Écouter</button>
                      {!revealed && <button onClick={() => setRevealed(true)} className="flex min-h-9 items-center gap-1"><RiEyeLine aria-hidden /> Afficher</button>}
                      <button onClick={() => setShowTr(!showTr)} className="flex min-h-9 items-center gap-1"><RiTranslate2 aria-hidden /> Traduire</button>
                      <button onClick={() => setShowEx(!showEx)} className="flex min-h-9 items-center gap-1"><RiLightbulbLine aria-hidden /> Exemple</button>
                    </div>
                  )}
                  {current && showEx && !done && (
                    <p className="mt-2 rounded-xl bg-soft p-3 text-sm"><span className={`${he} block text-base`}>{qq.sample.he[gnd]}</span>{qq.sample.tr[gnd]}</p>
                  )}
                </div>
              </div>
              {t && (
                <>
                  <div className="flex flex-col items-end">
                    <p className="mb-1 flex items-center gap-2 text-sm text-muted">moi <span className="grid size-7 place-items-center rounded-full bg-soft text-xs font-bold text-accent">{(profile.name || "?").slice(0, 1).toUpperCase()}</span></p>
                    <p dir="auto" className={`${he} max-w-[85%] rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-lg text-accent-ink`}>{t.answer || "—"}</p>
                  </div>
                  <Feedback t={t} q={qq} gnd={gnd} he={he} speech={lang.speech} />
                </>
              )}
            </div>
          );
        })}
        {voice.error && <p role="alert" className="rounded-xl bg-warn/10 p-3 text-sm text-warn">{STT_ERRORS[voice.error]}</p>}
        <div ref={bottom} />
      </div>

      <div className="bg-bg px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        {done ? (
          <Btn onClick={next} disabled={!turns[i]?.score} className="min-h-14 w-full text-base">
            {!turns[i]?.score ? "Shuli analyse ta réponse…" : "Continuer"}
          </Btn>
        ) : typing ? (
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) answer(text.trim()); }} className="flex gap-2">
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} dir="auto" aria-label="Ta réponse" placeholder="Écris en hébreu…" className="min-h-12 flex-1 rounded-xl border border-line bg-card px-3 text-base" />
            <Btn type="submit" disabled={!text.trim()}>OK</Btn>
          </form>
        ) : (
          <>
          {voice.listening && <LivePanel level={voice.level} />}
          <button onClick={() => (voice.listening ? voice.stop() : (cancelSpeech(), voice.start()))} disabled={voice.transcribing}
            style={voice.listening && voice.level ? { boxShadow: `0 0 0 ${2 + voice.level * 10}px color-mix(in srgb, var(--accent) 25%, transparent)` } : undefined}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-soft font-semibold text-accent disabled:opacity-60">
            {voice.listening ? <RiStopFill aria-hidden className="size-5" /> : <RiVoiceprintLine aria-hidden className="size-5" />}
            {voice.transcribing ? "Transcription…" : voice.opening ? "Ouverture du micro…" : voice.listening ? "Je t'écoute… appuie pour terminer" : "Appuie pour enregistrer"}
          </button>
          </>
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

/**
 * Analyse en direct pendant l'enregistrement : ondes, durée, temps parlé, pauses comptées avec les mêmes seuils que
 * l'analyse finale (pause ≥ 250 ms), et un message quand le silence s'installe.
 */
function LivePanel({ level }: { level: number }) {
  const lv = useRef(level);
  useEffect(() => {
    lv.current = level;
  }, [level]);
  const [snap, setSnap] = useState({ elapsed: 0, speech: 0, pauses: 0, silent: 0, spoke: false, voiced: false, bars: Array<number>(28).fill(0) });
  useEffect(() => {
    const t0 = performance.now();
    let last = t0;
    let lastVoice = 0;
    let voiced = false;
    let spoke = false;
    let inPause = false;
    let speech = 0;
    let pauses = 0;
    const bars = Array<number>(28).fill(0);
    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      voiced = lv.current > (voiced ? 0.1 : 0.16); // hystérésis, comme l'analyse finale
      if (voiced) {
        spoke = true;
        speech += dt;
        lastVoice = now;
        inPause = false;
      } else if (spoke && !inPause && now - lastVoice >= 250) {
        inPause = true;
        pauses++;
      }
      bars.push(lv.current);
      bars.shift();
      setSnap({ elapsed: now - t0, speech, pauses, silent: spoke ? now - lastVoice : 0, spoke, voiced, bars: [...bars] });
    }, 80);
    return () => clearInterval(id);
  }, []);
  const msg = !snap.spoke ? "Prends ton temps, lance-toi quand tu es prêt." : snap.silent > 1000 ? "Continue, ajoute un détail ou termine ta phrase." : snap.voiced ? "Je t'entends bien." : "…";
  return (
    <div className="mb-3 rounded-2xl bg-card p-3 shadow-card" role="status" aria-live="polite">
      <div className="flex h-10 items-center justify-center gap-[3px]" aria-hidden>
        {snap.bars.map((b, k) => <span key={k} className="w-1 rounded-full bg-accent transition-[height]" style={{ height: `${Math.max(4, Math.min(40, b * 60))}px`, opacity: 0.35 + (k / snap.bars.length) * 0.65 }} />)}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{(snap.elapsed / 1000).toFixed(0)} s</span>
        <span>Parlé : {(snap.speech / 1000).toFixed(0)} s</span>
        <span>Pauses : {snap.pauses}</span>
      </div>
      <p className="mt-1 text-center text-sm font-medium">{msg}</p>
    </div>
  );
}

function Feedback({ t, q, gnd, he, speech }: { t: Turn; q: PlacementQuestion; gnd: "m" | "f"; he: string; speech: string }) {
  const sc = t.score;
  if (!sc) {
    return <p className="animate-pulse rounded-2xl bg-card p-4 text-sm text-muted shadow-card">Shuli analyse ta réponse…</p>;
  }
  const verdict = sc.score >= 75 ? "Très bien !" : sc.score >= 55 ? "Bien joué !" : sc.words ? "Bon début !" : "Pas de souci, voici un modèle.";
  const notes: string[] = [];
  if (sc.words) {
    notes.push(sc.relevance >= 50 ? "Tu réponds bien à la question." : "Ta réponse ne semble pas répondre à la question : relis-la, ou touche « Traduire ».");
    if (sc.grammar !== null) {
      notes.push(sc.grammar >= 60 ? "Ta phrase semble correcte." : sc.grammar >= 35 ? "Ta phrase est compréhensible, mais il y a peut-être une faute : compare avec l'exemple." : "Il y a sans doute une faute (accord, conjugaison…) : compare avec l'exemple.");
    }
    if (sc.development < 100) notes.push("Développe un peu plus : ajoute un détail, ou une deuxième idée avec ו (et) ou כי (parce que).");
  } else if (t.answer) {
    notes.push("Je n'ai pas trouvé d'hébreu dans ta réponse : essaie de répondre en hébreu, même avec deux mots.");
  }
  if (sc.fluencyHint) notes.push(sc.fluencyHint);
  const m = t.speech;
  return (
    <div className="space-y-2 rounded-2xl bg-card p-4 text-sm shadow-card">
      {m && sc.fluency !== null && (
        <div className="grid grid-cols-4 gap-1.5 text-center" aria-label="Analyse de ta voix">
          {([
            ["Fluidité", `${sc.fluency}`],
            ["Débit", m.wpm !== null ? `${m.wpm}/min` : "—"],
            ["Pauses", `${m.pauses}`],
            ["Réaction", `${m.latency.toFixed(1)} s`],
          ] as const).map(([label, v]) => (
            <div key={label} className="rounded-xl bg-soft px-1 py-1.5">
              <p className="text-base font-bold text-accent">{v}</p>
              <p className="text-[11px] text-muted">{label}</p>
            </div>
          ))}
        </div>
      )}
      <p className="flex items-center justify-between gap-2 font-semibold"><span className="flex items-center gap-2"><Avatar size={40} mood={sc.score >= 75 ? "cheer" : sc.score >= 55 ? "happy" : sc.words ? "wink" : "sad"} className="shrink-0" />{verdict}</span> <span className="text-accent">{sc.score}/100</span></p>
      {notes.length > 0 && <ul className="list-disc space-y-0.5 ps-5">{notes.map((g) => <li key={g}>{g}</li>)}</ul>}
      {sc.correction && (
        <div>
          <p className="font-semibold">Correction proposée par l&apos;IA</p>
          <p className={`${he} text-base`}>{sc.correction}</p>
          <p className="text-xs text-muted">L&apos;IA peut se tromper : vérifie avec l&apos;exemple.</p>
        </div>
      )}
      <p><b>Conseil :</b> {q.tip}</p>
      <div className="rounded-xl bg-soft p-3">
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
  const gnd = profile.gender ?? "m";
  const bank = PLACEMENT[profile.target] ?? [];
  const [tab, setTab] = useState<"report" | "answers">("report");
  const [filter, setFilter] = useState<"all" | "review">("all");
  const list = r.answers.map((a, k) => ({ ...a, k, q: bank.find((x) => x.text.m === a.question || x.text.f === a.question) })).filter((a) => filter === "all" || a.score < 55);
  const toReview = r.answers.filter((a) => a.score < 55).length;
  const share = () => void navigator.share?.({ title: "Mon niveau d'hébreu", text: `Niveau estimé : ${r.level}. ${LEVEL_TEXT[r.level]}` }).catch(() => {});
  return (
    <div className="mx-auto max-w-lg lg:max-w-3xl pb-28">
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 pt-3">
          <span className="size-11 shrink-0" aria-hidden />
          <h1 className="flex-1 text-center font-bold">Rapport d&apos;expression orale</h1>
          {typeof navigator !== "undefined" && "share" in navigator ? (
            <button onClick={share} aria-label="Partager" className="grid size-11 shrink-0 place-items-center rounded-full bg-card shadow-card"><RiShareBoxLine aria-hidden className="size-5" /></button>
          ) : <span className="size-11 shrink-0" aria-hidden />}
        </div>
        <div className="mt-2 grid grid-cols-2 border-b border-line" role="tablist">
          {(["report", "answers"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 text-[15px] ${tab === t ? "font-semibold text-ink" : "text-muted"}`}>
              <span className={`inline-block py-2 ${tab === t ? "border-b-2 border-ink" : ""}`}>{t === "report" ? "Rapport" : "Mes réponses"}</span>
            </button>
          ))}
        </div>
      </header>
      <div className="space-y-4 p-4">
        {tab === "report" && (
          <div className="rounded-2xl bg-card p-4 text-center shadow-card">
            <p className="font-medium">Niveau</p>
            <p className="text-5xl font-bold text-accent">{r.level}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{LEVEL_TEXT[r.level]}</p>
            <Radar
              values={
                r.axes.development !== undefined
                  ? [
                      { label: "Pertinence", v: r.axes.relevance },
                      ...(r.axes.grammar != null ? [{ label: "Grammaire", v: r.axes.grammar }] : []),
                      ...(r.axes.fluency != null ? [{ label: "Fluidité", v: r.axes.fluency }] : []),
                      { label: "Développement", v: r.axes.development },
                      { label: "Vocabulaire", v: r.axes.vocabulary },
                    ]
                  : [
                      { label: "Réponses", v: r.axes.answered ?? 0 },
                      { label: "Longueur", v: r.axes.length ?? 0 },
                      { label: "Vocabulaire", v: r.axes.vocabulary },
                      { label: "Pertinence", v: r.axes.relevance },
                    ]
              }
            />
            {r.confidence !== undefined && <p className="text-sm font-medium">Fiabilité de l&apos;estimation : {r.confidence} % <span className="font-normal text-muted">({r.answers.length} questions choisies pour toi)</span></p>}
            {r.voice && (
              <div className="mt-3 rounded-xl bg-soft p-3 text-start text-sm">
                <p className="font-semibold">Analyse de ta voix · {r.voice.spoken} réponse{r.voice.spoken > 1 ? "s" : ""} mesurée{r.voice.spoken > 1 ? "s" : ""}</p>
                <ul className="mt-1 list-disc space-y-0.5 ps-5">
                  {r.voice.wpm !== null && <li>Débit : {r.voice.wpm} mots/min en parlant (un natif : 120 à 160).</li>}
                  <li>Pauses : {Math.round(r.voice.pauseRatio * 100)} % du temps de parole, {r.voice.longPauses} hésitation{r.voice.longPauses >= 2 ? "s" : ""} longue{r.voice.longPauses >= 2 ? "s" : ""} par réponse.</li>
                  <li>Temps de réaction : {r.voice.latency} s avant de commencer.</li>
                </ul>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">{r.ai ? SCORING_EXPLANATION : SCORING_EXPLANATION_NO_AI}</p>
          </div>
        )}
        <div className="rounded-2xl bg-card py-4 shadow-card">
          <h2 className="px-4 font-semibold">{tab === "report" ? "Conseils d'amélioration" : "Mes réponses"} <span className="text-sm font-normal">({r.answers.length})</span></h2>
          <div className="mt-2 flex gap-5 border-b border-line px-4" role="tablist">
            {(["all", "review"] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`-mb-px min-h-10 border-b-2 text-[15px] ${filter === f ? "border-accent text-accent" : "border-transparent text-muted"}`}>
                {f === "all" ? "Toutes" : `À revoir (${toReview})`}
              </button>
            ))}
          </div>
          <div className="space-y-3 px-4 pt-3">
            {list.length === 0 && <p className="py-4 text-center text-sm text-muted">Rien à revoir, bravo !</p>}
            {list.map((a) => (
              <div key={a.k} className="overflow-hidden rounded-xl border border-line text-sm">
                <p className="flex items-baseline gap-2 bg-soft px-3 py-2.5 text-base font-medium">
                  <span className="flex-1">{a.k + 1}. <span className={he}>{a.question}</span></span>
                  <span className="shrink-0 text-sm font-semibold text-[#f59e0b]"><span className="underline">{a.score}</span> pts</span>
                </p>
                <div className="space-y-3 p-3">
                  <div><p className="font-semibold">Ta réponse</p><p dir="auto" className={`${he} text-muted`}>{a.answer || "—"}</p></div>
                  {tab === "report" && a.q && (
                    <>
                      <div><p className="w-fit font-semibold underline decoration-accent/40 decoration-2 underline-offset-4">Conseil</p><p className="mt-1">{a.q.tip}</p></div>
                      <div>
                        <p className="w-fit font-semibold underline decoration-accent/40 decoration-2 underline-offset-4">Exemple</p>
                        <p className={`${he} mt-1 text-base`}>{a.q.sample.he[gnd]}</p>
                        <p className="text-muted">{a.q.sample.tr[gnd]} — {a.q.sample.fr}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        <Btn onClick={onContinue} className="mx-auto block min-h-14 w-full max-w-lg lg:max-w-3xl text-base">Fixer mon objectif et progresser</Btn>
      </div>
    </div>
  );
}
