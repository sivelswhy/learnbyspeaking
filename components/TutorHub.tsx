"use client";
import { RiMicFill } from "react-icons/ri";
import { MODES, type ModeId } from "@/lib/modes";
import type { Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { BackButton } from "./ui";

export function TutorHub({ profile, onBack, open }: { profile: Profile; onBack: () => void; open: (m: ModeId) => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <div className="px-4 pt-3"><BackButton onClick={onBack} /></div>
      <main className="flex-1 px-4 pb-28">
        <div className="flex flex-col items-center text-center">
          <Avatar size={128} />
          <h1 className="mt-4 text-3xl font-bold">Noa</h1>
          <p className="mt-2">Salut{profile.name ? ` ${profile.name}` : ""} !</p>
          <p className="mt-4 text-xl font-bold">Qu&apos;est-ce que je peux faire pour toi&nbsp;?</p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => open(m.id)} className="min-h-20 rounded-2xl bg-soft p-4 text-left active:scale-[0.98]">
              <span className="block font-bold">{m.title}</span>
              <span className="mt-1 block text-sm text-muted">{m.sub}</span>
            </button>
          ))}
        </div>
      </main>
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        <button onClick={() => open("talk")} className="mx-auto flex min-h-14 w-full max-w-lg items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#6d63ff] to-[#5b3fd1] font-semibold text-white active:scale-[0.99]">
          <RiMicFill aria-hidden className="size-5" /> Parler directement
        </button>
      </div>
    </div>
  );
}
