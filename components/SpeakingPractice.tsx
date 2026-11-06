"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiLightbulbLine, RiMicFill, RiPauseFill, RiRestartLine } from "react-icons/ri";
import { blanked, type Day, type Line, type Step } from "@/lib/content/course-he";
import { LANGUAGES, type Gender } from "@/lib/languages";
import type { LlmSettings } from "@/lib/llm";
import { LEVEL_RATE, STT_ERRORS, cancelSpeech, speak, useVoiceInput } from "@/lib/speech";
import { useSpaceKey } from "@/lib/keys";
import { avgFluency, fluencyScore, type SpeechMetrics } from "@/lib/speechMetrics";
import type { Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Btn, Header, wordMatch } from "./ui";
import { concreteFixes, type Fix } from "@/lib/fixes";

/** Ce que chaque type d'étape à micro demande : phrase affichée, phrase attendue, consigne, phrase dite par Shuli, aide. */
function info(step: Step, g: Gender) {
  switch (step.kind) {
    case "repeat": return { shown: step.line, target: step.line.he[g], verb: "Répète", say: step.line.he[g], help: null as Line | null };
    case "answer": return { shown: step.q, target: step.a.he[g], verb: "Réponds", say: step.q.he[g], help: step.a };
    case "fill": return { shown: step.line, target: step.line.he[g], verb: "Complète", say: null, help: step.line };
    case "swap": return { shown: step.from, target: step.to.he[g], verb: "Transforme", say: step.from.he[g], help: step.to };
    case "free": return { shown: step.q, target: "", verb: "Réponds", say: step.q.he[g], help: step.example };
    case "recall": return { shown: step.line, target: step.line.he[g], verb: "Dis-le en hébreu", say: null, help: step.line };
    case "shadow": return { shown: step.line, target: step.line.he[g], verb: "Au rythme de Shuli", say: step.line.he[g], help: null };
    default: return null;
  }
}
const hebrewWords = (t: string) => t.split(/\s+/).filter((w) => /[\u05d0-\u05ea]/.test(w)).length;

/** Étapes où, après un premier essai raté, on donne un indice et on laisse réessayer avant de montrer la réponse. */
const RETRY = new Set<Step["kind"]>(["recall", "fill", "swap"]);
/** Indice sans donner la réponse : quel mot regarder et pourquoi, ou la première lettre du mot manquant. */
export function cueOf(f: Fix): string {
  if (!f.from) return `Il manque un mot : il commence par « ${f.to.charAt(0)} ».`;
  return `Regarde « ${f.from} » : ${f.why}.`;
}
/** 4-3-2 : durée de chaque tour, en secondes. */
export const RETELL_SECONDS = [60, 45, 30];

