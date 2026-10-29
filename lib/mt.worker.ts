import { env, pipeline, type TranslationPipeline } from "@huggingface/transformers";
import { HF_OWNER, MODEL_HOST } from "./hosting";

// Traduction automatique dédiée (modèles opus-mt d'Helsinki-NLP), bien plus fiable qu'un petit LLM.
env.allowLocalModels = false;
const HF_HOST = env.remoteHost;
const pipes = new Map<string, Promise<TranslationPipeline>>();

function get(model: string) {
  if (!pipes.has(model)) {
    // Nos modèles convertis peuvent venir d'un autre hôte (serveur local en dev) ; les autres de Hugging Face.
    env.remoteHost = model.startsWith(`${HF_OWNER}/`) ? `${MODEL_HOST}/` : HF_HOST;
    pipes.set(model, pipeline("translation", model, { dtype: "q8", device: "wasm" }) as Promise<TranslationPipeline>);
  }
  return pipes.get(model)!;
}

self.onmessage = async (e: MessageEvent<{ id: number; chain: string[]; sentences: string[] }>) => {
  const { id, chain, sentences } = e.data;
  try {
    let cur = sentences;
    for (const model of chain) {
      const p = await get(model);
      const out = (await p(cur, { num_beams: 2, max_new_tokens: 80 })) as { translation_text: string }[];
      cur = out.map((o) => o.translation_text);
    }
    self.postMessage({ id, text: cur.join(" ") });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
