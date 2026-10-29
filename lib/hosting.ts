/** Compte Hugging Face qui héberge nos modèles convertis (DictaLM WebLLM, traducteur ONNX). */
/** Hôte des modèles : Hugging Face en production, serveur local en dev (NEXT_PUBLIC_MODEL_HOST dans .env.local). */
export const MODEL_HOST = process.env.NEXT_PUBLIC_MODEL_HOST ?? "https://huggingface.co";
export const HF_OWNER = process.env.NEXT_PUBLIC_HF_OWNER ?? "sivelsguy";
export const HF_DICTA_REPO = `${HF_OWNER}/DictaLM-3.0-1.7B-Instruct-q4f16_1-MLC`;
export const HF_MT_HE_EN_REPO = `${HF_OWNER}/opus-mt-tc-big-he-en-onnx`;
