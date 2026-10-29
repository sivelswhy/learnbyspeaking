"use client";
import { useState } from "react";
import { LANGUAGES } from "@/lib/languages";
import { speak } from "@/lib/speech";
import type { Profile, VocabCard } from "@/lib/types";
import { RiArrowLeftRightLine, RiVolumeUpLine } from "react-icons/ri";
import { Btn, Card, Header } from "./ui";

export function Vocab({ profile, vocab, review, onBack }: { profile: Profile; vocab: VocabCard[]; review: (w: string, ok: boolean) => void; onBack?: () => void }) {
  const lang = LANGUAGES[profile.target];
  const [flip, setFlip] = useState(false);
  const [reverse, setReverse] = useState(false);
  const due = vocab.filter((c) => new Date(c.due) <= new Date()).sort((a, b) => a.box - b.box);
  const card = due[0];
  const he = lang.rtl ? "he" : "";

  function answer(ok: boolean) {
    review(card.word, ok);
    setFlip(false);
  }

  return (
    <div className="mx-auto max-w-lg">
      <Header title="Vocabulaire" onBack={onBack} />
      <div className="space-y-4 p-4">
        {vocab.length === 0 && <p className="text-muted">Tes mots appris en conversation apparaîtront ici automatiquement.</p>}
        {vocab.length > 0 && !card && <Card className="text-center">Rien à réviser pour l&apos;instant. Reviens plus tard.</Card>}
        {card && (
          <>
            <p className="text-sm text-muted">{due.length} à réviser · boîte {card.box + 1}/5</p>
            <button onClick={() => setFlip(!flip)} aria-label="Retourner la carte" className="grid min-h-56 w-full place-items-center rounded-3xl border border-line bg-card p-6 text-center">
              {(reverse ? !flip : flip) ? (
                <span className="text-2xl">{card.meaning}</span>
              ) : (
                <span><span className={`${he} block text-4xl`}>{card.word}</span><span className="mt-2 block text-muted">{flip || reverse ? "" : "Touche pour voir le sens"}</span></span>
              )}
              {flip && !reverse && <span className="mt-2 block text-muted">{card.transliteration}</span>}
            </button>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={() => speak(card.word, lang.speech, 0.8)} className="flex flex-1 items-center justify-center gap-1.5"><RiVolumeUpLine aria-hidden /> Écouter</Btn>
              <Btn variant="ghost" onClick={() => { setReverse(!reverse); setFlip(false); }} className="flex flex-1 items-center justify-center gap-1.5"><RiArrowLeftRightLine aria-hidden /> {reverse ? "Mot → sens" : "Sens → mot"}</Btn>
            </div>
            {flip && (
              <div className="flex gap-2">
                <Btn variant="ghost" onClick={() => answer(false)} className="flex-1 !border-warn !text-warn">À revoir</Btn>
                <Btn onClick={() => answer(true)} className="flex-1">Je savais</Btn>
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
