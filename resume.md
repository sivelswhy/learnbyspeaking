# Résumé — où on en est (30/10/2026)

## À reprendre, dans l'ordre

1. **Envoyer les 2 modèles convertis sur Hugging Face** (compte `sivelsguy`, jeton déjà enregistré dans `~/.cache/huggingface/token`).
   Les fichiers sont dans `~/learnbyspeaking-models/` (hors du projet, pas dans iCloud). Envoi lent (~0,25 Mo/s, ~1 h) : le lancer en arrière-plan.
   ```
   uvx --from huggingface_hub hf auth whoami
   uvx --from huggingface_hub hf upload sivelsguy/DictaLM-3.0-1.7B-Instruct-q4f16_1-MLC ~/learnbyspeaking-models/DictaLM-3.0-1.7B-Instruct-q4f16_1-MLC . --repo-type model
   uvx --from huggingface_hub hf upload sivelsguy/opus-mt-tc-big-he-en-onnx ~/learnbyspeaking-models/opus-mt-tc-big-he-en-onnx . --repo-type model
   ```
2. **Tester l'app complète** avec les modèles hébergés : préparation (téléchargement), conversation, traduction, micro Whisper.
3. **Pousser sur GitHub Pages** seulement après accord (« push »). Les commits locaux sont en avance sur `origin/main`.
4. **Ménage** : `ollama rm hf.co/EMD123/DictaLM-3.0-1.7B-Instruct-Q4_K_M-GGUF:latest`. Ne pas toucher aux modèles Ollama déjà présents avant (`qwen3*`, `translategemma`).
5. Supprimer le jeton Hugging Face (huggingface.co/settings/tokens) une fois l'envoi fini.

Plus tard : niveaux B1/B2 du parcours (vides, « Bientôt disponible »), test sur un vrai téléphone.

## Choix des modèles (testés)

| Rôle | Modèle | Taille | Pourquoi |
|---|---|---|---|
| Conversation | DictaLM 3.0 1.7B Instruct (Dicta, Israël), converti WebLLM q4f16_1 | ~940 Mo | Entraîné sur l'hébreu, tient sur téléphone, ~0,7 s par réplique |
| Voix → texte | Whisper large-v3-turbo ivrit-ai (q4) | ~760 Mo | Transcription exacte, ~2 s par phrase |
| Traduction | opus-mt-tc-big-he-en (ONNX int8) + Xenova/opus-mt-en-fr | ~465 Mo, à la 1re traduction | DictaLM traduit faux une fois sur deux |

Écartés après tests : Qwen3 1.7B / 4B / 8B (hébreu absurde, anglais mélangé, fautes de genre).

DictaLM a la même architecture que Qwen3 1.7B : l'app réutilise le moteur WebGPU `Qwen3-1.7B-q4f16_1_cs1k-webgpu.wasm` de WebLLM avec nos poids. Les outils MLC étant cassés sur Mac, la conversion se fait avec `~/learnbyspeaking-models/convert_dicta.py` (validé : 97 % des poids identiques au bit près à la conversion officielle de Qwen3). Le traducteur : `convert_mt.py` puis `requant.py`.

Règles qui marchent avec DictaLM : consignes en hébreu + exemples d'échanges (few-shot), 2 phrases max. Pas fiable pour corriger, expliquer ou noter : la correction automatique est retirée, le test de niveau et les bilans sont notés par des règles affichées (`lib/placement.ts`, `lib/sessionScore.ts`).

## Ce que contient l'app

- Onglets Parler / Cours / Bilan / Moi, avatar animé de Noa.
- Test de niveau oral (6 questions, A1 → B2), rapport radar.
- Parcours A1–A2 (5 unités, 20 jours) : entraînement guidé + jeu de rôle (`lib/content/course-he.ts`).
- Ressources écrites à la main : alphabet, vocabulaire, phrases, grammaire (`lib/content/resources-he.ts`).
- Hub « Parler avec Noa » : discussion à sujet, situations, professeur, grammaire, traduction, dictionnaire.
- PWA installable avec tuto iOS/Android, données dans le navigateur, sans compte.

Hébergement des modèles : `lib/hosting.ts`.

## Dev local sans Hugging Face

`.env.local` contient `NEXT_PUBLIC_MODEL_HOST=http://127.0.0.1:8766` : les modèles convertis sont servis depuis `~/learnbyspeaking-models/hub`.
```
python3 ~/learnbyspeaking-models/serve.py   # serveur des modèles (port 8766)
npm run dev                                 # app sur http://localhost:3000
```
Supprimer `.env.local` pour utiliser Hugging Face.
