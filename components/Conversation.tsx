"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LANGUAGES, SCENARIOS } from "@/lib/languages";
import { complete, errorMessage, isReady, parseJson, type LlmSettings, type Msg } from "@/lib/llm";
import {
  analysisSchema, analysisSystem, assistSchema, assistSystem, correctionsToWeakPoints,
  openingPrompt, replySystem, reportSchema, reportSystem,
} from "@/lib/prompts";
import { LEVEL_RATE, cancelSpeech, hasVoice, speak, useRecognizer, type SttError } from "@/lib/speech";
import type { Correction, Message, NewWord, Profile, SessionRecord } from "@/lib/types";
import { LlmSetup } from "./LlmSetup";
import { Btn, Header, wordMatch } from "./ui";

type Status = "idle" | "listening" | "thinking" | "speaking";
interface Assist {
  kind: "translate" | "explain" | "rephrase" | "help";
  result: string;
  transliteration: string;
  example: string;
}

const STT_MSG: Record<SttError, string> = {
  denied: "Micro refusé. Autorise-le dans les réglages du navigateur (icône 🔒 de la barre d'adresse), ou écris ta réponse.",
  "no-speech": "Je n'ai rien entendu. Réessaie en parlant un peu plus près, ou écris.",
  network: "La reconnaissance vocale a perdu le réseau. Réessaie, ou écris ta réponse.",
  unsupported: "Ce navigateur ne gère pas la reconnaissance vocale. Utilise Chrome, Edge ou Safari, ou écris.",
  other: "Problème de micro. Réessaie, ou écris ta réponse.",
};

const uid = () => Math.random().toString(36).slice(2);

