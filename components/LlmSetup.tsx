"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RiCheckboxCircleFill, RiCpuLine, RiDownloadCloud2Line, RiErrorWarningLine, RiLoader4Line } from "react-icons/ri";
import {
  DEFAULT_LLM, WEBLLM_MODELS, complete, errorMessage, hasWebGPU, isCached, isReady, loadStore, loadWebLLM,
  type LlmSettings, type LoadState,
} from "@/lib/llm";
import { lowMemoryDevice } from "@/lib/device";
import type { LangCode } from "@/lib/languages";
import { mtStore, preloadTranslators, translatorsCached, translatorsMB } from "@/lib/translate";
import { setKeepAwake, useKeepAwakePref, wakeLockSupported } from "@/lib/wakeLock";
import { VOICE_MB, loadVoice, voiceCached, voiceStore } from "@/lib/voice";
import { WHISPER_MB, loadWhisper, whisperCached, whisperStore } from "@/lib/whisper";
import { Avatar } from "./Avatar";
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

export function useMtState(): LoadState {
  return useSyncExternalStore(mtStore.subscribe, mtStore.get, mtStore.get);
}

export const isLoading = (s: LoadState) => s.phase === "download" || s.phase === "init";

/** Interrupteur « Garder l'écran allumé » : sur téléphone, l'écran éteint met le téléchargement en pause. */
export function KeepAwakeToggle() {
  const on = useKeepAwakePref();
  const ok = wakeLockSupported();
  return (
    <label className={`flex items-center justify-between gap-3 rounded-xl border border-line p-3 ${ok ? "cursor-pointer" : "opacity-60"}`}>
      <span>
        <span className="block text-sm font-semibold">Garder l&apos;écran allumé</span>
        <span className="block text-xs text-muted">
          {ok ? "Pendant le téléchargement, pour que le téléphone ne se mette pas en veille et ne coupe pas le téléchargement." : "Non pris en charge par ce navigateur : touche l'écran de temps en temps pendant le téléchargement."}
        </span>
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={ok && on} disabled={!ok} onChange={(e) => setKeepAwake(e.target.checked)} />
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-line transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:left-0.5 after:top-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

/**
 * État de l'IA, en distinguant :
 *  - ready : modèles chargés en mémoire, tout marche ;
 *  - loading : modèles déjà sur l'appareil, en cours de chargement au lancement (quelques secondes, rien à télécharger) ;
 *  - downloading : téléchargement en cours ;
 *  - missing : au moins un modèle n'est pas sur l'appareil.
 */
export type AiStatus = "ready" | "loading" | "downloading" | "missing";

export function useAiStatus(llm: LlmSettings): AiStatus {
  const ls = useLoadState();
  const ws = useWhisperState();
  const vs = useVoiceState();
  const ready = allReady(llm, ws, vs);
  // null : vérification du cache en cours. true : tous les modèles utiles sont sur l'appareil.
  const [onDevice, setOnDevice] = useState<boolean | null>(null);
  const phases = `${ls.phase}${ws.phase}${vs.phase}`;
  useEffect(() => {
    let alive = true;
    void (async () => {
      const llmOk = llm.provider === "ollama" || (await isCached(llm.webllmModel));
      const wOk = llm.stt !== "whisper" || !hasWebGPU() || (await whisperCached());
      const vOk = llm.voice !== "natural" || (await voiceCached());
      if (alive) setOnDevice(llmOk && wOk && vOk);
    })();
    return () => {
      alive = false;
    };
  }, [llm.provider, llm.webllmModel, llm.stt, llm.voice, phases]);
  if (ready) return "ready";
  if ([ls, ws, vs].some((x) => x.phase === "download")) return "downloading";
  if ([ls, ws, vs].some((x) => x.phase === "error")) return "missing"; // l'écran de préparation affiche l'erreur
  return onDevice === false ? "missing" : "loading";
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
  const label = ls.model === "whisper" ? "Whisper ivrit-ai (voix)" : ls.model === "voice" ? "Voix de Shuli" : ls.model === "mt" ? "Traducteurs" : (WEBLLM_MODELS.find((m) => m.id === ls.model)?.label ?? ls.model);
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

/**
 * Réglages et téléchargement des modèles.
 * `required` (premier lancement) : pas de choix, tout ce que l'app utilise est téléchargé, traducteurs compris.
 */
export function LlmSetup({ llm, onChange, onReady, native = "fr", required = false }: {
  llm: LlmSettings; onChange: (l: LlmSettings) => void; onReady?: () => void; native?: LangCode; required?: boolean;
}) {
  const ls = useLoadState();
  const ws = useWhisperState();
  const vs = useVoiceState();
  const ms = useMtState();
  const [mCached, setMCached] = useState(false);
  const mLoading = isLoading(ms);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [wCached, setWCached] = useState(false);
  const [vCached, setVCached] = useState(false);
  const wLoading = ws.phase === "download" || ws.phase === "init";
  const vLoading = vs.phase === "download" || vs.phase === "init";
  const [error, setError] = useState("");
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const gpu = hasWebGPU();
  const lowMem = lowMemoryDevice();
  const loadingThis = ls.model === llm.webllmModel && (ls.phase === "download" || ls.phase === "init");

  useEffect(() => {
    Promise.all(WEBLLM_MODELS.map(async (m) => [m.id, await isCached(m.id)] as const)).then((r) => setCached(Object.fromEntries(r)));
    whisperCached().then(setWCached);
    voiceCached().then(setVCached);
    translatorsCached(native).then(setMCached);
  }, [ls.phase, ws.phase, vs.phase, ms.phase, native]);

  // Si le chargement se termine pendant qu'on est sur cet écran, on enchaîne.
  useEffect(() => {
    if (allReady(llm, ws, vs) && (!required || ms.phase === "ready")) onReady?.();
  }, [ls.phase, ws, vs, ms.phase, llm, onReady, required]);

  async function go() {
    setError("");
    setBusy(true);
    try {
      // L'un après l'autre : en parallèle, les copies en mémoire s'additionnent et Safari recharge la page.
      // Traducteurs d'abord : leur worker est fermé aussitôt, avant que les autres modèles n'occupent la mémoire.
      await preloadTranslators(native);
      if (llm.provider === "webllm") await loadWebLLM(llm.webllmModel);
      else await complete(llm, { messages: [{ role: "user", content: "ok" }], maxTokens: 2 });
      if (llm.stt === "whisper" && gpu) await loadWhisper();
      if (llm.voice === "natural") await loadVoice();
      setRetry(0);
      onReady?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Reprise : le téléchargement repart là où il s'est arrêté (chaque fichier déjà reçu reste en cache).
  // Premier lancement : 3 nouvelles tentatives automatiques, et un essai dès que le réseau revient.
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  const failed = !!error || [ms, ls, ws, vs].some((x) => x.phase === "error");
  useEffect(() => {
    if (!required || !failed || busy || retry >= 3) return;
    const t = setTimeout(() => {
      setRetry((r) => r + 1);
      void goRef.current();
    }, 4000 * (retry + 1));
    return () => clearTimeout(t);
  }, [required, failed, busy, retry]);
  useEffect(() => {
    if (!required) return;
    const on = () => {
      if (failed && !busy) {
        setRetry(0);
        void goRef.current();
      }
    };
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [required, failed, busy]);
  const set = (p: Partial<LlmSettings>) => onChange({ ...llm, ...p });
  const ready = allReady(llm, ws, vs) && (!required || ms.phase === "ready");
  const anyLoading = busy || loadingThis || wLoading || vLoading || mLoading;
  const toDownloadMB =
    (llm.provider === "webllm" && !cached[llm.webllmModel] ? (WEBLLM_MODELS.find((m) => m.id === llm.webllmModel)?.mb ?? 0) : 0) +
    (llm.stt === "whisper" && gpu && !wCached && ws.phase !== "ready" ? WHISPER_MB : 0) +
    (llm.voice === "natural" && !vCached && vs.phase !== "ready" ? VOICE_MB : 0) +
    (!mCached && ms.phase !== "ready" ? translatorsMB(native) : 0);
  const items: [string, number, boolean][] = [
    ["Cerveau de Shuli (DictaLM)", WEBLLM_MODELS.find((m) => m.id === llm.webllmModel)?.mb ?? 0, !!cached[llm.webllmModel] || ls.phase === "ready"],
    ...(llm.stt === "whisper" && gpu ? [["Reconnaissance de ta voix (Whisper)", WHISPER_MB, wCached || ws.phase === "ready"] as [string, number, boolean]] : []),
    ...(llm.voice === "natural" ? [["Voix de Shuli", VOICE_MB, vCached || vs.phase === "ready"] as [string, number, boolean]] : []),
    ...(translatorsMB(native) ? [["Traducteurs", translatorsMB(native), mCached || ms.phase === "ready"] as [string, number, boolean]] : []),
  ];
  const button = (
    <Btn onClick={go} disabled={anyLoading || (llm.provider === "webllm" && !gpu)} className="flex w-full items-center justify-center gap-2">
      {anyLoading && <RiLoader4Line className="animate-spin" aria-hidden />}
      {loadingThis || wLoading || vLoading || mLoading ? "Chargement en cours…" : ready ? "Prêt — continuer" : llm.provider === "ollama" ? "Tester la connexion"
        : toDownloadMB === 0 ? "Activer (déjà téléchargé)" : `Télécharger (≈ ${(toDownloadMB / 1000).toFixed(1).replace(".", ",")} Go)`}
    </Btn>
  );

  if (required) {
    return (
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar size={64} mood={[ms, ls, ws, vs].some((x) => x.phase === "error") ? "sad" : anyLoading ? "think" : ready ? "cheer" : "happy"} className="shrink-0" />
          <p className="text-sm font-semibold">
            {failed ? (retry < 3 && required ? `Oups, la connexion a coupé. Je reprends où j'en étais… (essai ${Math.min(retry + 1, 3)}/3)` : "Le téléchargement a échoué. Vérifie ta connexion puis touche « Télécharger » : il reprend où il s'est arrêté.") : anyLoading ? "Je m'installe… tu peux me laisser travailler." : ready ? "C'est prêt, on y va !" : "Un seul téléchargement, et tout marche ensuite sans connexion."}
          </p>
        </div>
        {!gpu && <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">WebGPU indisponible ici : Shuli ne peut pas tourner dans ce navigateur. Utilise Chrome ou Edge récent, ou Safari à jour sur iPhone.</p>}
        <ul className="space-y-2">
          {items.map(([label, mb, ok]) => (
            <li key={label} className="flex items-center justify-between gap-3 text-sm">
              <span>{label}</span>
              {ok ? <span className="flex shrink-0 items-center gap-1 text-xs text-good"><RiCheckboxCircleFill aria-hidden /> Sur l&apos;appareil</span>
                : <span className="shrink-0 text-xs tabular-nums text-muted">≈ {mb} Mo</span>}
            </li>
          ))}
        </ul>
        {[ms, ls, ws, vs].filter(isLoading).map((x) => <LoadProgress key={x.model} ls={x} />)}
        {[ms, ls, ws, vs].filter((x) => x.phase === "error").map((x) => <LoadProgress key={x.model} ls={x} />)}
        <KeepAwakeToggle />
        <p className="text-xs text-muted">Une seule fois, de préférence en Wi-Fi : ensuite tout se charge depuis l&apos;appareil, même hors ligne.</p>
        {error && <p className="text-sm text-warn">{error}</p>}
        {button}
      </Card>
    );
  }

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
            ["whisper", "Whisper ivrit-ai · 100 % local", `≈ ${WHISPER_MB} Mo · entraîné sur l'hébreu, rien ne quitte l'appareil${lowMem ? " · risque de recharger la page sur iPhone" : ""}`],
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
        <h3 className="text-sm font-semibold">Voix de Shuli</h3>
        <div className="space-y-2" role="radiogroup" aria-label="Voix de Shuli">
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

      {mLoading && <LoadProgress ls={ms} />}
      {anyLoading && <KeepAwakeToggle />}
      {button}
      <button onClick={() => onChange(DEFAULT_LLM)} className="text-xs text-muted underline">Réglages par défaut</button>
    </Card>
  );
}
