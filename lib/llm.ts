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
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "Léger · Qwen3 1.7B (≈ 1 Go, rapide, qualité moyenne)" },
  { id: "Qwen3-4B-q4f16_1-MLC", label: "Équilibré · Qwen3 4B (≈ 2,5 Go, recommandé)" },
  { id: "Qwen3-8B-q4f16_1-MLC", label: "Qualité · Qwen3 8B (≈ 5 Go, GPU costaud)" },
];

export const DEFAULT_LLM: LlmSettings = {
  provider: "webllm",
  webllmModel: "Qwen3-4B-q4f16_1-MLC",
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

export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function isReady(s: LlmSettings): boolean {
  return s.provider === "ollama" || (engine !== null && engineModel === s.webllmModel);
}

export async function loadWebLLM(model: string, onProgress: (p: number, text: string) => void) {
  if (engine && engineModel === model) return engine;
  if (loading) return loading;
  loading = (async () => {
    const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
    if (engine) await engine.unload();
    const worker = new Worker(new URL("./llm.worker.ts", import.meta.url), { type: "module" });
    engine = await CreateWebWorkerMLCEngine(worker, model, {
      initProgressCallback: (r) => onProgress(r.progress, r.text),
    });
    engineModel = model;
    return engine;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
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