export function Conversation({
  profile,
  llm,
  setLlm,
  scenarioId,
  pastCorrections,
  onExit,
  onFinish,
}: {
  profile: Profile;
  llm: LlmSettings;
  setLlm: (l: LlmSettings) => void;
  scenarioId: string;
  pastCorrections: Correction[];
  onExit: () => void;
  onFinish: (rec: SessionRecord, words: NewWord[]) => void;
}) {
  const lang = LANGUAGES[profile.target];
  const sc = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const [ready, setReady] = useState(() => isReady(llm));
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

  const rec = useRecognizer(lang.speech, (heard) => {
    if (repeatRef.current) {
      setRepeat((r) => (r ? { ...r, heard, score: wordMatch(r.target, heard) } : r));
      setStatus("idle");
      return;
    }
    sendRef.current(heard);
  });
  const status: Status = rawStatus === "listening" && !rec.listening ? "idle" : rawStatus;
  useEffect(() => {
    startRef.current = rec.start;
  });

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

  /** Analyse en arrière-plan : n'empêche pas la conversation de continuer. */
  const analyze = useCallback(
    async (assistantId: string, userId: string | null, userText: string, reply: string) => {
      try {
        const raw = await complete(llm, {
          messages: [
            { role: "system", content: analysisSystem(profile) },
            { role: "user", content: JSON.stringify({ learner: userText, partner: reply }) },
          ],
          schema: analysisSchema,
          temperature: 0.2,
          maxTokens: 500,
        });
        const a = parseJson<{
          transliteration?: string; translation?: string; suggestions?: string[]; newWords?: NewWord[];
          correction?: { has_error: boolean; corrected: string; explanation: string; natural: string; category: Correction["category"] };
        }>(raw, {});
        const c = a.correction;
        const correction: Correction | null =
          userId && c?.has_error && c.corrected && norm1(c.corrected) !== norm1(userText)
            ? { original: userText, corrected: c.corrected, explanation: c.explanation, natural: c.natural || c.corrected, category: c.category }
            : null;
        update((m) =>
          m.map((x) =>
            x.id === assistantId
              ? { ...x, analyzing: false, extra: { transliteration: a.transliteration ?? "", translation: a.translation ?? "", suggestions: a.suggestions ?? [] } }
              : x.id === userId ? { ...x, correction } : x,
          ),
        );
        newWords.current.push(...(a.newWords ?? []).filter((w) => w.word));
      } catch {
        update((m) => m.map((x) => (x.id === assistantId ? { ...x, analyzing: false } : x)));
      }
    },
    [llm, profile, update],
  );
  const newWords = useRef<NewWord[]>([]);

  const reply = useCallback(
    async (userText: string | null, userId: string | null) => {
      setStatus("thinking");
      setError("");
      setStreaming("");
      abort.current = new AbortController();
      const history: Msg[] = msgs.current.map((m) => ({ role: m.role, content: m.text }));
      if (!history.length) history.push({ role: "user", content: openingPrompt() });
      try {
        const out = await complete(llm, {
          messages: [{ role: "system", content: replySystem(profile, scenarioId, weak.current) }, ...history],
          onToken: setStreaming,
          signal: abort.current.signal,
          maxTokens: 160,
        });
        const clean = out.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        setStreaming("");
        if (!clean) {
          setStatus("idle");
          return;
        }
        const id = uid();
        update((m) => [...m, { id, role: "assistant", text: clean, analyzing: true }]);
        void analyze(id, userId, userText ?? "", clean);
        await say(clean);
      } catch (e) {
        setStreaming("");
        setStatus("idle");
        if (!abort.current?.signal.aborted) setError(errorMessage(e));
      }
    },
    [llm, profile, scenarioId, update, analyze, say],
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
      await reply(value, id);
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
      void reply(null, null);
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

  async function runAssist(kind: Assist["kind"], t: string) {
    setAssistBusy(true);
    setAssist(null);
    try {
      const raw = await complete(llm, {
        messages: [{ role: "system", content: assistSystem(profile, kind) }, { role: "user", content: t }],
        schema: assistSchema,
        temperature: 0.2,
        maxTokens: 400,
      });
      const r = parseJson<Partial<Assist>>(raw, {});
      setAssist({ kind, result: r.result ?? "", transliteration: r.transliteration ?? "", example: r.example ?? "" });
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
      id: uid(), date: new Date().toISOString(), scenarioId, seconds, turns: userTurns.length,
      corrections, words: newWords.current,
    };
    try {
      const raw = await complete(llm, {
        messages: [
          { role: "system", content: reportSystem(profile, userTurns.length) },
          { role: "user", content: JSON.stringify({ transcript: msgs.current.map((m) => ({ role: m.role, text: m.text })), corrections: corrections.slice(0, 15) }) },
        ],
        schema: reportSchema,
        temperature: 0.2,
        maxTokens: 500,
      });
      const r = parseJson<Partial<{ grammar: number; vocabulary: number; fluency: number; mainErrors: string[]; tips: string[]; summary: string }>>(raw, {});
      const cl = (n?: number) => Math.max(0, Math.min(100, Math.round(n ?? 0)));
      const g = cl(r.grammar), v = cl(r.vocabulary), f = cl(r.fluency);
      base.report = {
        grammar: g, vocabulary: v, fluency: f, score: Math.round(g * 0.4 + v * 0.3 + f * 0.3),
        scoreExplanation: "Score = 40 % grammaire + 30 % vocabulaire + 30 % fluidité, estimés par l'IA locale sur la transcription de tes réponses. La prononciation n'est pas notée : le navigateur ne permet pas de la mesurer.",
        mainErrors: r.mainErrors ?? [], tips: r.tips ?? [], summary: r.summary ?? "",
      };
    } catch {
      /* rapport indisponible : la session est quand même sauvegardée */
    }
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
        title={`${sc.emoji} ${sc.title}`}
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
                  {{ translate: "Traduction", explain: "Explication", rephrase: "Plus naturel", help: "Tu peux répondre" }[assist.kind]}
                </p>
                <p className={assist.kind === "rephrase" || assist.kind === "help" ? `${lang.rtl ? "he " : ""}text-lg` : ""}>{assist.result}</p>
                {assist.transliteration && <p className="text-muted">{assist.transliteration}</p>}
                {assist.example && <p className={`mt-1 ${assist.kind === "explain" && lang.rtl ? "he" : ""} text-muted`}>{assist.example}</p>}
                {(assist.kind === "rephrase" || assist.kind === "help") && (
                  <div className="mt-2 flex gap-2">
                    <Btn variant="soft" onClick={() => say(assist.result)}>🔊 Écouter</Btn>
                    <Btn variant="soft" onClick={() => setText(assist.result)}>Utiliser</Btn>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {repeat && (
          <div className="rounded-2xl border border-line bg-card p-3 text-sm">
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
        {lastAssistant?.extra?.suggestions?.length ? (
          <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1">
            {lastAssistant.extra.suggestions.map((s) => (
              <button key={s} onClick={() => setText(s)} className={`${lang.rtl ? "he" : ""} min-h-9 shrink-0 rounded-full border border-line bg-card px-3 text-sm`}>{s}</button>
            ))}
          </div>
        ) : null}
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="mb-3 flex gap-2">
          <input
            value={text} onChange={(e) => setText(e.target.value)}
            dir="auto" placeholder="Ou écris ta réponse…" aria-label="Ta réponse"
            className="min-h-11 flex-1 rounded-xl border border-line bg-card px-3 text-base"
          />
          <Btn type="submit" disabled={!text.trim() || busy}>Envoyer</Btn>
        </form>
        {rec.interim && <p className={`mb-2 text-center text-muted ${lang.rtl ? "he" : ""}`}>{rec.interim}</p>}
        <div className="flex items-center justify-between">
          <div className="flex w-24 flex-col gap-1">
            <Btn variant="ghost" onClick={() => lastAssistant && say(lastAssistant.text)} disabled={!lastAssistant} className="!min-h-9 !px-2">↻ Répéter</Btn>
            <Btn variant="ghost" onClick={() => lastAssistant && runAssist("help", lastAssistant.text)} disabled={!lastAssistant || assistBusy} className="!min-h-9 !px-2">🆘 Aide</Btn>
          </div>
          <button
            onClick={mic} disabled={busy || finishing}
            aria-label={rec.listening ? "Arrêter l'écoute" : "Parler"}
            className={`grid size-20 place-items-center rounded-full bg-accent text-3xl text-accent-ink disabled:opacity-40 ${rec.listening ? "listening" : ""}`}
          >
            {rec.listening ? "■" : "🎤"}
          </button>
          <div className="flex w-24 flex-col gap-1">
            <Btn variant="ghost" onClick={interrupt} disabled={status === "idle"} className="!min-h-9 !px-2">✋ Stop</Btn>
            <Btn variant={handsFree ? "solid" : "ghost"} onClick={() => setHandsFree(!handsFree)} className="!min-h-9 !px-2">
              Mains libres
            </Btn>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted" aria-live="polite">
          {{ idle: "Appuie sur le micro pour parler", listening: "Je t'écoute…", thinking: "Réflexion…", speaking: "Le tuteur parle…" }[status]}
        </p>
      </div>
    </div>
  );
}

const norm1 = (s: string) => s.replace(/[֑-ׇ]/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

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
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${user ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md border border-line bg-card"}`}>
        <p className={`${he} text-lg leading-snug`} lang={lang}>{m.text}</p>
        {!user && m.extra?.transliteration && <p className="mt-1 text-sm text-muted">{m.extra.transliteration}</p>}
        {!user && showTr && m.extra?.translation && <p className="mt-1 border-t border-line pt-1 text-sm">{m.extra.translation}</p>}
      </div>
      {!user && (
        <div className="flex flex-wrap gap-1.5">
          <Pill onClick={() => onSpeak(m.text)}>🔊</Pill>
          <Pill onClick={() => (m.extra?.translation ? setShowTr(!showTr) : onAssist("translate", m.text))}>
            {m.analyzing && !m.extra ? "…" : `Traduire (${nativeName})`}
          </Pill>
          <Pill onClick={() => onAssist("explain", m.text)}>Expliquer</Pill>
        </div>
      )}
      {user && (
        <div className="flex gap-1.5">
          <Pill onClick={() => onAssist("rephrase", m.text)}>Reformuler</Pill>
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
            <Btn variant="soft" onClick={() => onSpeak(m.correction!.corrected)} className="!min-h-9">🔊 Écouter</Btn>
            <Btn variant="soft" onClick={() => onRepeat(m.correction!.corrected)} className="!min-h-9">🎤 Répéter</Btn>
            <Btn variant="soft" onClick={() => onUse(m.correction!.corrected)} className="!min-h-9">Renvoyer</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className="min-h-9 rounded-full border border-line px-3 text-xs text-muted active:bg-line">{children}</button>;
}
