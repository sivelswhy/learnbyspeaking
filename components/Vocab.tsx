"use client";
import { useMemo, useState } from "react";
import { RiArrowLeftRightLine, RiMicFill, RiPauseFill, RiVolumeUpLine } from "react-icons/ri";
import { LANGUAGES } from "@/lib/languages";
import type { LlmSettings } from "@/lib/llm";
import { STT_ERRORS, cancelSpeech, speak, useVoiceInput } from "@/lib/speech";
import { dueCards, schedule, type Grade } from "@/lib/srs";
import type { Profile, VocabCard } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Btn, Card, Header, wordMatch } from "./ui";

/** « 10 min », « 3 j », « 2 mois » : délai avant la prochaine révision. */
function when(iso: string) {
  const min = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  if (min < 60) return `${min} min`;
  const d = Math.round(min / 1440);
  return d < 1 ? `${Math.round(min / 60)} h` : d < 60 ? `${d} j` : `${Math.round(d / 30)} mois`;
}

const GRADES: { g: Grade; label: string; cls: string }[] = [
  { g: "again", label: "À revoir", cls: "!border-warn !text-warn" },
  { g: "hard", label: "Difficile", cls: "" },
  { g: "good", label: "Bien", cls: "" },
  { g: "easy", label: "Facile", cls: "" },
];

