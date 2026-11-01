"use client";
import { useEffect, useRef, useState } from "react";
import { RiSendPlaneFill, RiVolumeUpLine } from "react-icons/ri";
import { LANGUAGES } from "@/lib/languages";
import { complete, errorMessage, type LlmSettings, type Msg } from "@/lib/llm";
import { ALL_DAYS, type Line } from "@/lib/content/course-he";
import { ALPHABET, GRAMMAR, PHRASES, THEMES, type Word } from "@/lib/content/resources-he";
import { MODES, toolSystem, type ModeId } from "@/lib/modes";
import { translateMessages } from "@/lib/prompts";
import { defineWord, formatDefinition, plain, wordOf } from "@/lib/define";
import { sayInHebrew } from "@/lib/sayInHebrew";
import { canTranslate, translateHebrew } from "@/lib/translate";
import { speak } from "@/lib/speech";
import type { Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { LlmSetup, allReady } from "./LlmSetup";
import { Btn, Header } from "./ui";
import { whisperStore } from "@/lib/whisper";

const HEBREW = /[֐-׿]/;

/** Comparaison sans nikud, sans accents ni majuscules : « hopital » trouve « hôpital ». */
const strip = (w: string) => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f\u0591-\u05C7]/g, "").replace(/[^\p{L}\s']/gu, "").trim();

/** Phrases du cours, au genre de l'apprenant. */
function courseWords(gender: "m" | "f"): Word[] {
  const lines: Line[] = ALL_DAYS.flatMap(({ day }) => [day.key, ...day.steps.flatMap((s) => (s.kind === "repeat" ? [s.line] : s.kind === "answer" ? [s.q, s.a] : []))]);
  return lines.map((l) => ({ he: l.he[gender], tr: l.tr[gender], fr: l.fr }));
}

/** Cherche un mot ou une phrase dans la banque de ressources et le cours (hébreu, translittération ou sens). */
function lookup(q: string, gender: "m" | "f"): Word | null {
  const k = strip(q);
  if (!k) return null;
  const all: Word[] = [...THEMES.flatMap((t) => t.words), ...PHRASES, ...GRAMMAR.flatMap((g) => g.examples), ...ALPHABET.map((l) => ({ ...l.example })), ...courseWords(gender)];
  return all.find((w) => strip(w.he) === k || strip(w.tr) === k || w.fr.split(/[,;]/).some((f) => strip(f) === k)) ?? null;
}

/** « Comment dire « j'ai faim » ? » → « j'ai faim ». */
const phraseOf = (q: string) => q.replace(/^\s*(comment (on )?dire|comment dit-on|on dit comment)\s*/i, "").replace(/[«»"“”?]/g, "").trim() || q;

/** Assistant écrit (professeur, grammaire, traduction, dictionnaire). */
export function ToolChat({ profile, llm, setLlm, mode, onBack }: { profile: Profile; llm: LlmSettings; setLlm: (l: LlmSettings) => void; mode: ModeId; onBack: () => void }) {
  const m = MODES.find((x) => x.id === mode)!;
  const lang = LANGUAGES[profile.target];
  const [ready, setReady] = useState(() => allReady(llm, whisperStore.get()));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, stream]);

  async function send() {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setText("");
    setBusy(true);
    setError("");
    try {
      let out: string;
      // Réponses écrites à la main d'abord : le petit modèle se trompe vite hors traduction.
      const phrase = mode === "teacher" ? phraseOf(q) : mode === "define" ? wordOf(q) : q;
      const known = mode === "define" || mode === "teacher" ? lookup(phrase, profile.gender ?? "m") ?? (mode === "define" ? lookup(plain(phrase), profile.gender ?? "m") : null) : null;
      if (known) {
        // Mot présent dans la banque de ressources : réponse écrite à la main, sans IA.
        out = `${known.he}\n(${known.tr})\n${known.fr}${known.note ? `\n- ${known.note}` : ""}`;
      } else if (mode === "define") {
        // Mot hébreu trouvé par DictaLM, vérifié en le retraduisant avec le traducteur dédié.
        out = formatDefinition(await defineWord(llm, profile, q));
      } else if (mode === "translate" && HEBREW.test(q)) {
        // Hébreu → langue maternelle : traducteur dédié (opus-mt), DictaLM seulement à défaut.
        const tr = canTranslate(profile.target, profile.native) ? await translateHebrew(q, profile.native).catch(() => "") : "";
        out = tr || (await complete(llm, { messages: translateMessages(profile, q), temperature: 0.1, maxTokens: 120 })).split("\n")[0];
      } else if (mode === "translate" || mode === "teacher") {
        // Vers l'hébreu : traducteur dédié, puis passage au féminin si besoin (DictaLM, sous contrôle).
        out = await sayInHebrew(llm, profile, phrase);
      } else {
        out = await complete(llm, {
          messages: [{ role: "system", content: toolSystem(profile, mode) }, ...next.slice(-8)],
          onToken: setStream,
          maxTokens: 450,
          temperature: 0.3,
          antiRepeat: true,
        });
      }
      setMsgs([...next, { role: "assistant", content: out }]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStream("");
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg lg:max-w-3xl">
        <Header title="Préparer le tuteur" onBack={onBack} />
        <div className="p-4"><LlmSetup llm={llm} onChange={setLlm} onReady={() => setReady(true)} /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-lg lg:max-w-3xl flex-col">
      <Header title={m.title} onBack={onBack} />
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p className="rounded-xl bg-accent/10 p-3 text-xs text-muted">
          Réponses d&apos;une petite IA qui tourne sur ton appareil : elles peuvent contenir des erreurs. Vérifie dans Cours › Ressources.
        </p>
        <div className="flex items-start gap-2">
          <Avatar size={36} />
          <p className="rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3">{m.hello}</p>
        </div>
        {msgs.map((x, i) => <Bubble key={i} m={x} speech={lang.speech} />)}
        {stream && <Bubble m={{ role: "assistant", content: stream }} speech={lang.speech} />}
        {busy && !stream && <p className="flex items-center gap-2 text-sm text-muted"><Avatar size={32} mood="think" /> Shuli réfléchit…</p>}
        {error && <p role="alert" className="flex items-center gap-3 rounded-xl bg-warn/10 p-3 text-sm text-warn"><Avatar size={40} mood="sad" className="shrink-0" />{error}</p>}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2 border-t border-line bg-bg px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <input value={text} onChange={(e) => setText(e.target.value)} dir="auto" placeholder={m.placeholder} aria-label="Ta question"
          className="min-h-11 flex-1 rounded-xl border border-line bg-card px-3 text-base" />
        <Btn type="submit" disabled={!text.trim() || busy} aria-label="Envoyer" className="grid w-11 place-items-center !px-0"><RiSendPlaneFill aria-hidden className="size-5" /></Btn>
      </form>
    </div>
  );
}

function Bubble({ m, speech }: { m: Msg; speech: string }) {
  if (m.role === "user") {
    return <p dir="auto" className="ms-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-3 text-accent-ink">{m.content}</p>;
  }
  return (
    <div className="max-w-[92%] space-y-1 rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3">
      {m.content.split("\n").filter((l) => l.trim()).map((line, i) =>
        HEBREW.test(line) ? (
          <p key={i} className="flex items-center gap-2">
            <button onClick={() => speak(line.replace(/[^֐-׿\s?!.,]/g, "").trim(), speech, 0.85)} aria-label="Écouter" className="shrink-0 text-accent">
              <RiVolumeUpLine aria-hidden />
            </button>
            <span dir="auto" className="he text-lg">{line}</span>
          </p>
        ) : (
          <p key={i} dir="auto" className={/^\(.*\)$/.test(line.trim()) ? "text-muted" : ""}>{line}</p>
        ),
      )}
    </div>
  );
}
