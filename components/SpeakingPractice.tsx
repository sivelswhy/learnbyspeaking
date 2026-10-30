"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RiCheckboxCircleFill, RiLightbulbLine, RiMicFill, RiPauseFill, RiRestartLine } from "react-icons/ri";
import type { Day, Step } from "@/lib/content/course-he";
import { LANGUAGES } from "@/lib/languages";
import type { LlmSettings } from "@/lib/llm";
import { LEVEL_RATE, STT_ERRORS, cancelSpeech, speak, useVoiceInput } from "@/lib/speech";
import type { Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Btn, Header, wordMatch } from "./ui";

/** Entraînement guidé : Noa parle (sous-titres), puis l'apprenant répète ou répond à voix haute. */
export function SpeakingPractice({ day, profile, llm, onExit, onDone }: { day: Day; profile: Profile; llm: LlmSettings; onExit: () => void; onDone: () => void }) {
  const lang = LANGUAGES[profile.target];
  const gnd = profile.gender ?? "m";
  const he = lang.rtl ? "he" : "";
  const [i, setI] = useState(0);
  const [talking, setTalking] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const step: Step | undefined = day.steps[i];
  const finished = i >= day.steps.length;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const voice = useVoiceInput(llm.stt, profile.target, lang.speech, (t) => setHeard(t));

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

  const next = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setCountdown(null);
    cancelSpeech();
    voice.stop();
    setHeard(null);
    setHint(false);
    setI((x) => x + 1);
  }, [voice]);

  // Lecture de chaque étape à son arrivée.
  useEffect(() => {
    if (!step) return;
    const rate = LEVEL_RATE[profile.level] ?? 0.85;
    if (step.kind === "intro") {
      say(step.fr, "fr-FR", 1, () => {
        let n = 3;
        setCountdown(n);
        timer.current = setInterval(() => {
          n -= 1;
          setCountdown(n);
          if (n <= 0) next();
        }, 1000);
      });
    } else {
      const text = step.kind === "repeat" ? step.line.he[gnd] : step.q.he[gnd];
      say(text, lang.speech, rate, () => voice.start());
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cancelSpeech(), []);

  if (finished) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <RiCheckboxCircleFill aria-hidden className="size-16 text-good" />
        <h1 className="text-2xl font-bold">Entraînement terminé !</h1>
        <p className="text-muted">Tu as pratiqué « {day.title} ». Passe au jeu de rôle pour l&apos;utiliser en vraie conversation.</p>
        <Btn onClick={onDone} className="w-full max-w-sm">Continuer</Btn>
      </div>
    );
  }

  const line = step.kind === "repeat" ? step.line : step.kind === "answer" ? step.q : null;
  const target = step.kind === "repeat" ? step.line.he[gnd] : step.kind === "answer" ? step.a.he[gnd] : "";
  const match = heard !== null && target ? wordMatch(target, heard) : null;

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col">
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
        ) : (
          <div className="w-full rounded-3xl bg-card p-6 shadow-card">
            <div className="flex justify-center"><Avatar speaking={talking} size={72} /></div>
            <span className="mt-4 inline-block rounded-md bg-accent px-3 py-1.5 text-lg font-bold text-accent-ink">
              {talking ? "Écoute…" : voice.listening ? (step.kind === "repeat" ? "Répète maintenant…" : "Réponds maintenant…") : voice.transcribing ? "Transcription…" : step.kind === "repeat" ? "Répète" : "Réponds"}
            </span>
            {line && (
              <>
                <p className={`${he} mt-6 text-3xl font-semibold leading-snug text-muted`}>{line.he[gnd]}</p>
                <p className="mt-1 text-muted">{line.tr[gnd]}</p>
                <p className="mt-6">{line.fr}</p>
              </>
            )}
            {step.kind === "answer" && (hint || heard !== null) && (
              <div className="mt-4 rounded-xl bg-soft p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-accent">Tu peux dire</p>
                <p className={`${he} text-lg`}>{step.a.he[gnd]}</p>
                <p className="text-muted">{step.a.tr[gnd]} — {step.a.fr}</p>
              </div>
            )}
            {heard !== null && (
              <div className="mt-4 text-sm">
                <p dir="auto" className={he}>Compris : « {heard} »</p>
                {match !== null && (
                  <p className={match >= 70 ? "text-good" : "text-muted"}>
                    {match}% des mots {step.kind === "repeat" ? "de la phrase" : "de l'exemple"} retrouvés{match >= 70 ? " — bravo !" : ""}
                  </p>
                )}
                <p className="text-xs text-muted">Mesure du texte reconnu, pas de ton accent.</p>
              </div>
            )}
            <div className="mt-5 flex items-center justify-center gap-4">
              <button onClick={() => { voice.stop(); setHeard(null); say(line!.he[gnd], lang.speech, 0.75, () => voice.start()); }} aria-label="Réécouter" className="grid size-12 place-items-center rounded-full bg-bg text-accent">
                <RiRestartLine aria-hidden className="size-6" />
              </button>
              <button onClick={() => (voice.listening ? voice.stop() : (cancelSpeech(), setHeard(null), voice.start()))} disabled={voice.transcribing}
                aria-label={voice.listening ? "Arrêter" : "Parler"}
                style={voice.listening && voice.level ? { boxShadow: `0 0 0 ${3 + voice.level * 16}px color-mix(in srgb, var(--accent) 22%, transparent)` } : undefined}
                className="grid size-20 place-items-center rounded-full bg-bg text-accent disabled:opacity-50">
                {voice.listening ? <RiPauseFill aria-hidden className="size-10" /> : <RiMicFill aria-hidden className="size-9" />}
              </button>
              {step.kind === "answer" && (
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
        ) : (
          heard !== null
            ? <Btn onClick={next} className="min-h-12 w-full">Continuer</Btn>
            : <button onClick={next} className="min-h-12 w-full text-sm uppercase tracking-wide text-muted">Passer</button>
        )}
      </div>
    </div>
  );
}