/** Entraînement guidé : Shuli parle (sous-titres), puis l'apprenant répète ou répond à voix haute. */
export function SpeakingPractice({ day, profile, llm, onExit, onDone }: {
  day: Day; profile: Profile; llm: LlmSettings; onExit: () => void;
  /** fluency : moyenne 0-100 des étapes mesurées (null si voix non mesurée) ; seconds : durée ; turns : étapes parlées. */
  onDone: (r: { fluency: number | null; seconds: number; turns: number }) => void;
}) {
  const lang = LANGUAGES[profile.target];
  const gnd = profile.gender ?? "m";
  const he = lang.rtl ? "he" : "";
  const [i, setI] = useState(0);
  const [talking, setTalking] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  // Étape « écoute » : réponses déjà essayées (mauvaises) et bonne réponse trouvée.
  const [tried, setTried] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [metrics, setMetrics] = useState<SpeechMetrics | null>(null);
  // Essais sur l'étape : au premier raté d'une étape de mémoire, un indice ; la réponse au deuxième.
  const [attempts, setAttempts] = useState(0);
  const attemptsRef = useRef(0);
  // 4-3-2 : tours faits (mots, débit, fluidité) et secondes restantes du tour en cours.
  const [rounds, setRounds] = useState<{ words: number; wpm: number | null; fluency: number | null }[]>([]);
  const [left, setLeft] = useState<number | null>(null);
  const roundTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Fluidité de chaque étape parlée (pauses, débit, hésitations : lib/speechMetrics.ts).
  const fluencies = useRef<(number | null)[]>([]);
  const [t0] = useState(() => Date.now());
  const [summary, setSummary] = useState<{ fluency: number | null; seconds: number; turns: number; measured: number } | null>(null);
  const step: Step | undefined = day.steps[i];
  const finished = i >= day.steps.length;
  const inf = step ? info(step, gnd) : null;
  // Ordre des réponses de l'étape « écoute » : mélangé (graine fixe) une fois par étape.
  const order = useMemo(() => {
    if (step?.kind !== "listen") return [] as number[];
    const idx = step.options.map((_, k) => k);
    let seed = (i + 1) * 7919 + day.id.length * 104729;
    for (let k = idx.length - 1; k > 0; k--) { seed = (seed * 48271) % 2147483647; const j = seed % (k + 1); [idx[k], idx[j]] = [idx[j], idx[k]]; }
    return idx;
  }, [i, day.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Étape courante : un rappel de fin de parole d'une étape déjà quittée ne doit plus rien déclencher.
  const stepRef = useRef(i);
  useEffect(() => {
    stepRef.current = i;
  }, [i]);

  const say = useCallback(
    (text: string, speechLang: string, rate: number, after?: () => void) => {
      setTalking(true);
      void speak(text, speechLang, rate, () => {
        setTalking(false);
        after?.();
      }).then((ok) => {
        if (!ok) {
          setTalking(false);
          after?.();
        }
      });
    },
    [],
  );

  const voice = useVoiceInput(llm.stt, profile.target, lang.speech, (t, _c, m) => {
    const words = hebrewWords(t);
    const flu = fluencyScore(m, words, profile.level)?.score ?? null;
    fluencies.current.push(flu);
    const cur = day.steps[stepRef.current];
    if (cur?.kind === "retell") {
      if (roundTimer.current) clearInterval(roundTimer.current);
      setLeft(null);
      setRounds((r) => [...r, { words, wpm: m?.wpm ?? null, fluency: flu }]);
      return;
    }
    setHeard(t);
    setMetrics(m ?? null);
    const n = ++attemptsRef.current;
    setAttempts(n);
    const target = cur ? info(cur, gnd)?.target : "";
    if (!cur || !target) return;
    const score = wordMatch(target, t);
    const at = stepRef.current;
    // Étape de mémoire : la bonne version est dite dès qu'elle est trouvée ou montrée ; ailleurs, redite lentement si on en est loin (une fois).
    if (cur.kind === "recall" && (score >= 70 || n >= 2)) say(target, lang.speech, 0.8);
    else if (!RETRY.has(cur.kind) && score < 60 && n === 1 && stepRef.current === at) say(target, lang.speech, 0.7);
  });
  // Micro ouvert dès l'arrivée sur l'écran : le premier enregistrement ne perd pas le début de la phrase.
  const prewarm = voice.prewarm;
  useEffect(() => prewarm(), []); // eslint-disable-line react-hooks/exhaustive-deps


  const next = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setCountdown(null);
    cancelSpeech();
    voice.stop();
    setHeard(null);
    setMetrics(null);
    setHint(false);
    setTried([]);
    setSolved(false);
    attemptsRef.current = 0;
    setAttempts(0);
    setRounds([]);
    setLeft(null);
    if (roundTimer.current) clearInterval(roundTimer.current);
    if (stepRef.current + 1 >= day.steps.length) {
      const measured = fluencies.current.filter((f) => f !== null).length;
      setSummary({ fluency: avgFluency(fluencies.current), seconds: Math.round((Date.now() - t0) / 1000), turns: day.steps.filter((s) => s.kind !== "intro" && s.kind !== "listen").length, measured });
    }
    setI((x) => x + 1);
  }, [voice, day.steps, t0]);

  // Lecture de chaque étape à son arrivée.
  useEffect(() => {
    if (!step) return;
    const at = i;
    const still = () => stepRef.current === at;
    const rate = LEVEL_RATE[profile.level] ?? 0.85;
    if (step.kind === "intro") {
      // Le français est lu par la voix du système, les mots hébreux entre « » par la voix hébraïque.
      const parts = step.parts?.some((p) => p.he) ? step.parts : [{ t: step.fr }];
      const sayPart = (k: number, done: () => void) => {
        if (!still()) return;
        if (k >= parts.length) return done();
        const p = parts[k];
        if (!p.t.trim()) return sayPart(k + 1, done);
        if (p.he) say(p.he[gnd], lang.speech, rate, () => sayPart(k + 1, done));
        else say(p.t, "fr-FR", 1, () => sayPart(k + 1, done));
      };
      sayPart(0, () => {
        if (!still()) return;
        let n = 3;
        setCountdown(n);
        timer.current = setInterval(() => {
          n -= 1;
          setCountdown(n);
          if (n <= 0) next();
        }, 1000);
      });
    } else if (step.kind === "listen") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Shuli parle à l'arrivée sur l'étape (état « talking » de l'avatar)
      say(step.say.he[gnd], lang.speech, rate);
    } else if (step.kind === "retell") {
      say(step.q.he[gnd], lang.speech, rate);
    } else if (step.kind === "shadow") {
      // Vitesse naturelle : c'est tout l'intérêt du shadowing.
      say(step.line.he[gnd], lang.speech, 1, () => still() && voice.start());
    } else if (inf?.say) {
      say(inf.say, lang.speech, rate, () => still() && voice.start());
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { cancelSpeech(); if (roundTimer.current) clearInterval(roundTimer.current); }, []);

  /** 4-3-2 : un tour de parole, arrêté automatiquement à la fin du temps. */
  function startRound() {
    const secs = RETELL_SECONDS[rounds.length];
    if (secs === undefined) return;
    cancelSpeech();
    voice.start();
    let t = secs;
    setLeft(t);
    if (roundTimer.current) clearInterval(roundTimer.current);
    roundTimer.current = setInterval(() => {
      t -= 1;
      setLeft(t);
      if (t <= 0) {
        if (roundTimer.current) clearInterval(roundTimer.current);
        voice.stop();
      }
    }, 1000);
  }
  useSpaceKey(() => (step?.kind === "intro" ? next() : step?.kind === "retell" ? (rounds.length === 3 ? next() : voice.listening ? voice.stop() : voice.transcribing ? undefined : startRound()) : step?.kind === "listen" ? (solved ? next() : undefined) : voice.listening ? voice.stop() : voice.transcribing ? undefined : (cancelSpeech(), setHeard(null), voice.start())), !finished);

  if (finished) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg lg:max-w-3xl flex-col items-center justify-center gap-4 p-6 text-center">
        <Avatar size={120} mood="cheer" className="pop-in" />
        <h1 className="text-2xl font-bold">Entraînement terminé !</h1>
        <p className="text-muted">Tu as pratiqué « {day.title} ». Passe au jeu de rôle pour l&apos;utiliser en vraie conversation.</p>
        {summary && summary.fluency !== null && (
          <p className="rounded-2xl bg-soft px-4 py-2 text-sm font-semibold text-accent">Fluidité moyenne : {summary.fluency}/100 · {summary.measured} réponse(s) mesurée(s)</p>
        )}
        <Btn onClick={() => onDone(summary ?? { fluency: null, seconds: 30, turns: 0 })} className="w-full max-w-sm">Continuer</Btn>
      </div>
    );
  }

  const line = inf?.shown ?? null;
  const target = inf?.target ?? "";
  const match = heard !== null && target ? wordMatch(target, heard) : null;
  const gap = step.kind === "fill" ? blanked(step.line, step.blank, gnd) : null;
  const freeOk = step.kind === "free" && heard !== null ? hebrewWords(heard) >= 2 : null;
  // Premier essai raté d'une étape de mémoire : indice, puis réessayer ; la réponse vient au deuxième essai.
  const retry = RETRY.has(step.kind) && match !== null && match < 70 && attempts === 1;
  const fix = retry && heard ? concreteFixes(heard, gnd, target)[0] : undefined;
  const reveal = heard !== null && (!RETRY.has(step.kind) || match === null || match >= 70 || attempts >= 2);
  const hideHebrew = step.kind === "recall" && !reveal && !hint;
  const canHint = inf?.help != null;

  return (
    <div className="mx-auto flex h-dvh max-w-lg lg:max-w-3xl flex-col">
      <Header title={day.title} onBack={() => { cancelSpeech(); onExit(); }} />
      <div className="flex gap-1 px-4 pt-1" aria-label={`Étape ${i + 1} sur ${day.steps.length}`}>
        {day.steps.map((_, k) => <span key={k} className={`h-1 flex-1 rounded-full ${k < i ? "bg-accent" : k === i ? "bg-accent/50" : "bg-accent/15"}`} />)}
      </div>

      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
        {...(step.kind === "intro"
          ? { role: "button", tabIndex: 0, "aria-label": "Continuer", onClick: next, onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && next() }
          : {})}
      >
        {step.kind === "intro" ? (
          <>
            <div className="relative flex w-full max-w-xs flex-col items-center rounded-3xl bg-card px-6 pb-16 pt-10 shadow-card">
              <Avatar speaking={talking} size={200} />
              <p className="absolute inset-x-4 bottom-4 mx-auto w-fit max-w-full rounded-md bg-[#2b2622]/85 px-3 py-1.5 text-[15px] font-semibold text-white">{step.fr}</p>
            </div>
          </>
        ) : step.kind === "retell" ? (
          <div className="w-full rounded-3xl bg-card p-6 shadow-card">
            <div className="flex justify-center"><Avatar speaking={talking} size={72} mood={rounds.length === 3 ? "cheer" : "happy"} /></div>
            <span className="mt-4 inline-block rounded-md bg-accent px-3 py-1.5 text-lg font-bold text-accent-ink">
              {rounds.length === 3 ? "Bravo !" : voice.listening ? `Parle… ${left ?? ""} s` : voice.transcribing ? "Transcription…" : `Tour ${rounds.length + 1} sur 3 · ${RETELL_SECONDS[rounds.length]} s`}
            </span>
            <p className="mt-4 text-sm text-muted">Réponds à la question, puis redis la même chose deux fois, en moins de temps : 60 s, 45 s, 30 s. Tu gagnes en aisance à chaque tour.</p>
            <p className={`${he} mt-6 text-2xl font-semibold leading-snug`}>{step.q.he[gnd]}</p>
            <p className="mt-1 text-muted">{step.q.tr[gnd]} — {step.q.fr}</p>
            {hint && (
              <div className="mt-4 rounded-xl bg-soft p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-accent">Par exemple</p>
                <p className={`${he} text-lg`}>{step.example.he[gnd]}</p>
                <p className="text-muted">{step.example.tr[gnd]} — {step.example.fr}</p>
              </div>
            )}
            {rounds.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm">
                {rounds.map((r, k) => (
                  <li key={k} className="flex justify-between rounded-lg bg-bg px-3 py-1.5">
                    <span>Tour {k + 1} ({RETELL_SECONDS[k]} s)</span>
                    <span className="text-muted">{r.words} mots{r.wpm !== null ? ` · ${r.wpm} mots/min` : ""}{r.fluency !== null ? ` · fluidité ${r.fluency}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {rounds.length === 3 && rounds[0].wpm !== null && rounds[2].wpm !== null && (
              <p className={`mt-3 text-sm font-semibold ${rounds[2].wpm > rounds[0].wpm ? "text-good" : "text-muted"}`}>
                {rounds[2].wpm > rounds[0].wpm ? `+${rounds[2].wpm - rounds[0].wpm} mots/min entre le premier et le dernier tour.` : "Même rythme : la prochaine fois, ose aller plus vite."}
              </p>
            )}
            <div className="mt-5 flex items-center justify-center gap-4">
              <button onClick={() => say(step.q.he[gnd], lang.speech, 0.75)} aria-label="Réécouter" className="grid size-12 place-items-center rounded-full bg-bg text-accent">
                <RiRestartLine aria-hidden className="size-6" />
              </button>
              {rounds.length < 3 && (
                <button onClick={() => (voice.listening ? voice.stop() : startRound())} disabled={voice.transcribing}
                  aria-label={voice.listening ? "Arrêter" : "Parler"} className="grid size-20 place-items-center rounded-full bg-bg text-accent disabled:opacity-50">
                  {voice.listening ? <RiPauseFill aria-hidden className="size-10" /> : <RiMicFill aria-hidden className="size-9" />}
                </button>
              )}
              <button onClick={() => setHint(!hint)} aria-label="Aide" className="grid size-12 place-items-center rounded-full bg-bg text-accent">
                <RiLightbulbLine aria-hidden className="size-6" />
              </button>
            </div>
            {voice.error && <p role="alert" className="mt-3 text-sm text-warn">{STT_ERRORS[voice.error]}</p>}
          </div>
        ) : step.kind === "listen" ? (
          <div className="w-full rounded-3xl bg-card p-6 shadow-card">
            <div className="flex justify-center"><Avatar speaking={talking} size={72} mood={solved ? "cheer" : tried.length ? "think" : "happy"} /></div>
            <span className="mt-4 inline-block rounded-md bg-accent px-3 py-1.5 text-lg font-bold text-accent-ink">{talking ? "Écoute…" : "Écoute et choisis"}</span>
            <p className="mt-4 text-muted">{step.ask}</p>
            <div className="mt-4 flex flex-col gap-2">
              {order.map((k) => {
                const o = step.options[k];
                const wrong = tried.includes(k);
                const right = solved && o.ok;
                return (
                  <button key={k} disabled={solved || wrong}
                    onClick={() => { if (o.ok) setSolved(true); else setTried((t) => [...t, k]); }}
                    className={`min-h-12 rounded-xl px-4 py-2 text-left font-semibold ${right ? "bg-good text-white" : wrong ? "bg-bg text-muted line-through opacity-60" : "bg-bg text-fg"}`}>
                    {o.fr}
                  </button>
                );
              })}
            </div>
            {tried.length > 0 && !solved && <p className="mt-3 text-sm text-muted">Pas tout à fait. Réécoute et réessaie.</p>}
            {solved && (
              <div className="mt-4 rounded-xl bg-soft p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-accent">Shuli a dit</p>
                <p className={`${he} text-lg`}>{step.say.he[gnd]}</p>
                <p className="text-muted">{step.say.tr[gnd]} — {step.say.fr}</p>
              </div>
            )}
            <div className="mt-5 flex justify-center">
              <button onClick={() => say(step.say.he[gnd], lang.speech, 0.75)} aria-label="Réécouter" className="grid size-12 place-items-center rounded-full bg-bg text-accent">
                <RiRestartLine aria-hidden className="size-6" />
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full rounded-3xl bg-card p-6 shadow-card">
            <div className="flex justify-center"><Avatar speaking={talking} size={72} mood={match === null ? "happy" : match >= 70 ? "cheer" : "think"} /></div>
            <span className="mt-4 inline-block rounded-md bg-accent px-3 py-1.5 text-lg font-bold text-accent-ink">
              {talking ? "Écoute…" : voice.opening ? "Ouverture du micro…" : voice.listening ? `${inf!.verb} maintenant…` : voice.transcribing ? "Transcription…" : inf!.verb}
            </span>
            {step.kind === "swap" && <p className="mt-4 rounded-xl bg-soft px-3 py-2 text-sm font-semibold text-accent">{step.instr}</p>}
            {step.kind === "free" && <p className="mt-4 text-sm text-muted">Réponds avec tes vraies infos.</p>}
            {line && (
              <>
                {hideHebrew ? (
                  <p className="mt-6 text-2xl font-semibold">{line.fr}</p>
                ) : (
                  <>
                    <p className={`${he} mt-6 text-3xl font-semibold leading-snug text-muted`}>{gap ? gap.he : line.he[gnd]}</p>
                    <p className="mt-1 text-muted">{gap ? gap.tr : line.tr[gnd]}</p>
                    <p className="mt-6">{line.fr}</p>
                  </>
                )}
                {step.kind === "shadow" && heard === null && <p className="mt-3 text-sm text-muted">Redis tout de suite, à la même vitesse, sans ralentir.</p>}
              </>
            )}
            {retry && (
              <div className="mt-4 rounded-xl border border-accent/40 bg-soft p-3 text-sm" role="status">
                <p className="font-semibold text-accent">Presque ! Réessaie.</p>
                <p>{fix ? cueOf(fix) : "Compare avec le sens en français et redis la phrase entière."}</p>
              </div>
            )}
            {inf?.help && step.kind !== "recall" && (hint || reveal) && (
              <div className="mt-4 rounded-xl bg-soft p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-accent">{step.kind === "free" ? "Par exemple" : "Tu peux dire"}</p>
                <p className={`${he} text-lg`}>{inf.help.he[gnd]}</p>
                <p className="text-muted">{inf.help.tr[gnd]} — {inf.help.fr}</p>
              </div>
            )}
            {heard !== null && (
              <div className="mt-4 text-sm">
                <p dir="auto" className={he}>Compris : « {heard} »</p>
                {match !== null && (
                  <p className={match >= 70 ? "text-good" : "text-muted"}>
                    {match}% des mots {step.kind === "answer" ? "de l'exemple" : "de la phrase"} retrouvés{match >= 70 ? " — bravo !" : ""}
                  </p>
                )}
                {freeOk !== null && (
                  <p className={freeOk ? "text-good" : "text-muted"}>{freeOk ? "Bien : une vraie réponse, avec tes infos !" : "Essaie avec une phrase complète, au moins deux mots."}</p>
                )}
                {metrics && (
                  <p className="mt-1 text-xs text-muted">
                    Fluidité {fluencyScore(metrics, hebrewWords(heard), profile.level)?.score ?? "—"}
                    {metrics.wpm !== null ? ` · ${metrics.wpm} mots/min` : ""} · {metrics.pauses} pause{metrics.pauses > 1 ? "s" : ""} · réaction {metrics.latency.toFixed(1)} s
                  </p>
                )}
                <p className="text-xs text-muted">Le texte reconnu est mesuré, pas ton accent.</p>
              </div>
            )}
            <div className="mt-5 flex items-center justify-center gap-4">
              <button onClick={() => { const at = i; voice.stop(); setHeard(null); say(line!.he[gnd], lang.speech, 0.75, () => stepRef.current === at && voice.start()); }} aria-label="Réécouter" className="grid size-12 place-items-center rounded-full bg-bg text-accent">
                <RiRestartLine aria-hidden className="size-6" />
              </button>
              <button onClick={() => (voice.listening ? voice.stop() : (cancelSpeech(), setHeard(null), voice.start()))} disabled={voice.transcribing}
                aria-label={voice.listening ? "Arrêter" : "Parler"}
                style={voice.listening && voice.level ? { boxShadow: `0 0 0 ${3 + voice.level * 16}px color-mix(in srgb, var(--accent) 22%, transparent)` } : undefined}
                className="grid size-20 place-items-center rounded-full bg-bg text-accent disabled:opacity-50">
                {voice.listening ? <RiPauseFill aria-hidden className="size-10" /> : <RiMicFill aria-hidden className="size-9" />}
              </button>
              {canHint && (
                <button onClick={() => setHint(!hint)} aria-label="Aide" className="grid size-12 place-items-center rounded-full bg-bg text-accent">
                  <RiLightbulbLine aria-hidden className="size-6" />
                </button>
              )}
            </div>
            {voice.error && <p role="alert" className="mt-3 text-sm text-warn">{STT_ERRORS[voice.error]}</p>}
          </div>
        )}
      </div>

      <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2 text-center">
        {step.kind === "intro" ? (
          <p className="text-sm uppercase tracking-wide text-muted">Touche pour continuer{countdown !== null ? ` · suite dans ${countdown}…` : ""}</p>
        ) : step.kind === "retell" ? (
          rounds.length === 3
            ? <Btn onClick={next} className="min-h-12 w-full">Continuer</Btn>
            : <button onClick={next} className="min-h-12 w-full text-sm uppercase tracking-wide text-muted">Passer</button>
        ) : step.kind === "listen" ? (
          solved
            ? <Btn onClick={next} className="min-h-12 w-full">Continuer</Btn>
            : <button onClick={next} className="min-h-12 w-full text-sm uppercase tracking-wide text-muted">Passer</button>
        ) : (
          heard !== null
            ? <Btn onClick={next} className="min-h-12 w-full">Continuer</Btn>
            : <button onClick={next} className="min-h-12 w-full text-sm uppercase tracking-wide text-muted">Passer</button>
        )}
      </div>
    </div>
  );
}
