# Parle (LearnBySpeaking) — apprends l'hébreu en parlant

Application pour apprendre l'hébreu à l'oral avec Shuli, un tuteur IA. 100 % gratuite et locale : aucune clé API, aucun serveur, aucun compte. Deux versions :

- **App Mac native** (SwiftUI, `mac/`) : version principale, modèles exécutés en natif (llama.cpp, whisper.cpp, onnxruntime).
- **Site web / PWA** (Next.js, export statique sur GitHub Pages) : modèles dans le navigateur (WebGPU). Fonctionne aussi sur iPhone.

## Fonctionnalités

- **Test de niveau adaptatif** mené comme une discussion : 4 à 8 questions orales (A1 → B2), estimation bayésienne de la compétence, arrêt quand le niveau est fiable. Notes de pertinence, grammaire, développement, vocabulaire et fluidité (pauses, hésitations, débit), avec les fautes expliquées une à une.
- **Plan de cours sur mesure** : durée selon le niveau, l'objectif et le test ; unités déjà acquises sautées ou accélérées, jours restants mis à jour selon ce qui est fait.
- **Cours** de A1 à C2 : 6 niveaux, 26 unités, 140 jours. Presque tout se fait à l'oral, sans écrire :
  - répéter, répondre, phrases à trou, transformations, compréhension orale ;
  - retrouver l'hébreu de mémoire à partir du français, avec un indice au premier raté puis un nouvel essai ;
  - shadowing à vitesse naturelle et redire en 60, 45 puis 30 s (méthode 4-3-2) ;
  - histoires et dialogues à écouter (A2, B1, B2) ;
  - jeu de rôle et jour de révision mélangée en fin d'unité.
- **Parler avec Shuli** : conversation libre, situations réelles avec missions (restaurant, taxi, aéroport…), « Comment dire… ? », traduction, dictionnaire. Après chaque réponse, Shuli donne son avis et propose une correction quand elle est fiable.
- **Ressources** écrites à la main : alphabet, vocabulaire par thème, phrases utiles, grammaire.
- **Bilan** : historique avec les erreurs fréquentes, temps de pratique, radar des compétences, série de jours, révision espacée (SM-2) du vocabulaire et des phrases du cours.

## IA et voix locales

| Rôle | App Mac | Site web |
|---|---|---|
| Conversation, juge | Gemma 4 E2B (Q4_K_M) via llama.cpp | DictaLM 3.0 1.7B Instruct (WebLLM `q4f16_1`) |
| Voix → texte | Whisper large-v3-turbo ivrit.ai (q8_0) via whisper.cpp | Whisper ivrit.ai via transformers.js, ou la reconnaissance du navigateur |
| Texte → voix (hébreu) | Phrases du cours pré-générées avec BlueTTS et vérifiées par Whisper ; sinon Piper (Phonikud) | Piper (Phonikud) dans un worker |
| Consignes en français | Pré-générées avec Phonon (voix Arnaud) | Voix du système |
| Traduction | opus-mt (fr/en/es → he, he → en) en ONNX | idem |

Limites assumées : les petits modèles parlent bien hébreu mais ne sont pas fiables pour expliquer la grammaire. Les corrections ne sont montrées que si le juge les valide. La prononciation et l'accent tonique ne sont pas notés : l'app ne mesure que le texte reconnu. L'hébreu du cours doit encore être relu par un locuteur natif.

## Dev

```bash
npm install
npm run dev              # site sur http://localhost:3000
bash mac/build.sh        # app Mac : mac/build/LearnBySpeaking.app
```

Le contenu est écrit en TypeScript (`lib/content/`), puis partagé avec l'app Mac :

```bash
npx jiti scripts/check-course.ts     # contrôle du cours (étapes valides, mots nouveaux par jour)
npx jiti scripts/lint-course.ts      # audit du contenu
npx jiti scripts/export-native.ts    # écrit mac/native/Resources/content.json
npm run test:lowend                  # machine low end simulée (CPU ×6, 4G lente, écran 360 px) ; serveur : npx serve out -l 3000
npm run test:lowend:ai               # idem + IA (WebGPU : LLM, Whisper, voix, traduction) ; profil .lowend-profile (~2,5 Go de modèles)

```

Audio du cours après une modification :

1. `npx jiti scripts/export-hebrew-parts.ts`, puis `render_hebrew.py` (BlueTTS).
2. `python3 scripts/verify-hebrew.py` : vérification par Whisper, m4a dans `mac/native/Resources/he/`.
3. `npx jiti scripts/render-french.ts` : consignes françaises dans `mac/native/Resources/fr/`.

Ajouter une langue : une entrée dans `lib/languages.ts` (+ `TARGET_LANGS`) et ses contenus dans `lib/content/`.

Notes détaillées (état, choix des modèles, mesures) : `resume.md`.

## Déploiement

Push sur `main` → GitHub Actions construit l'export statique et le publie sur GitHub Pages.
