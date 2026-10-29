"use client";
import { RiArrowRightSLine, RiMicFill } from "react-icons/ri";
import { MODES, type ModeId } from "@/lib/modes";
import type { Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Header } from "./ui";

export function TutorHub({ profile, onBack, open }: { profile: Profile; onBack: () => void; open: (m: ModeId) => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <Header title="" onBack={onBack} />
      <main className="flex-1 px-4 pb-28">
        <div className="flex flex-col items-center text-center">
          <Avatar size={112} />
          <h1 className="mt-3 text-2xl font-bold">Noa</h1>
          <p className="text-muted">Salut{profile.name ? ` ${profile.name}` : ""} ! Je suis ta tutrice d&apos;hébreu.</p>
          <p className="mt-4 text-lg font-semibold">Qu&apos;est-ce qu&apos;on fait ?</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => open(m.id)} className="flex min-h-20 items-start justify-between gap-1 rounded-2xl bg-accent/10 p-3 text-left active:scale-[0.98]">
              <span>
                <span className="block text-sm font-semibold">{m.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{m.sub}</span>
              </span>
              <RiArrowRightSLine aria-hidden className="mt-0.5 shrink-0 text-accent" />
            </button>
          ))}
        </div>
      </main>
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        <button onClick={() => open("talk")} className="mx-auto flex min-h-14 w-full max-w-lg items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-accent-ink active:scale-[0.99]">
          <RiMicFill aria-hidden className="size-5" /> Parler directement
        </button>
      </div>
    </div>
  );
}
