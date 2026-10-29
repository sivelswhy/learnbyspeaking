"use client";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";

/** 100 % local et gratuit : WebLLM (WebGPU, dans le navigateur) ou Ollama (localhost). */
export interface LlmSettings {
  provider: "webllm" | "ollama";
  webllmModel: string;
  ollamaUrl: string;
  ollamaModel: string;
}

export const WEBLLM_MODELS = [
  { id: "Qwen3-1.7B-q4f16_1-MLC", mb: 968, label: "Rapide · Qwen3 1.7B", note: "≈ 1 Go · démarre vite, hébreu correct" },
  { id: "Qwen3-4B-q4f16_1-MLC", mb: 2263, label: "Meilleur hébreu · Qwen3 4B", note: "≈ 2,3 Go · plus précis" },
  { id: "Qwen3-8B-q4f16_1-MLC", mb: 4608, label: "Qualité max · Qwen3 8B", note: "≈ 4,6 Go · GPU costaud" },
];

export const DEFAULT_LLM: LlmSettings = {
  provider: "webllm",
  webllmModel: "Qwen3-1.7B-q4f16_1-MLC",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen3:8b",
};

export type Msg = { role: "system" | "user" | "assistant"; content: string };

export interface CompleteOpts {
  messages: Msg[];
  /** Schéma JSON : la sortie est contrainte (décodage guidé). */
  schema?: object;
  temperature?: number;
  maxTokens?: number;
  onToken?: (partial: string) => void;
  signal?: AbortSignal;
}

let engine: MLCEngineInterface | null = null;
let engineModel = "";
let loading: Promise<MLCEngineInterface> | null = null;

/* ---------- État global du chargement (survit aux changements d'écran) ---------- */

export interface LoadState {
  model: string;
  phase: "idle" | "download" | "init" | "ready" | "error";
  progress: number; // 0-1
  doneMB: number;
  totalMB: number;
  mbps: number; // Mo/s
  etaSec: number | null;
  fromCache: boolean;
  error?: string;
}

let state: LoadState = { model: "", phase: "idle", progress: 0, doneMB: 0, totalMB: 0, mbps: 0, etaSec: null, fromCache: false };
const listeners = new Set<() => void>();
function setState(p: Partial<LoadState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export const loadStore = {
  get: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function isReady(s: LlmSettings): boolean {
  return s.provider === "ollama" || (engine !== null && engineModel === s.webllmModel);
}

export async function isCached(model: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import("@mlc-ai/web-llm");
    return await hasModelInCache(model);
  } catch {
    return false;
  }
}

export async function loadWebLLM(model: string) {
  if (engine && engineModel === model) return engine;
  if (loading && state.model === model) return loading;
  const totalMB = WEBLLM_MODELS.find((m) => m.id === model)?.mb ?? 0;
  const fromCache = await isCached(model);
  // Demande au navigateur de ne pas effacer le modèle quand l'espace manque.
  if (!fromCache) await navigator.storage?.persist?.().catch(() => false);
  setState({ model, phase: fromCache ? "init" : "download", progress: 0, doneMB: 0, totalMB, mbps: 0, etaSec: null, fromCache, error: undefined });

  const t0 = performance.now();
  let lastT = t0;
  let lastMB = 0;
  let mbps = 0;
  loading = (async () => {
    const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
    if (engine) {
      await engine.unload();
      engine = null;
    }
    const worker = new Worker(new URL("./llm.worker.ts", import.meta.url), { type: "module" });
    const e = await CreateWebWorkerMLCEngine(worker, model, {
      initProgressCallback: (r) => {
        const fetching = /fetching/i.test(r.text);
        const m = r.text.match(/(\d+)\s*MB/i);
        const doneMB = m ? Number(m[1]) : Math.round(r.progress * totalMB);
        const now = performance.now();
        if (fetching && now - lastT > 700) {
          // vitesse lissée (moyenne mobile exponentielle)
          const inst = (doneMB - lastMB) / ((now - lastT) / 1000);
          mbps = mbps ? mbps * 0.7 + inst * 0.3 : inst;
          lastT = now;
          lastMB = doneMB;
        }
        const left = totalMB - doneMB;
        setState({
          phase: fetching && !fromCache ? "download" : r.progress >= 1 ? "init" : state.phase,
          progress: r.progress,
          doneMB,
          mbps: Math.max(0, mbps),
          etaSec: fetching && mbps > 0.1 ? Math.round(left / mbps) : null,
        });
      },
    });
    engine = e;
    engineModel = model;
    setState({ phase: "ready", progress: 1, etaSec: null });
    return e;
  })();
  try {
    return await loading;
  } catch (err) {
    setState({ phase: "error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    loading = null;
  }
}

/** Au démarrage : si le modèle est déjà sur l'appareil, on le prépare sans rien demander. */
export async function warmIfCached(s: LlmSettings) {
  if (s.provider !== "webllm" || !hasWebGPU() || isReady(s) || loading) return;
  if (await isCached(s.webllmModel)) loadWebLLM(s.webllmModel).catch(() => {});
}

export async function complete(s: LlmSettings, o: CompleteOpts): Promise<string> {
  if (s.provider === "ollama") return completeOllama(s, o);
  if (!engine) throw new Error("MODEL_NOT_LOADED");
  const stream = !!o.onToken;
  const req = {
    messages: o.messages,
    temperature: o.temperature ?? 0.6,
    max_tokens: o.maxTokens ?? 400,
    response_format: o.schema ? { type: "json_object" as const, schema: JSON.stringify(o.schema) } : undefined,
    extra_body: { enable_thinking: false },
  };
  if (!stream) {
    const r = await engine.chat.completions.create({ ...req, stream: false });
    return r.choices[0]?.message?.content ?? "";
  }
  let text = "";
  const it = await engine.chat.completions.create({ ...req, stream: true });
  for await (const chunk of it) {
    if (o.signal?.aborted) {
      engine.interruptGenerate();
      break;
    }
    text += chunk.choices[0]?.delta?.content ?? "";
    o.onToken?.(text);
  }
  return text;
}

async function completeOllama(s: LlmSettings, o: CompleteOpts): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${s.ollamaUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      signal: o.signal,
      body: JSON.stringify({
        model: s.ollamaModel,
        messages: o.messages,
        stream: !!o.onToken,
        think: false,
        format: o.schema,
        options: { temperature: o.temperature ?? 0.6, num_predict: o.maxTokens ?? 400 },
      }),
    });
  } catch {
    throw new Error("OLLAMA_UNREACHABLE");
  }
  if (!res.ok) throw new Error(`OLLAMA_${res.status}`);
  if (!o.onToken) return (await res.json()).message?.content ?? "";
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = "";
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        text += JSON.parse(l).message?.content ?? "";
        o.onToken(text);
      } catch {
        /* ligne partielle */
      }
    }
  }
  return text;
}

export function errorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m === "MODEL_NOT_LOADED") return "Le modèle n'est pas chargé. Ouvre les réglages IA.";
  if (m === "OLLAMA_UNREACHABLE")
    return "Ollama injoignable. Lance-le avec OLLAMA_ORIGINS=* ollama serve, ou repasse sur le mode navigateur.";
  if (m.startsWith("OLLAMA_")) return `Ollama a répondu ${m.slice(7)}. Vérifie le nom du modèle.`;
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Hors ligne. Réessaie.";
  return "Le tuteur a rencontré une erreur. Réessaie.";
}

export function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        /* abandon */
      }
    }
    return fallback;
  }
}
