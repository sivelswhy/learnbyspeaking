"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LANGUAGES, type Scenario } from "@/lib/languages";
import { complete, errorMessage, type LlmSettings, type Msg } from "@/lib/llm";
import {
  correctionsToWeakPoints, followUpMessages, withFollowUp, pickGender, replyFlaws, replyShots, tidyFollowUp, tidyReply, translateMessages,
  openingPrompt, replySystem,
} from "@/lib/prompts";
import { LEVEL_RATE, STT_ERRORS, cancelSpeech, hasVoice, speak, useRecognizer, useWhisperRecognizer } from "@/lib/speech";
import { judge } from "@/lib/judge";
import { scoreSessionAI } from "@/lib/sessionScore";
import { canTranslate, translateHebrew } from "@/lib/translate";
import type { Correction, Message, NewWord, Profile, SessionRecord } from "@/lib/types";
import {
  RiArrowLeftRightLine, RiHand, RiHeadphoneLine, RiLightbulbLine, RiMicFill, RiMicLine,
  RiRepeatLine, RiSendPlaneFill, RiStopFill, RiTranslate2, RiVolumeUpLine,
} from "react-icons/ri";
import { Avatar } from "./Avatar";
import { LlmSetup, allReady } from "./LlmSetup";
import { whisperStore } from "@/lib/whisper";
import { Btn, Header, wordMatch } from "./ui";

type Status = "idle" | "listening" | "thinking" | "speaking";
interface Assist {
  kind: "translate" | "rephrase";
  result: string;
  transliteration: string;
  example: string;
  source?: string;
  explain?: { natural: string; literal: string; tip: string; words: { word: string; transliteration: string; meaning: string; note: string }[] };
}

const STT_MSG = STT_ERRORS;

const uid = () => Math.random().toString(36).slice(2);