export function Vocab({ profile, llm, vocab, review, onBack }: {
  profile: Profile; llm: LlmSettings; vocab: VocabCard[]; review: (w: string, g: Grade) => void; onBack?: () => void;
}) {
  const lang = LANGUAGES[profile.target];
  const he = lang.rtl ? "he" : "";
  const [flip, setFlip] = useState(false);
  const [reverse, setReverse] = useState(false);
  /** Mode oral : on voit le sens, on dit le mot à voix haute. */
  const [oral, setOral] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  // Les cartes revues « à revoir » reviennent dans 10 min : on les garde hors de la file de cette séance.
  const [snooze, setSnooze] = useState<string[]>([]);
  const due = dueCards(vocab).filter((c) => !snooze.includes(c.word));
  const card = due[0];

  const voice = useVoiceInput(llm.stt, profile.target, lang.speech, (t) => { setHeard(t); setFlip(true); });
  const match = card && heard !== null ? wordMatch(card.word, heard) : null;
  const preview = useMemo(() => (card ? Object.fromEntries(GRADES.map(({ g }) => [g, when(schedule(card, g).due)])) as Record<Grade, string> : null), [card]);

  function answer(g: Grade) {
    review(card.word, g);
    if (g === "again") setSnooze((s) => [...s, card.word]);
    setDone((n) => n + 1);
    setFlip(false);
    setHeard(null);
    cancelSpeech();
  }

  const showWord = oral ? flip : reverse ? !flip : flip;

  return (
    <div className="mx-auto max-w-lg lg:max-w-3xl">
      <Header title="Vocabulaire" onBack={onBack} />
      <div className="space-y-4 p-4">
        {vocab.length === 0 && (
          <div className="flex items-center gap-3 text-muted"><Avatar size={64} mood="happy" className="shrink-0" /><p>Tes mots appris en conversation et dans le cours apparaîtront ici automatiquement.</p></div>
        )}
        {vocab.length > 0 && !card && (
          <Card className="flex items-center gap-4">
            <Avatar size={72} mood={done ? "cheer" : "happy"} className="pop-in shrink-0" />
            <p><b>{done ? `Bravo, ${done} mot${done > 1 ? "s" : ""} révisé${done > 1 ? "s" : ""} !` : "Rien à réviser pour l'instant."}</b><br /><span className="text-sm text-muted">Reviens plus tard : Shuli te prévient quand des mots seront à revoir.</span></p>
          </Card>
        )}
        {card && preview && (
          <>
            <p className="text-sm text-muted">{due.length} à réviser · maîtrise {card.box + 1}/5{done ? ` · ${done} fait${done > 1 ? "s" : ""}` : ""}</p>
            <button onClick={() => !oral && setFlip(!flip)} aria-label="Retourner la carte" className="grid min-h-56 w-full place-items-center rounded-3xl border-2 border-line bg-card p-6 text-center shadow-[0_4px_0_0_var(--line-deep)]">
              {showWord ? (
                <span>
                  <span className={`${he} block text-4xl`}>{card.word}</span>
                  <span className="mt-2 block text-muted">{card.transliteration}</span>
                  {oral && <span className="mt-1 block text-sm">{card.meaning}</span>}
                </span>
              ) : (
                <span>
                  {(oral || reverse) ? <span className="block text-2xl">{card.meaning}</span> : <span className={`${he} block text-4xl`}>{card.word}</span>}
                  <span className="mt-2 block text-sm text-muted">{oral ? "Dis le mot en hébreu" : "Touche pour voir la réponse"}</span>
                </span>
              )}
            </button>
            {oral && heard !== null && (
              <p className={`text-center text-sm ${match !== null && match >= 70 ? "text-good" : "text-muted"}`} role="status">
                <span dir="auto" className={he}>Compris : « {heard} »</span> · {match}% {match !== null && match >= 70 ? "— bien dit !" : "— réécoute et réessaie."}
              </p>
            )}
            {voice.error && <p role="alert" className="text-center text-sm text-warn">{STT_ERRORS[voice.error]}</p>}
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={() => speak(card.word, lang.speech, 0.8)} className="flex flex-1 items-center justify-center gap-1.5"><RiVolumeUpLine aria-hidden /> Écouter</Btn>
              {oral ? (
                <Btn variant="soft" disabled={voice.transcribing} onClick={() => (voice.listening ? voice.stop() : (cancelSpeech(), setHeard(null), voice.start()))} className="flex flex-1 items-center justify-center gap-1.5">
                  {voice.listening ? <RiPauseFill aria-hidden /> : <RiMicFill aria-hidden />} {voice.transcribing ? "Transcription…" : voice.listening ? "Arrêter" : "Parler"}
                </Btn>
              ) : (
                <Btn variant="ghost" onClick={() => { setReverse(!reverse); setFlip(false); }} className="flex flex-1 items-center justify-center gap-1.5"><RiArrowLeftRightLine aria-hidden /> {reverse ? "Mot → sens" : "Sens → mot"}</Btn>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mode de révision">
              {([[false, "Lire"], [true, "Dire à voix haute"]] as const).map(([o, label]) => (
                <button key={label} role="radio" aria-checked={oral === o} onClick={() => { setOral(o); setFlip(false); setHeard(null); }}
                  className={`min-h-11 rounded-2xl border-2 text-sm font-bold ${oral === o ? "border-accent bg-soft text-accent" : "border-line bg-card"}`}>{label}</button>
              ))}
            </div>
            {oral && !flip && <Btn variant="ghost" className="w-full" onClick={() => setFlip(true)}>Voir le mot</Btn>}
            {flip && (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map(({ g, label, cls }) => (
                  <Btn key={g} variant={g === "good" ? "solid" : "ghost"} onClick={() => answer(g)} className={`flex flex-col !px-1 !py-1.5 leading-tight ${cls}`}>
                    <span>{label}</span><span className="text-[11px] font-normal opacity-75">{preview[g]}</span>
                  </Btn>
                ))}
              </div>
            )}
          </>
        )}
        <h2 className="pt-2 font-semibold">Tous les mots ({vocab.length})</h2>
        <ul className="space-y-1">
          {vocab.map((c) => (
            <li key={c.word} className="flex items-center justify-between rounded-xl border border-line bg-card px-3 py-2">
              <span className={`${he} text-lg`}>{c.word} <span className="text-sm text-muted">{c.transliteration}</span></span>
              <span className="text-sm">{c.meaning}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
