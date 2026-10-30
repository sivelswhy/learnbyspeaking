"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { RiCheckboxCircleFill, RiCpuLine, RiDownloadCloud2Line, RiErrorWarningLine, RiLoader4Line } from "react-icons/ri";
import {
  DEFAULT_LLM, WEBLLM_MODELS, complete, errorMessage, hasWebGPU, isCached, isReady, loadStore, loadWebLLM,
  type LlmSettings, type LoadState,
} from "@/lib/llm";
import { VOICE_MB, loadVoice, voiceCached, voiceStore } from "@/lib/voice";
import { WHISPER_MB, loadWhisper, whisperCached, whisperStore } from "@/lib/whisper";
import { Btn, Card } from "./ui";

export function useLoadState(): LoadState {
  return useSyncExternalStore(loadStore.subscribe, loadStore.get, loadStore.get);
}

export function useWhisperState(): LoadState {
  return useSyncExternalStore(whisperStore.subscribe, whisperStore.get, whisperStore.get);
}

export function useVoiceState(): LoadState {
  return useSyncExternalStore(voiceStore.subscribe, voiceStore.get, voiceStore.get);
}

/** Tout ce que l'app doit télécharger selon les réglages est prêt. Sans `v`, la voix est ignorée : elle a un secours. */
export function allReady(llm: LlmSettings, w: LoadState, v?: LoadState) {
  return isReady(llm) && (llm.stt !== "whisper" || !hasWebGPU() || w.phase === "ready") && (!v || llm.voice !== "natural" || v.phase === "ready");
}

