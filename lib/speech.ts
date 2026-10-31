"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelVoice, speakVoice, voiceStore } from "./voice";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SR = any;

export type SttError = "denied" | "no-speech" | "network" | "unsupported" | "other";

export function getSR(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useRecognizer(lang: string, onFinal: (text: string, confidence: number) => void) {
  const recRef = useRef<SR>(null);
  const finalRef = useRef(onFinal);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<SttError | null>(null);
  const supported = getSR() !== null;

  useEffect(() => {
    finalRef.current = onFinal;
  }, [onFinal]);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getSR();
    if (!Ctor) {
      setError("unsupported");
      return;
    }
    setError(null);
    setInterim("");
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let got = false;
    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      let text = "";
      let conf = 0;
      let isFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        conf = e.results[i][0].confidence;
        if (e.results[i].isFinal) isFinal = true;
      }
      setInterim(text);
      if (isFinal && text.trim()) {
        got = true;
        finalRef.current(text.trim(), conf);
      }
    };
    rec.onerror = (e: any) => {
      const m: Record<string, SttError> = {
        "not-allowed": "denied",
        "service-not-allowed": "denied",
        "no-speech": "no-speech",
        network: "network",
      };
      if (e.error !== "aborted") setError(m[e.error] ?? "other");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (!got) setError((prev) => prev ?? "no-speech");
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setError("other");
    }
  }, [lang]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, interim, error, start, stop, clearError: () => setError(null) };
}

/* ---------- Synthèse vocale ---------- */

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const v = synth.getVoices();
    if (v.length) return resolve(v);
    const t = setTimeout(() => resolve(synth.getVoices()), 1500);
    synth.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(t);
        resolve(synth.getVoices());
      },
      { once: true },
    );
  });
}

export async function hasVoice(lang: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const base = lang.split("-")[0];
  const v = voiceStore.get().phase;
  if (base === "he" && v !== "idle" && v !== "error") return true;
  if (!("speechSynthesis" in window)) return false;
  const voices = await loadVoices();
  return voices.some((v) => v.lang.toLowerCase().startsWith(base));
}

export function cancelSpeech() {
  cancelVoice();
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export async function speak(text: string, lang: string, rate = 0.9, onEnd?: () => void): Promise<boolean> {
  if (typeof window === "undefined" || !text) return false;
  // Hébreu : la voix naturelle locale si elle est chargée, sinon la voix du système.
  if (lang.startsWith("he")) {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (speakVoice(text, rate, onEnd)) return true;
  }
  if (!("speechSynthesis" in window)) return false;
  cancelVoice();
  const synth = window.speechSynthesis;
  synth.cancel();
  const base = lang.split("-")[0];
  const voices = await loadVoices();
  const voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.toLowerCase().startsWith(base));
  if (!voice) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.voice = voice;
  u.rate = rate;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
  return true;
}

export const LEVEL_RATE: Record<string, number> = { A1: 0.7, A2: 0.8, B1: 0.9, B2: 1, C1: 1, C2: 1 };

/* ---------- Whisper local (même interface que useRecognizer) ---------- */

export function useWhisperRecognizer(lang: string, onFinal: (text: string, confidence: number) => void) {
  const finalRef = useRef(onFinal);
  const recRef = useRef<import("./whisper").Recording | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<SttError | null>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && "gpu" in navigator;

  useEffect(() => {
    finalRef.current = onFinal;
  }, [onFinal]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(async () => {
    if (!supported) return setError("unsupported");
    setError(null);
    const { record, transcribe, loadWhisper } = await import("./whisper");
    void loadWhisper().catch(() => {}); // charge le modèle pendant qu'on parle
    let r: import("./whisper").Recording;
    setOpening(true);
    try {
      r = await record(setLevel);
    } catch (e) {
      return setError(e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "other");
    } finally {
      setOpening(false);
    }
    recRef.current = r;
    setListening(true);
    try {
      const audio = await r.done;
      setListening(false);
      if (!audio) return setError("no-speech");
      setTranscribing(true);
      const text = await transcribe(audio, lang);
      if (text) finalRef.current(text, 1);
      else setError("no-speech");
    } catch {
      setError("other");
    } finally {
      recRef.current = null;
      setListening(false);
      setTranscribing(false);
    }
  }, [lang, supported]);

  // En quittant l'écran : on arrête l'écoute et on coupe le micro.
  useEffect(() => () => {
    recRef.current?.stop();
    void import("./whisper").then((w) => w.closeMic());
  }, []);

  const interim = opening ? "Ouverture du micro…" : transcribing ? "Transcription…" : "";
  return { supported, listening, opening, transcribing, level, interim, error, start, stop, clearError: () => setError(null) };
}

/** Micro unifié : Whisper local si choisi et possible, sinon reconnaissance du navigateur. */
export function useVoiceInput(stt: "whisper" | "browser", target: string, speechLang: string, onHeard: (text: string) => void) {
  const browser = useRecognizer(speechLang, onHeard);
  const whisper = useWhisperRecognizer(target, onHeard);
  const useWhisper = stt === "whisper" && whisper.supported;
  const rec = useWhisper ? whisper : browser;
  return {
    ...rec,
    transcribing: useWhisper && whisper.transcribing,
    opening: useWhisper && whisper.opening,
    level: useWhisper ? whisper.level : 0,
    start: () => void rec.start(),
  };
}

export const STT_ERRORS: Record<SttError, string> = {
  denied: "Micro refusé. Autorise-le dans les réglages du navigateur (icône 🔒 de la barre d'adresse), ou écris ta réponse.",
  "no-speech": "Je n'ai rien entendu. Réessaie en parlant un peu plus près, ou écris.",
  network: "La reconnaissance vocale a perdu le réseau. Réessaie, ou écris ta réponse.",
  unsupported: "Ce navigateur ne gère pas la reconnaissance vocale. Utilise Chrome, Edge ou Safari, ou écris.",
  other: "Problème de micro. Réessaie, ou écris ta réponse.",
};
