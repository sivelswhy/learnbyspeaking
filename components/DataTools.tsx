"use client";
import { useEffect, useRef, useState } from "react";
import { RiCheckboxCircleFill, RiCloseCircleFill, RiErrorWarningFill } from "react-icons/ri";
import { exportJson, importJson, saveFile } from "@/lib/backup";
import { getSR } from "@/lib/speech";
import { TEXT_SCALES, getTextScale, setTextScale, type TextScale } from "@/lib/textScale";
import { wakeLockSupported } from "@/lib/wakeLock";
import { Btn, Card } from "./ui";

/** Sauvegarde : export et import d'un fichier JSON des progrès. */
export function BackupCard({ reset }: { reset: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card>
      <h2 className="font-semibold">Sauvegarde</h2>
      <p className="mt-1 text-sm text-muted">
        Tes progrès restent sur cet appareil, sans compte. Une copie de secours est gardée automatiquement dans l&apos;app. Pour changer d&apos;appareil ou garder une copie, exporte un fichier.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn variant="soft" onClick={() => { saveFile(`learnbyspeaking-${new Date().toISOString().slice(0, 10)}.json`, exportJson()); setMsg({ ok: true, text: "Sauvegarde exportée." }); }}>Exporter</Btn>
        <Btn variant="soft" onClick={() => input.current?.click()}>Importer</Btn>
      </div>
      <input ref={input} type="file" accept="application/json,.json" className="sr-only" aria-label="Importer une sauvegarde"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (!confirm("Remplacer tes données actuelles par celles du fichier ?")) return;
          const r = importJson(await f.text());
          if (r.ok) {
            setMsg({ ok: true, text: "Sauvegarde importée. Rechargement…" });
            setTimeout(() => location.reload(), 600);
          } else setMsg({ ok: false, text: r.error });
        }} />
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
      <Btn variant="ghost" className="mt-3 w-full !border-warn !text-warn" onClick={() => confirm("Tout effacer ? Pense à exporter une sauvegarde avant.") && reset()}>Effacer toutes mes données</Btn>
    </Card>
  );
}

/** Taille du texte. */
export function TextSizeCard() {
  const [s, setS] = useState<TextScale>("normal");
  useEffect(() => {
    const id = setTimeout(() => setS(getTextScale()), 0);
    return () => clearTimeout(id);
  }, []);
  const labels: Record<TextScale, string> = { normal: "Normal", large: "Grand", xlarge: "Très grand" };
  return (
    <Card>
      <h2 className="font-semibold">Taille du texte</h2>
      <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Taille du texte">
        {(Object.keys(TEXT_SCALES) as TextScale[]).map((k) => (
          <button key={k} role="radio" aria-checked={s === k} onClick={() => { setS(k); setTextScale(k); }}
            className={`min-h-11 rounded-2xl border-2 text-sm font-bold ${s === k ? "border-accent bg-accent text-accent-ink" : "border-line bg-card"}`}>{labels[k]}</button>
        ))}
      </div>
    </Card>
  );
}

type Check = { label: string; state: "ok" | "warn" | "ko"; detail: string };

async function runChecks(): Promise<Check[]> {
  const out: Check[] = [];
  const add = (label: string, state: Check["state"], detail: string) => out.push({ label, state, detail });
  add("Contexte sécurisé", isSecureContext ? "ok" : "ko", isSecureContext ? "Oui." : "Non : le micro et l'IA exigent une page sécurisée (https ou localhost).");
  let gpu = "ko";
  let gpuDetail = "WebGPU absent : Shuli ne peut pas tourner. Utilise Chrome ou Edge récent, Safari 18 ou plus, ou l'app Mac.";
  if ("gpu" in navigator) {
    try {
      const a = await (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter();
      gpu = a ? "ok" : "ko";
      gpuDetail = a ? "Carte graphique utilisable." : "WebGPU présent mais aucune carte graphique n'est disponible.";
    } catch {
      gpuDetail = "WebGPU présent mais inutilisable (pilote ou réglage).";
    }
  }
  add("IA sur l'appareil (WebGPU)", gpu as Check["state"], gpuDetail);
  let mic: Check["state"] = "warn";
  let micDetail = navigator.mediaDevices ? "Pas encore demandé : le navigateur te le proposera au premier enregistrement." : "Micro indisponible dans ce navigateur.";
  if (!navigator.mediaDevices) mic = "ko";
  try {
    const p = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    if (p?.state === "granted") [mic, micDetail] = ["ok", "Autorisé."];
    else if (p?.state === "denied") [mic, micDetail] = ["ko", "Refusé : autorise le micro dans les réglages du navigateur ou du système."];
  } catch {
    /* permissions non disponibles : on garde le message par défaut */
  }
  add("Micro", mic, micDetail);
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    if (est?.quota) {
      const free = (est.quota - (est.usage ?? 0)) / 1e9;
      add("Espace de stockage", free > 4 ? "ok" : free > 2 ? "warn" : "ko", `${free.toFixed(1).replace(".", ",")} Go libres (modèles : environ 3 Go). ${persisted ? "Données protégées contre la purge." : "Données non protégées : le navigateur peut les purger si le disque est plein."}`);
    }
  } catch {
    /* estimation impossible */
  }
  add("Stockage des modèles (Cache API)", "caches" in self ? "ok" : "ko", "caches" in self ? "Disponible." : "Absent : les modèles ne pourront pas être gardés.");
  add("Utilisation hors ligne", "serviceWorker" in navigator ? "ok" : "warn", "serviceWorker" in navigator ? "L'app s'ouvre sans connexion après une première visite." : "Non disponible ici.");
  add("Réseau", navigator.onLine ? "ok" : "warn", navigator.onLine ? "En ligne." : "Hors ligne : seuls les modèles déjà téléchargés fonctionnent.");
  add("Écran allumé pendant le téléchargement", wakeLockSupported() === true ? "ok" : "warn", wakeLockSupported() === true ? "Disponible." : "Non pris en charge : touche l'écran de temps en temps pendant un téléchargement.");
  add("Reconnaissance vocale du navigateur", getSR() !== null ? "ok" : "warn", getSR() !== null ? "Disponible (secours si Whisper n'est pas utilisé)." : "Absente : seule la reconnaissance Whisper locale fonctionne.");
  return out;
}

/** Diagnostic : ce qui marche, ce qui bloque, et quoi faire. */
export function DiagnosticCard() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setChecks(await runChecks());
    setBusy(false);
  };
  const icon = { ok: <RiCheckboxCircleFill className="text-good" />, warn: <RiErrorWarningFill className="text-[#c98a1a]" />, ko: <RiCloseCircleFill className="text-warn" /> };
  return (
    <Card>
      <h2 className="font-semibold">Diagnostic</h2>
      <p className="mt-1 text-sm text-muted">Vérifie que ton appareil peut faire tourner Shuli.</p>
      <Btn variant="soft" className="mt-3 w-full" disabled={busy} onClick={() => void run()}>{busy ? "Vérification…" : checks ? "Relancer" : "Lancer le diagnostic"}</Btn>
      {checks && (
        <ul className="mt-3 space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-2 text-sm">
              <span aria-hidden className="mt-0.5 shrink-0 text-lg">{icon[c.state]}</span>
              <span><b>{c.label}</b><span className="sr-only"> : {c.state === "ok" ? "ok" : c.state === "warn" ? "attention" : "problème"}.</span><span className="block text-muted">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
