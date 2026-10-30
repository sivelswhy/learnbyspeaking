import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

// Whisper large-v3-turbo affiné sur l'hébreu par ivrit.ai, quantifié 4 bits, sur WebGPU.
const MODEL = "ivrit-ai/whisper-large-v3-turbo-onnx";
env.allowLocalModels = false;

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load(d: "q4" | "q4f16") {
  asr ??= pipeline("automatic-speech-recognition", MODEL, {
    device: "webgpu",
    dtype: { encoder_model: d, decoder_model_merged: d },
    progress_callback: (p) => {
      if (p.status === "progress_total") self.postMessage({ type: "progress", loaded: p.loaded, total: p.total });
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
  return asr;
}

self.onmessage = async (e: MessageEvent<{ type: "load"; dtype: "q4" | "q4f16" } | { type: "transcribe"; id: number; audio: Float32Array; language: string }>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      const p = await load(msg.dtype);
      self.postMessage({ type: "compiling" });
      // Premier passage à vide : compile les shaders GPU maintenant plutôt qu'à la première phrase.
      await p(new Float32Array(16000), { language: "hebrew", task: "transcribe" });
      self.postMessage({ type: "ready" });
    } else {
      const p = await load("q4"); // déjà chargé à ce stade : la variante est ignorée
      const out = await p(msg.audio, { language: msg.language, task: "transcribe" });
      const text = (Array.isArray(out) ? out[0] : out).text;
      self.postMessage({ type: "result", id: msg.id, text });
    }
  } catch (err) {
    if (msg.type === "load") asr = null;
    self.postMessage({ type: "error", id: msg.type === "transcribe" ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};

// Prêt à recevoir des messages (voir lib/workerReady.ts).
self.postMessage({ type: "alive" });
