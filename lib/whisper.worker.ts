import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

// Whisper large-v3-turbo affiné sur l'hébreu par ivrit.ai, quantifié 4 bits (≈ 760 Mo), sur WebGPU.
const MODEL = "ivrit-ai/whisper-large-v3-turbo-onnx";
env.allowLocalModels = false;

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load() {
  asr ??= pipeline("automatic-speech-recognition", MODEL, {
    device: "webgpu",
    dtype: { encoder_model: "q4", decoder_model_merged: "q4" },
    progress_callback: (p) => {
      if (p.status === "progress_total") self.postMessage({ type: "progress", loaded: p.loaded, total: p.total });
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
  return asr;
}

self.onmessage = async (e: MessageEvent<{ type: "load" } | { type: "transcribe"; id: number; audio: Float32Array; language: string }>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      const p = await load();
      self.postMessage({ type: "compiling" });
      // Premier passage à vide : compile les shaders GPU maintenant plutôt qu'à la première phrase.
      await p(new Float32Array(16000), { language: "hebrew", task: "transcribe" });
      self.postMessage({ type: "ready" });
    } else {
      const p = await load();
      const out = await p(msg.audio, { language: msg.language, task: "transcribe" });
      const text = (Array.isArray(out) ? out[0] : out).text;
      self.postMessage({ type: "result", id: msg.id, text });
    }
  } catch (err) {
    if (msg.type === "load") asr = null;
    self.postMessage({ type: "error", id: msg.type === "transcribe" ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
