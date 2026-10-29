"use client";
import { useState } from "react";
import { DEFAULT_LLM, WEBLLM_MODELS, complete, errorMessage, hasWebGPU, isReady, loadWebLLM, type LlmSettings } from "@/lib/llm";
import { Btn, Card } from "./ui";

export function LlmSetup({
  llm,
  onChange,
  onReady,
}: {
  llm: LlmSettings;
  onChange: (l: LlmSettings) => void;
  onReady?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const gpu = hasWebGPU();

  async function go() {
    setError("");
    setBusy(true);
    try {
      if (llm.provider === "webllm") {
        await loadWebLLM(llm.webllmModel, (p, t) => {
          setProgress(p);
          setStatus(t);
        });
      } else {
        await complete(llm, { messages: [{ role: "user", content: "ok" }], maxTokens: 2 });
      }
      onReady?.();
    } catch (e) {
      setError(errorMessage(e) + (e instanceof Error && e.message ? ` (${e.message.slice(0, 120)})` : ""));
    } finally {
      setBusy(false);
    }
  }

  const set = (p: Partial<LlmSettings>) => onChange({ ...llm, ...p });

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Cerveau du tuteur (local et gratuit)</h2>
        <p className="mt-1 text-sm text-muted">
          Aucune clé API, aucun serveur : le modèle tourne sur ton appareil. Tes conversations ne quittent pas ton
          navigateur.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["webllm", "ollama"] as const).map((p) => (
          <button
            key={p}
            onClick={() => set({ provider: p })}
            className={`min-h-11 rounded-xl border px-3 text-sm ${llm.provider === p ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line"}`}
          >
            {p === "webllm" ? "Dans le navigateur" : "Ollama (local)"}
          </button>
        ))}
      </div>

      {llm.provider === "webllm" ? (
        <div className="space-y-2">
          {!gpu && (
            <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">
              WebGPU indisponible ici. Utilise Chrome ou Edge récent (bureau), ou passe sur Ollama.
            </p>
          )}
          <select
            value={llm.webllmModel}
            onChange={(e) => set({ webllmModel: e.target.value })}
            className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
          >
            {WEBLLM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            Téléchargement une seule fois, puis conservé en cache. Les petits modèles font des erreurs en hébreu :
            prends le plus gros que ton GPU supporte.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={llm.ollamaUrl}
            onChange={(e) => set({ ollamaUrl: e.target.value })}
            aria-label="Adresse Ollama"
            className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
          />
          <input
            value={llm.ollamaModel}
            onChange={(e) => set({ ollamaModel: e.target.value })}
            aria-label="Modèle Ollama"
            placeholder="qwen3:8b"
            className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
          />
          <p className="text-xs text-muted">
            Installe puis lance : <code>ollama pull {llm.ollamaModel}</code> et{" "}
            <code>OLLAMA_ORIGINS=* ollama serve</code> (nécessaire pour qu&apos;une page web puisse l&apos;appeler).
          </p>
        </div>
      )}

      {busy && llm.provider === "webllm" && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{status}</p>
        </div>
      )}
      {error && <p className="text-sm text-warn">{error}</p>}

      <Btn onClick={go} disabled={busy || (llm.provider === "webllm" && !gpu)} className="w-full">
        {busy ? "Chargement…" : isReady(llm) ? "Prêt ✓ — recharger" : llm.provider === "webllm" ? "Télécharger et activer" : "Tester la connexion"}
      </Btn>
      <button onClick={() => onChange(DEFAULT_LLM)} className="text-xs text-muted underline">
        Réglages par défaut
      </button>
    </Card>
  );
}