const fmtTime = (s: number) => {
  if (s < 60) return `${Math.max(5, Math.ceil(s / 5) * 5)} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

/** Barre de progression partagée (réglages, conversation, accueil). */
export function LoadProgress({ ls, compact = false }: { ls: LoadState; compact?: boolean }) {
  const label = ls.model === "whisper" ? "Whisper ivrit-ai (voix)" : ls.model === "voice" ? "Voix de Noa" : (WEBLLM_MODELS.find((m) => m.id === ls.model)?.label ?? ls.model);
  if (ls.phase === "idle" || ls.phase === "ready") return null;
  if (ls.phase === "error") {
    return <p className="flex items-center gap-2 text-sm text-warn"><RiErrorWarningLine aria-hidden /> Échec du chargement : {ls.error?.slice(0, 140)}</p>;
  }
  const pct = Math.round(ls.progress * 100);
  const dl = ls.phase === "download";
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          {dl ? <RiDownloadCloud2Line aria-hidden /> : <RiCpuLine aria-hidden />}
          {dl ? "Téléchargement" : ls.fromCache ? "Chargement depuis l'appareil" : ls.model === "voice" ? "Préparation de la voix" : "Préparation du GPU"}
          {!compact && <span className="font-normal text-muted">· {label}</span>}
        </span>
        <span className="tabular-nums text-muted">{pct} %</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="text-xs tabular-nums text-muted">
        {dl
          ? `${ls.doneMB} / ${ls.totalMB || "?"} Mo${ls.mbps > 0.05 ? ` · ${ls.mbps.toFixed(1)} Mo/s` : ""} · ${ls.etaSec != null ? `encore ≈ ${fmtTime(ls.etaSec)}` : "calcul du temps restant…"}${ls.cachedMB > 0 ? ` · ${ls.cachedMB} Mo déjà sur l'appareil` : ""}`
          : ls.model === "voice" ? "Quelques secondes : préparation de la voix." : "Quelques secondes : compilation pour ta carte graphique."}
      </p>
      {dl && !compact && <p className="text-xs text-muted">Tu peux naviguer dans l&apos;app pendant ce temps. Une seule fois : ensuite le modèle se charge depuis l&apos;appareil.</p>}
    </div>
  );
}

export function LlmSetup({ llm, onChange, onReady }: { llm: LlmSettings; onChange: (l: LlmSettings) => void; onReady?: () => void }) {
  const ls = useLoadState();
  const ws = useWhisperState();
  const vs = useVoiceState();
  const [busy, setBusy] = useState(false);
  const [wCached, setWCached] = useState(false);
  const [vCached, setVCached] = useState(false);
  const wLoading = ws.phase === "download" || ws.phase === "init";
  const vLoading = vs.phase === "download" || vs.phase === "init";
  const [error, setError] = useState("");
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const gpu = hasWebGPU();
  const loadingThis = ls.model === llm.webllmModel && (ls.phase === "download" || ls.phase === "init");

  useEffect(() => {
    Promise.all(WEBLLM_MODELS.map(async (m) => [m.id, await isCached(m.id)] as const)).then((r) => setCached(Object.fromEntries(r)));
    whisperCached().then(setWCached);
    voiceCached().then(setVCached);
  }, [ls.phase, ws.phase, vs.phase]);

  // Si le chargement se termine pendant qu'on est sur cet écran, on enchaîne.
  useEffect(() => {
    if (allReady(llm, ws, vs)) onReady?.();
  }, [ls.phase, ws, vs, llm, onReady]);

  async function go() {
    setError("");
    setBusy(true);
    try {
      // Les deux téléchargements en parallèle : le débit total est le même, l'attente perçue plus courte.
      await Promise.all([
        llm.provider === "webllm" ? loadWebLLM(llm.webllmModel) : complete(llm, { messages: [{ role: "user", content: "ok" }], maxTokens: 2 }),
        llm.stt === "whisper" && gpu ? loadWhisper() : Promise.resolve(),
        llm.voice === "natural" ? loadVoice() : Promise.resolve(),
      ]);
      onReady?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (p: Partial<LlmSettings>) => onChange({ ...llm, ...p });
  const ready = allReady(llm, ws, vs);
  const toDownloadMB =
    (llm.provider === "webllm" && !cached[llm.webllmModel] ? (WEBLLM_MODELS.find((m) => m.id === llm.webllmModel)?.mb ?? 0) : 0) +
    (llm.stt === "whisper" && gpu && !wCached && ws.phase !== "ready" ? WHISPER_MB : 0) +
    (llm.voice === "natural" && !vCached && vs.phase !== "ready" ? VOICE_MB : 0);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Cerveau du tuteur (local et gratuit)</h2>
        <p className="mt-1 text-sm text-muted">Aucune clé API, aucun serveur : le modèle tourne sur ton appareil. Tes conversations restent dans ton navigateur.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["webllm", "ollama"] as const).map((p) => (
          <button key={p} onClick={() => set({ provider: p })}
            className={`min-h-11 rounded-xl border px-3 text-sm ${llm.provider === p ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line"}`}>
            {p === "webllm" ? "Dans le navigateur" : "Ollama (local)"}
          </button>
        ))}
      </div>

      {llm.provider === "webllm" ? (
        <div className="space-y-2">
          {!gpu && <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">WebGPU indisponible ici. Utilise Chrome ou Edge récent (ordinateur), ou passe sur Ollama.</p>}
          <div className="space-y-2" role="radiogroup" aria-label="Modèle">
            {WEBLLM_MODELS.map((m) => (
              <button key={m.id} role="radio" aria-checked={llm.webllmModel === m.id} disabled={loadingThis}
                onClick={() => set({ webllmModel: m.id })}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left disabled:opacity-60 ${llm.webllmModel === m.id ? "border-accent bg-accent/10" : "border-line"}`}>
                <span>
                  <span className="block text-sm font-semibold">{m.label}</span>
                  <span className="block text-xs text-muted">{m.note}</span>
                </span>
                {cached[m.id] && <span className="flex shrink-0 items-center gap-1 text-xs text-good"><RiCheckboxCircleFill aria-hidden /> Sur l&apos;appareil</span>}
              </button>
            ))}
          </div>
          {loadingThis && <LoadProgress ls={ls} />}
        </div>
      ) : (
        <div className="space-y-2">
          <input value={llm.ollamaUrl} onChange={(e) => set({ ollamaUrl: e.target.value })} aria-label="Adresse Ollama" className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm" />
          <input value={llm.ollamaModel} onChange={(e) => set({ ollamaModel: e.target.value })} aria-label="Modèle Ollama" placeholder="qwen3:8b" className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm" />
          <p className="text-xs text-muted">
            Installe puis lance : <code>ollama pull {llm.ollamaModel}</code> et <code>OLLAMA_ORIGINS=* ollama serve</code> (nécessaire pour qu&apos;une page web puisse l&apos;appeler).
          </p>
        </div>
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Reconnaissance de ta voix</h3>
        <div className="space-y-2" role="radiogroup" aria-label="Reconnaissance vocale">
          {([
            ["whisper", "Whisper ivrit-ai · 100 % local", `≈ ${WHISPER_MB} Mo · entraîné sur l'hébreu, rien ne quitte l'appareil`],
            ["browser", "Reconnaissance du navigateur", "Aucun téléchargement · l'audio est envoyé à Google/Apple/Microsoft"],
          ] as const).map(([v, label, note]) => (
            <button key={v} role="radio" aria-checked={llm.stt === v} disabled={wLoading || (v === "whisper" && !gpu)} onClick={() => set({ stt: v })}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left disabled:opacity-60 ${llm.stt === v ? "border-accent bg-accent/10" : "border-line"}`}>
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted">{note}</span>
              </span>
              {v === "whisper" && (wCached || ws.phase === "ready") && <span className="flex shrink-0 items-center gap-1 text-xs text-good"><RiCheckboxCircleFill aria-hidden /> Sur l&apos;appareil</span>}
            </button>
          ))}
        </div>
        {wLoading && <LoadProgress ls={ws} />}
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Voix de Noa</h3>
        <div className="space-y-2" role="radiogroup" aria-label="Voix de Noa">
          {([
            ["natural", "Voix naturelle · 100 % locale", `≈ ${VOICE_MB} Mo · Phonikud + Piper, entraînée sur l'hébreu`],
            ["system", "Voix du système", "Aucun téléchargement · voix plus robotique, parfois absente"],
          ] as const).map(([v, label, note]) => (
            <button key={v} role="radio" aria-checked={llm.voice === v} disabled={vLoading} onClick={() => set({ voice: v })}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left disabled:opacity-60 ${llm.voice === v ? "border-accent bg-accent/10" : "border-line"}`}>
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted">{note}</span>
              </span>
              {v === "natural" && (vCached || vs.phase === "ready") && <span className="flex shrink-0 items-center gap-1 text-xs text-good"><RiCheckboxCircleFill aria-hidden /> Sur l&apos;appareil</span>}
            </button>
          ))}
        </div>
        {vLoading && <LoadProgress ls={vs} />}
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}

      <Btn onClick={go} disabled={busy || loadingThis || wLoading || vLoading || (llm.provider === "webllm" && !gpu)} className="flex w-full items-center justify-center gap-2">
        {(busy || loadingThis || wLoading || vLoading) && <RiLoader4Line className="animate-spin" aria-hidden />}
        {loadingThis || wLoading || vLoading ? "Chargement en cours…" : ready ? "Prêt — continuer" : llm.provider === "ollama" ? "Tester la connexion"
          : toDownloadMB === 0 ? "Activer (déjà téléchargé)" : `Télécharger (≈ ${(toDownloadMB / 1000).toFixed(1).replace(".", ",")} Go)`}
      </Btn>
      <button onClick={() => onChange(DEFAULT_LLM)} className="text-xs text-muted underline">Réglages par défaut</button>
    </Card>
  );
}
