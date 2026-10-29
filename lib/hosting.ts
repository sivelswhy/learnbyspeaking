/** Compte Hugging Face qui héberge nos modèles convertis (DictaLM WebLLM, traducteur ONNX). */
export const HF_OWNER = process.env.NEXT_PUBLIC_HF_OWNER ?? "sivelswhy";
export const HF_DICTA_REPO = `${HF_OWNER}/DictaLM-3.0-1.7B-Instruct-q4f16_1-MLC`;
export const HF_MT_HE_EN_REPO = `${HF_OWNER}/opus-mt-tc-big-he-en-onnx`;
