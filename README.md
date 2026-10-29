# Parle — apprends l'hébreu en parlant

Conversation vocale avec un tuteur IA, 100 % gratuit et local : aucune clé API, aucun serveur, aucun compte.

- **IA** : [WebLLM](https://github.com/mlc-ai/web-llm) (modèle Qwen3 exécuté dans le navigateur via WebGPU) ou [Ollama](https://ollama.com) en local.
- **Voix** : Web Speech API du navigateur (reconnaissance `he-IL` + synthèse). Chrome/Edge/Safari recommandés.
- **Données** : progression et vocabulaire dans le `localStorage` de l'appareil.
- **Limites** : la prononciation n'est pas notée (le navigateur ne le permet pas) ; les petits modèles locaux font des erreurs en hébreu.

## Dev

```bash
npm install
npm run dev
```

Ajouter une langue : une entrée dans `lib/languages.ts` (+ l'ajouter à `TARGET_LANGS`).

## Déploiement

Push sur `main` → GitHub Actions construit l'export statique et le publie sur GitHub Pages.
