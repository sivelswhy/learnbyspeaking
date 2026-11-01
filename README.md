# LearnBySpeaking — apprends l'hébreu en parlant

App web (PWA) pour apprendre l'hébreu à l'oral avec Noa, une tutrice IA. 100 % gratuite et locale : aucune clé API, aucun serveur, aucun compte.

## Fonctionnalités

- **Test de niveau** (6 questions orales, A1 → B2) noté sans IA, par des règles affichées.
- **Cours** : parcours A1–A2 (5 unités, 20 jours). Chaque jour : entraînement à la parole guidé par Noa (répéter, répondre) + jeu de rôle.
- **Parler avec Noa** : discussion libre (Noa lance un sujet), situations réelles (restaurant, taxi…), professeur, grammaire, traduction, dictionnaire.
- **Ressources** écrites à la main : alphabet, vocabulaire par thème, phrases utiles, grammaire.
- **Bilan** : historique, temps de pratique, scores (calculés sans IA), révision espacée du vocabulaire.

## IA locale

- **Conversation** : [DictaLM 3.0 1.7B Instruct](https://huggingface.co/dicta-il/DictaLM-3.0-1.7B-Instruct) (Dicta, Israël, Apache-2.0), entraîné sur l'hébreu, converti au format WebLLM `q4f16_1` (~1 Go) et exécuté dans le navigateur via WebGPU. Ollama est aussi possible.
- **Voix → texte** : [Whisper large-v3-turbo ivrit.ai](https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-onnx) via transformers.js (~760 Mo), ou la reconnaissance du navigateur.
- **Texte → voix** : synthèse vocale du navigateur.

Limites assumées : un modèle de 1,7 Md parle bien hébreu mais n'est pas fiable pour corriger la grammaire ; l'app ne fait donc pas de correction automatique et signale ses traductions comme approximatives. La prononciation n'est pas notée.

## Dev

```bash
npm install
npm run dev
```

Ajouter une langue : une entrée dans `lib/languages.ts` (+ `TARGET_LANGS`) et ses contenus dans `lib/content/`.

## Déploiement

Push sur `main` → GitHub Actions construit l'export statique et le publie sur GitHub Pages.
