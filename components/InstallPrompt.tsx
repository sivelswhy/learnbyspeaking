"use client";
import { useEffect, useState } from "react";
import {
  RiAddBoxLine, RiCheckboxCircleLine, RiCloseLine, RiInstallLine, RiMore2Fill, RiShareBoxLine, RiSmartphoneLine,
} from "react-icons/ri";
import type { IconType } from "react-icons";
import { Btn } from "./ui";

const KEY = "lbs.installDismissed";
const SNOOZE_DAYS = 14;

type Platform = "ios" | "android";
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detect(): Platform | null {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return null;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function snoozed() {
  try {
    const t = Number(localStorage.getItem(KEY) ?? 0);
    return Date.now() - t < SNOOZE_DAYS * 864e5;
  } catch {
    return false;
  }
}

const STEPS: Record<Platform, { Icon: IconType; text: string }[]> = {
  ios: [
    { Icon: RiShareBoxLine, text: "Touche le bouton Partager (carré avec une flèche vers le haut), en bas de Safari ou dans la barre d'adresse." },
    { Icon: RiAddBoxLine, text: "Fais défiler et choisis « Sur l'écran d'accueil »." },
    { Icon: RiCheckboxCircleLine, text: "Touche « Ajouter » en haut à droite. L'icône LearnBySpeaking apparaît sur ton écran d'accueil." },
  ],
  android: [
    { Icon: RiMore2Fill, text: "Touche le menu ⋮ en haut à droite de Chrome." },
    { Icon: RiInstallLine, text: "Choisis « Installer l'application » (ou « Ajouter à l'écran d'accueil »)." },
    { Icon: RiCheckboxCircleLine, text: "Confirme avec « Installer ». L'icône LearnBySpeaking apparaît sur ton écran d'accueil." },
  ],
};

export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [show, setShow] = useState(false);
  const [guide, setGuide] = useState(false);
  const [bip, setBip] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const p = detect();
    const onBip = (e: Event) => {
      e.preventDefault(); // on garde l'invite pour notre bouton « Installer »
      setBip(e as BIPEvent);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (p && !isStandalone() && !snoozed()) {
      timer = setTimeout(() => {
        setPlatform(p);
        setShow(true);
      }, 1500);
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* stockage bloqué : l'alerte reviendra, tant pis */
    }
    setShow(false);
    setGuide(false);
  }

  async function install() {
    if (!bip) return setGuide(true);
    await bip.prompt();
    const { outcome } = await bip.userChoice;
    setBip(null);
    if (outcome === "accepted") setShow(false);
  }

  if (!show || !platform) return null;

  return (
    <>
      {!guide && (
        <div role="dialog" aria-label="Installer l'application"
          className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 mx-auto max-w-lg lg:max-w-3xl rounded-2xl bg-card shadow-card p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink">
              <RiSmartphoneLine aria-hidden className="size-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">Ajoute LearnBySpeaking à ton écran d&apos;accueil</p>
              <p className="text-sm text-muted">Elle s&apos;ouvre en plein écran, comme une vraie app, même hors ligne.</p>
            </div>
            <button onClick={dismiss} aria-label="Fermer" className="-m-2 grid size-11 place-items-center text-muted">
              <RiCloseLine aria-hidden className="size-5" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <Btn variant="ghost" onClick={dismiss} className="flex-1">Plus tard</Btn>
            <Btn onClick={install} className="flex-1">{bip ? "Installer" : "Voir comment"}</Btn>
          </div>
        </div>
      )}

      {guide && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setGuide(false)}>
          <div role="dialog" aria-modal="true" aria-label="Tutoriel d'installation" onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-lg lg:max-w-3xl rounded-t-3xl bg-card p-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
            <h2 className="text-lg font-bold">
              Installer sur {platform === "ios" ? "iPhone / iPad" : "Android"}
            </h2>
            {platform === "ios" && !/Safari/.test(navigator.userAgent) && (
              <p className="mt-1 text-sm text-muted">Si tu ne trouves pas l&apos;option, ouvre cette page dans Safari.</p>
            )}
            <ol className="mt-4 space-y-4">
              {STEPS[platform].map(({ Icon, text }, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="pt-1 text-sm">
                    <b className="me-1">{i + 1}.</b>
                    {text}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex gap-2">
              <Btn variant="ghost" onClick={dismiss} className="flex-1">Ne plus afficher</Btn>
              <Btn onClick={() => setGuide(false)} className="flex-1">Compris</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Enregistre le service worker (production uniquement). */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
}