export function Conversation({
  profile,
  llm,
  setLlm,
  scenario: sc,
  pastCorrections,
  onExit,
  onFinish,
}: {
  profile: Profile;
  llm: LlmSettings;
  setLlm: (l: LlmSettings) => void;
  scenario: Scenario;
  pastCorrections: Correction[];
  onExit: () => void;
  onFinish: (rec: SessionRecord, words: NewWord[]) => void;
}) {
  const lang = LANGUAGES[profile.target];
  const [ready, setReady] = useState(() => allReady(llm, whisperStore.get()));
  const [messages, setMessages] = useState<Message[]>([]);
  const [rawStatus, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState("");
  const [handsFree, setHandsFree] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);
  const [assist, setAssist] = useState<Assist | null>(null);
  const [assistBusy, setAssistBusy] = useState(false);
  const [repeat, setRepeat] = useState<{ target: string; heard?: string; score?: number } | null>(null);
  const [finishing, setFinishing] = useState(false);

  const msgs = useRef<Message[]>([]);
  const sendRef = useRef<(t: string) => void>(() => {});
  const startRef = useRef<() => void>(() => {});
  const abort = useRef<AbortController | null>(null);
  const t0 = useRef(0);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const handsFreeRef = useRef(false);
  const repeatRef = useRef(false);
  const weak = useRef(correctionsToWeakPoints(pastCorrections));

  const update = useCallback((fn: (m: Message[]) => Message[]) => {
    msgs.current = fn(msgs.current);
    setMessages(msgs.current);
  }, []);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    repeatRef.current = repeat !== null && repeat.heard === undefined;
  }, [repeat]);
  useEffect(() => {
    hasVoice(lang.speech).then(setVoiceOk);
    return () => {
      cancelSpeech();
      abort.current?.abort();
    };
  }, [lang.speech]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming, rawStatus]);

  const onHeard = (heard: string) => {
    if (repeatRef.current) {
      setRepeat((r) => (r ? { ...r, heard, score: wordMatch(r.target, heard) } : r));
      setStatus("idle");
      return;
    }
    sendRef.current(heard);
  };
  const browserRec = useRecognizer(lang.speech, onHeard);
  const whisperRec = useWhisperRecognizer(profile.target, onHeard);
  const rec = llm.stt === "whisper" && whisperRec.supported ? whisperRec : browserRec;
  const level = rec === whisperRec ? whisperRec.level : 0;
  const transcribing = rec === whisperRec && whisperRec.transcribing;
  const status: Status = rawStatus === "listening" && !rec.listening ? "idle" : rawStatus;
  useEffect(() => {
    startRef.current = rec.start;
  });
  // Micro ouvert dès que la conversation est prête : le premier enregistrement ne perd pas le début de la phrase.
  const usesWhisper = rec === whisperRec;
  const prewarm = whisperRec.prewarm;
  useEffect(() => {
    if (ready && usesWhisper) prewarm();
  }, [ready, usesWhisper, prewarm]);

  const say = useCallback(
    async (t: string) => {
      setStatus("speaking");
      const ok = await speak(t, lang.speech, LEVEL_RATE[profile.level] ?? 0.9, () => {
        setStatus("idle");
        if (handsFreeRef.current) setTimeout(() => startRef.current(), 250);
      });
      if (!ok) setStatus("idle");
    },
    [lang.speech, profile.level],
  );

  /**
   * En arrière-plan : traduction de la réplique (pas de réponses suggérées : c'est à l'apprenant de répondre).
   * Pas de correction grammaticale automatique : nos tests montrent qu'un modèle local de 1,7 Md
   * change le sens des phrases et rate les fautes d'accord ; afficher ses « corrections » tromperait.
   */
  const analyze = useCallback(
    async (assistantId: string, reply: string, keepTranslation: boolean) => {
      try {
        // Traduction par un modèle dédié (opus-mt) ; à défaut, par le LLM, signalée comme approximative.
        let translation: string | null = null;
        let machine = true;
        if (!keepTranslation) {
          if (canTranslate(profile.target, profile.native)) {
            translation = await translateHebrew(reply, profile.native).catch(() => null);
            machine = false;
          }
          if (translation === null) {
            translation = (await complete(llm, { messages: translateMessages(profile, reply), temperature: 0.1, maxTokens: 100 })).split("\n")[0];
            machine = true;
          }
        }
        update((m) =>
          m.map((x) =>
            x.id === assistantId
              ? {
                  ...x,
                  analyzing: false,
                  extra: {
                    transliteration: x.extra?.transliteration ?? "",
                    translation: translation === null ? (x.extra?.translation ?? "") : translation.trim(),
                    machine: translation !== null && machine,
                    locked: x.extra?.locked,
                  },
                }
              : x,
          ),
        );
      } catch {
        update((m) => m.map((x) => (x.id === assistantId ? { ...x, analyzing: false } : x)));
      }
    },
    [llm, profile, update],
  );
  const newWords = useRef<NewWord[]>([]);

  const reply = useCallback(
    async () => {
      setStatus("thinking");
      setError("");
      setStreaming("");
      abort.current = new AbortController();
      const starter = !msgs.current.length ? sc.starters?.[profile.target] : undefined;
      if (starter) {
        // Première réplique écrite à la main : instantanée et sans faute.
        const g = profile.gender ?? "m";
        const id = uid();
        const text = starter.text[g];
        update((m) => [...m, {
          id, role: "assistant", text, analyzing: true,
          extra: { transliteration: starter.transliteration[g], translation: starter.translation[profile.native] ?? "", locked: !!starter.translation[profile.native] },
        }]);
        void analyze(id, text, !!starter.translation[profile.native]);
        await say(text);
        return;
      }
      const history: Msg[] = msgs.current.map((m) => ({ role: m.role, content: m.text }));
      if (!history.length) history.push({ role: "user", content: openingPrompt() });
      try {
        const said = msgs.current.filter((m) => m.role === "assistant").map((m) => m.text);
        const g = profile.gender ?? "m";
        let clean = "";
        let best = Infinity;
        // Jusqu'à 3 essais : on garde la réplique avec le moins de défauts (genre, longueur, pas de question, répétition…).
        for (const temperature of [0.5, 0.8, 1]) {
          const out = await complete(llm, {
            messages: [{ role: "system", content: replySystem(profile, sc, weak.current) }, ...replyShots(profile, sc.id), ...history],
            onToken: setStreaming,
            signal: abort.current.signal,
            maxTokens: 50,
            temperature,
            antiRepeat: true,
          });
          const cand = pickGender(tidyReply(out), g);
          const flaws = replyFlaws(cand, g, said);
          // Poids : genre, alphabet latin et répétition comptent plus qu'une question manquante.
          const cost = flaws.reduce((a, f) => a + (f === "sans question" || f === "long" ? 1 : 3), 0);
          if (cost < best) {
            best = cost;
            clean = cand;
          }
          if (cost === 0 || abort.current.signal.aborted) break;
        }
        // Pas de question : on en ajoute une courte, pour que l'apprenant sache quoi répondre.
        const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
        if (clean && !clean.includes("?") && lastUser && !abort.current.signal.aborted) {
          const q = tidyFollowUp(await complete(llm, { messages: followUpMessages(profile, lastUser, clean), temperature: 0.3, maxTokens: 25 }), g);
          if (q && !said.some((x) => x.includes(q))) clean = withFollowUp(clean, q);
        }
        setStreaming("");
        if (!clean) {
          setStatus("idle");
          return;
        }
        const id = uid();
        update((m) => [...m, { id, role: "assistant", text: clean, analyzing: true }]);
        void analyze(id, clean, false);
        await say(clean);
      } catch (e) {
        setStreaming("");
        setStatus("idle");
        if (!abort.current?.signal.aborted) setError(errorMessage(e));
      }
    },
    [llm, profile, sc, update, analyze, say],
  );

  const send = useCallback(
    async (t: string) => {
      const value = t.trim();
      if (!value) return;
      cancelSpeech();
      const id = uid();
      update((m) => [...m, { id, role: "user", text: value }]);
      setText("");
      setAssist(null);
      await reply();
    },
    [reply, update],
  );
  useEffect(() => {
    sendRef.current = (t) => void send(t);
  }, [send]);

  useEffect(() => {
    if (ready && !started.current) {
      started.current = true;
      t0.current = Date.now();
      void reply();
    }
  }, [ready, reply]);

  function mic() {
    setRepeat(null);
    if (rec.listening) return rec.stop();
    cancelSpeech();
    setError("");
    rec.clearError();
    setStatus("listening");
    rec.start();
  }

  function interrupt() {
    abort.current?.abort();
    cancelSpeech();
    rec.stop();
    setStatus("idle");
  }
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  /**
   * « Traduire » : traducteur dédié d'abord. DictaLM seulement à défaut (ses consignes JSON donnaient des paragraphes).
   */
  async function runAssist(kind: Assist["kind"], t: string) {
    setAssistBusy(true);
    setAssist(null);
    const toNative = async (he: string) =>
      (canTranslate(profile.target, profile.native) ? await translateHebrew(he, profile.native).catch(() => "") : "") ||
      (await complete(llm, { messages: translateMessages(profile, he), temperature: 0.1, maxTokens: 100 })).split("\n")[0];
    try {
      setAssist({ kind, result: await toNative(t), transliteration: "", example: "" });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setAssistBusy(false);
    }
  }

  async function finish() {
    interrupt();
    const userTurns = msgs.current.filter((m) => m.role === "user");
    const seconds = Math.round((Date.now() - t0.current) / 1000);
    if (!userTurns.length) return onExit();
    setFinishing(true);
    const corrections = msgs.current.flatMap((m) => (m.correction ? [m.correction] : []));
    const base: SessionRecord = {
      id: uid(), date: new Date().toISOString(), scenarioId: sc.id, title: sc.title, seconds, turns: userTurns.length,
      corrections, words: newWords.current,
    };
    // Chaque réponse avec la réplique de Noam qui la précède : l'IA juge si elle y répond et si elle est correcte.
    const turns = msgs.current.flatMap((m, i) =>
      m.role === "user" ? [{ question: [...msgs.current.slice(0, i)].reverse().find((x) => x.role === "assistant")?.text ?? "", answer: m.text }] : [],
    );
    base.report = await scoreSessionAI(turns, profile.level, (t) => judge(llm, t.question, t.answer, profile.gender ?? "m"));
    onFinish(base, newWords.current);
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg">
        <Header title="Préparer le tuteur" onBack={onExit} />
        <div className="p-4">
          <LlmSetup llm={llm} onChange={setLlm} onReady={() => setReady(true)} />
        </div>
      </div>
    );
  }

  const busy = status === "thinking";
  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col">
      <Header
        title={sc.title}
        onBack={onExit}
        right={<Btn variant="ghost" onClick={finish} disabled={finishing} className="!min-h-9">{finishing ? "Bilan…" : "Terminer"}</Btn>}
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p className="rounded-xl bg-accent/10 p-3 text-sm text-accent">
          <b>{sc.opening}</b> Objectif : {sc.goal}.
        </p>
        {!voiceOk && (
          <p className="rounded-xl bg-warn/10 p-3 text-sm text-warn">
            Aucune voix {lang.name.toLowerCase()} sur cet appareil : tu liras sans entendre. Installe-la dans les réglages
            système (macOS : Accessibilité → Contenu énoncé → Voix → Hébreu).
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} rtl={lang.rtl} lang={lang.speech}
            onSpeak={(t) => say(t)} onAssist={runAssist} onUse={(t) => setText(t)}
            onRepeat={(t) => { setRepeat({ target: t }); setStatus("listening"); cancelSpeech(); rec.start(); }}
            nativeName={LANGUAGES[profile.native].name} />
        ))}
        {streaming && (
          <div className={`max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3 ${lang.rtl ? "he text-lg" : ""}`}>{streaming}</div>
        )}
        {busy && !streaming && <p className="text-sm text-muted">Le tuteur réfléchit…</p>}
        {(assistBusy || assist) && (
          <div className="rounded-2xl border border-accent/40 bg-card p-3 text-sm">
            {assistBusy ? "…" : assist && (
              <>
                <p className="mb-1 text-xs font-semibold uppercase text-accent">
                  {{ translate: "Traduction", explain: "Explication", rephrase: "Plus naturel",  }[assist.kind]}
                </p>
                {assist.explain ? (
                  <div className="space-y-2">
                    <p className={`${lang.rtl ? "he " : ""}text-lg`}>{assist.source}</p>
                    <p><b>Sens :</b> {assist.explain.natural}</p>
                    {assist.explain.literal && <p className="text-muted"><b>Mot à mot :</b> {assist.explain.literal}</p>}
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {assist.explain.words.map((w, i) => (
                        <li key={i} className="flex items-start gap-3 px-3 py-2">
                          <button onClick={() => say(w.word)} aria-label={`Écouter ${w.word}`} className="mt-0.5 shrink-0 text-accent"><RiVolumeUpLine aria-hidden /></button>
                          <span className="min-w-0 flex-1">
                            <span className={`${lang.rtl ? "he " : ""}text-base font-semibold`}>{w.word}</span>
                            {w.transliteration && <span className="ms-2 text-muted">{w.transliteration}</span>}
                            <span className="block">{w.meaning}</span>
                            {w.note && <span className="block text-xs text-muted">{w.note}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {assist.explain.tip && <p className="flex gap-1.5"><RiLightbulbLine aria-hidden className="mt-0.5 shrink-0 text-accent" /> {assist.explain.tip}</p>}
                  </div>
                ) : (
                  <>
                    <p className={assist.kind === "rephrase" ? `${lang.rtl ? "he " : ""}text-lg` : ""}>{assist.result}</p>
                    {assist.transliteration && <p className="text-muted">{assist.transliteration}</p>}
                    {assist.example && <p className="mt-1 text-muted">{assist.example}</p>}
                  </>
                )}
                {assist.kind === "rephrase" && (
                  <div className="mt-2 flex gap-2">
                    <Btn variant="soft" onClick={() => say(assist.result)} className="flex items-center gap-1.5"><RiVolumeUpLine aria-hidden /> Écouter</Btn>
                    <Btn variant="soft" onClick={() => setText(assist.result)} className="flex items-center gap-1.5"><RiArrowLeftRightLine aria-hidden /> Utiliser</Btn>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {repeat && (
          <div className="rounded-2xl bg-card shadow-card p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-muted">Répète la phrase</p>
            <p className={`${lang.rtl ? "he" : ""} text-lg`}>{repeat.target}</p>
            {repeat.heard === undefined ? (
              <p className="text-muted">{rec.listening ? "Je t'écoute…" : "…"}</p>
            ) : (
              <>
                <p className={`mt-1 ${lang.rtl ? "he" : ""}`}>Compris : « {repeat.heard} »</p>
                <p className="text-muted">
                  {repeat.score}% des mots retrouvés. Mesure du texte reconnu, pas de ton accent.
                </p>
              </>
            )}
          </div>
        )}
        {error && <p role="alert" className="rounded-xl bg-warn/10 p-3 text-sm text-warn">{error}</p>}
        {rec.error && <p role="alert" className="rounded-xl bg-warn/10 p-3 text-sm text-warn">{STT_MSG[rec.error]}</p>}
        <div ref={bottom} />
      </div>

      <div className="border-t border-line bg-bg px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="mb-3 flex gap-2">
          <input
            value={text} onChange={(e) => setText(e.target.value)}
            dir="auto" placeholder="Ou écris ta réponse…" aria-label="Ta réponse"
            className="min-h-11 flex-1 rounded-xl border border-line bg-card px-3 text-base"
          />
          <Btn type="submit" disabled={!text.trim() || busy} aria-label="Envoyer" className="grid w-11 place-items-center !px-0"><RiSendPlaneFill aria-hidden className="size-5" /></Btn>
        </form>
        {rec.interim && <p className={`mb-2 text-center text-muted ${lang.rtl ? "he" : ""}`}>{rec.interim}</p>}
        <div className="flex items-center justify-between">
          <div className="flex w-24 flex-col gap-1">
            <Btn variant="ghost" onClick={() => lastAssistant && say(lastAssistant.text)} disabled={!lastAssistant} className="flex !min-h-9 items-center justify-center gap-1 !px-2"><RiRepeatLine aria-hidden /> Répéter</Btn>
          </div>
          <button
            onClick={mic} disabled={busy || finishing || transcribing}
            aria-label={rec.listening ? "Arrêter l'écoute" : "Parler"}
            style={rec.listening && level ? { boxShadow: `0 0 0 ${4 + level * 22}px color-mix(in srgb, var(--accent) 25%, transparent)` } : undefined}
            className={`grid size-20 place-items-center rounded-full bg-accent text-accent-ink transition-shadow duration-75 disabled:opacity-40 ${rec.listening && !level ? "listening" : ""}`}
          >
            {rec.listening ? <RiStopFill aria-hidden className="size-8" /> : <RiMicFill aria-hidden className="size-9" />}
          </button>
          <div className="flex w-24 flex-col gap-1">
            <Btn variant="ghost" onClick={interrupt} disabled={status === "idle"} className="flex !min-h-9 items-center justify-center gap-1 !px-2"><RiHand aria-hidden /> Stop</Btn>
            <Btn variant={handsFree ? "solid" : "ghost"} onClick={() => setHandsFree(!handsFree)} className="flex !min-h-9 items-center justify-center gap-1 !px-2">
              <RiHeadphoneLine aria-hidden /> Mains libres
            </Btn>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted" aria-live="polite">
          {transcribing
            ? "Transcription…"
            : {
                idle: "Appuie sur le micro pour parler",
                listening: rec === whisperRec ? "Je t'écoute… (arrêt auto quand tu te tais)" : "Je t'écoute…",
                thinking: "Réflexion…",
                speaking: "Le tuteur parle…",
              }[status]}
        </p>
      </div>
    </div>
  );
}


function Bubble({
  m, rtl, lang, onSpeak, onAssist, onUse, onRepeat, nativeName,
}: {
  m: Message; rtl: boolean; lang: string; nativeName: string;
  onSpeak: (t: string) => void; onAssist: (k: Assist["kind"], t: string) => void;
  onUse: (t: string) => void; onRepeat: (t: string) => void;
}) {
  const [showTr, setShowTr] = useState(false);
  const user = m.role === "user";
  const he = rtl ? "he" : "";
  return (
    <div className={`flex flex-col gap-2 ${user ? "items-end" : "items-start"}`}>
      {!user && <p className="flex items-center gap-2 text-sm"><Avatar size={26} /> <b>Noam</b></p>}
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${user ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md border border-line bg-card"}`}>
        <p className={`${he} text-lg leading-snug`} lang={lang}>{m.text}</p>
        {!user && m.extra?.transliteration && <p className="mt-1 text-sm text-muted">{m.extra.transliteration}</p>}
        {!user && showTr && m.extra?.translation && (
          <p className="mt-1 border-t border-line pt-1 text-sm">
            {m.extra.translation}
            {m.extra.machine && <span className="block text-xs text-muted">Traduction automatique, peut contenir des erreurs.</span>}
          </p>
        )}
      </div>
      {!user && (
        <div className="flex flex-wrap gap-1.5">
          <Pill onClick={() => onSpeak(m.text)} aria-label="Écouter"><RiVolumeUpLine aria-hidden /></Pill>
          <Pill onClick={() => (m.extra?.translation ? setShowTr(!showTr) : onAssist("translate", m.text))}>
            <RiTranslate2 aria-hidden /> {m.analyzing && !m.extra ? "…" : `Traduire (${nativeName})`}
          </Pill>
        </div>
      )}
      {user && m.correction && (
        <div className="w-full max-w-[92%] space-y-1 rounded-2xl border border-warn/40 bg-card p-3 text-sm">
          <p className="text-xs font-semibold uppercase text-warn">Correction · {m.correction.category}</p>
          <p className={`${he} text-muted line-through`}>{m.correction.original}</p>
          <p className={`${he} text-lg font-medium text-good`}>{m.correction.corrected}</p>
          <p>{m.correction.explanation}</p>
          {m.correction.natural !== m.correction.corrected && (
            <p className="text-muted">Plus naturel : <span className={he}>{m.correction.natural}</span></p>
          )}
          <div className="flex gap-2 pt-1">
            <Btn variant="soft" onClick={() => onSpeak(m.correction!.corrected)} className="flex !min-h-9 items-center gap-1"><RiVolumeUpLine aria-hidden /> Écouter</Btn>
            <Btn variant="soft" onClick={() => onRepeat(m.correction!.corrected)} className="flex !min-h-9 items-center gap-1"><RiMicLine aria-hidden /> Répéter</Btn>
            <Btn variant="soft" onClick={() => onUse(m.correction!.corrected)} className="!min-h-9">Renvoyer</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className="flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-xs text-muted active:bg-line">{children}</button>;
}
