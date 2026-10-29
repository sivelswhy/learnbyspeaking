"use client";
import { useCallback, useEffect, useRef, useState } from "react";

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
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const base = lang.split("-")[0];
  const voices = await loadVoices();
  return voices.some((v) => v.lang.toLowerCase().startsWith(base));
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export async function speak(text: string, lang: string, rate = 0.9, onEnd?: () => void): Promise<boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return false;
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
