/**
 * Fichiers de la voix hébraïque, à des révisions figées sur Hugging Face.
 * - Phonikud (vocalisation) : MIT.
 * - Voix Piper « défaut » de Phonikud TTS : licence non commerciale (CC BY-NC), compatible avec une app gratuite.
 */
const NIKUD_REPO = "https://huggingface.co/Phonikud/phonikud-onnx/resolve/b806189fe1fc0085b1012b7560ffb5e8ecfd72a2";
const PIPER_REPO = "https://huggingface.co/Phonikud/phonikud-tts-checkpoints/resolve/ff64ba389a3833c49a85c58fc51a7060a6984b87";

export const VOICE_CACHE = "parle-voice-v1";

export const VOICE_FILES = [
  { url: `${NIKUD_REPO}/phonikud-1.0.int8.onnx`, bytes: 307_844_158 },
  { url: `${PIPER_REPO}/model.onnx`, bytes: 63_511_038 },
  { url: `${PIPER_REPO}/model.config.json`, bytes: 7_073 },
];

export const VOICE_MB = Math.round(VOICE_FILES.reduce((a, f) => a + f.bytes, 0) / 1e6);
