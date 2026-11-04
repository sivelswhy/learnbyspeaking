# Résumé — où on en est (02/11/2026, nuit)

## Chantier du cours (04/11/2026) : fait, commité, non poussé

Analyse de professeur puis plan en 9 étapes, tout exécuté sauf l'accent tonique.
- **Nouveaux types d'étapes** (`lib/content/course-he.ts`, `Step`) : `listen` (compréhension à choix), `fill` (phrase à trou), `free` (réponse libre), `swap` (transformation). Écrans : `components/SpeakingPractice.tsx` et `mac/native/PracticeView.swift` ; décodage Swift dans `Content.swift` (`Step`, `Day.cards`).
- **Contenu** : 71 jours (avant 36), A1 à C2. Unité 0 « Survie », jours Compter / Il y a / Dizaines / Dire non, unité « Les petits mots » (pronoms collés, smikhut, ba-/la-), un jour d'hébreu parlé par niveau (A1, A2, B1, B2), C1 et C2 (4 jours chacun), un jour « Révision » ajouté automatiquement à la fin de chaque unité (fin de `course-he.ts`).
- **Révision espacée** : à la fin d'un entraînement, `dayCards` envoie les phrases du jour dans les cartes (`app/page.tsx`, `PracticeView.swift`).
- **Contrôle** : `npx jiti scripts/check-course.ts [--all]` (mots nouveaux par jour, étapes valides : une bonne réponse par écoute, mot caché présent, ids uniques).
- **Voix** : phrases de 3 mots ou moins plus lentes (`lengthScale` 1,5, bruit 0,1 / 0,3 sur Mac) : `Voice.swift`, `lib/voice.ts`. Choisi à l'oreille par l'utilisateur (« אני רעב » mâché).
- **Voix « michael » retirée de l'app Mac (04/11)** : la voix par défaut est maintenant « shaul » (`Voice.swift`, téléchargée au premier lancement à la place de michael ; le fichier `michael.onnx` peut être supprimé de `~/Library/Application Support/LearnBySpeaking/models/voice/`). Mesure du 03/11 : shaul 92 % de mots retrouvés par Whisper contre 97 % pour michael.
- **Voix française des consignes** : fichiers pré-générés avec Phonon (`gradium/phonon-40m-fr`, voix Arnaud, CC BY-NC 4.0, modèle protégé : jeton HF requis) par `scripts/render-french.ts` (181 m4a dans `mac/native/Resources/fr/`, nommés d'après le SHA-1 du texte ; modèle dans `~/learnbyspeaking-models/phonon`, `brew install gradium-ai/tap/ptts`). `Voice.swift` les lit (`sayFrench`), voix macOS en secours. Après toute modification d'une consigne : relancer le script (il saute les textes déjà générés). Le site et l'iPhone gardent la voix du système.
- **Reste** : accent tonique dans les translittérations (non fait : risque de fautes, pas de convention pour les majuscules) ; relecture par un locuteur natif des jours d'hébreu parlé et des niveaux C1/C2 ; 5 jours B2 chargés en mots nouveaux ; exercices non joués à la main dans l'app.
- `content.json` et `export-native.ts` portent aussi des changements d'une autre tâche (test de niveau) : pas commités avec le cours.

## Reprise du 02/11 : en cours

**Dernier push : `814714c` (03/11).** Ne pousser qu'après « push ».

### 1. Passage de l'IA de WebLLM à llama.cpp (en cours, prochaine étape)
- But : DictaLM 1.7B en **8 bits** (au lieu de 4 bits WebLLM), plus rapide, via Metal natif. MLX abandonné : il faut le Metal Toolchain de Xcode, dont le téléchargement ne marche pas sur ce Mac.
- Fait : binaire llama.cpp **b11732** (macOS arm64, 19/10) dans `~/learnbyspeaking-models/llamacpp/llama-b11732/` ; modèle converti `~/learnbyspeaking-models/llamacpp/dictalm-1.7b-instruct-q8_0.gguf` (1,8 Go, depuis les poids officiels `dicta-il/DictaLM-3.0-1.7B-Instruct` dans `~/learnbyspeaking-models/src-instruct`).
- Claude Code refuse de lancer du code téléchargé : démarrer le serveur soi-même :
  `! cd ~/learnbyspeaking-models/llamacpp && (llama-b11732/llama-server -m dictalm-1.7b-instruct-q8_0.gguf --port 47900 --jinja -ngl 99 > server.log 2>&1 &) && sleep 5 && tail -3 server.log`
- **Fait le 02/11 (après-midi)** :
  - Banc d'essai (108 générations brutes, consignes de l'app, premier essai) : 8 bits llama.cpp = 0 trop longue, 29 sans question, 4 genre, 7,1 mots, **286 ms/réplique** ; 4 bits WebLLM (31/10) = 12 trop longues, 64 sans question, 4 genre, ~700 ms. Moteur complet `nextReply` : 0 défaut sur 36. Notation (`yesProbability` par logprobs) : justes pertinentes 1,00, hors sujet 0,00.
  - Piège : les pénalités `frequency/presence_penalty` de llama.cpp s'appliquent aussi au prompt (donc au jeton de fin des exemples) → répliques de 17,8 mots, 18/36 trop longues. Remplacées par `dry_multiplier: 0.8` pour llama.cpp.
  - `lib/llm.ts` : fournisseur `llamacpp` (streaming SSE, JSON contraint, logprobs, attente jusqu'à 60 s pendant le chargement du modèle), `nativeLlama()` lit `window.__lbsNative` injecté par l'app Mac. `lib/store.ts` force `llamacpp` dans l'app Mac (et revient à WebLLM ailleurs). `LlmSetup` : pas de téléchargement du cerveau dans l'app Mac.
  - `mac/main.swift` : `LlamaServer` lance `Contents/Resources/llama/llama-server` (port 47900, `--api-key` aléatoire par lancement, `--no-webui`, `-c 8192 -np 2`), tue un serveur orphelin, l'arrête à la fermeture ; journal dans `~/Library/Application Support/LearnBySpeaking/llama-server.log`. Modèle lu dans `~/Library/Application Support/LearnBySpeaking/models/dictalm-1.7b-instruct-q8_0.gguf` (lien symbolique vers la copie de dev) ou `LEARNBYSPEAKING_GGUF`. `LEARNBYSPEAKING_NOLLAMA=1` : garder WebLLM. `mac/build.sh` copie le binaire et ses dylibs (app : 92 Mo).
  - Vérifié dans l'app (02/11) : Shuli répond via llama.cpp, 61 tokens/s ; requête sans jeton refusée (401). Poussé (`83a2efc`).
- **Suite du 02/11 (non commité)** :
  - **Téléchargement du GGUF au premier lancement** (`ModelDownload` dans `mac/main.swift`, `lib/native.ts`) : URLSession avec reprise, SHA-256 vérifié, puis serveur démarré et `/health` attendu ; progression dans la page via `window.__lbsBrain`. Testé de bout en bout avec `LEARNBYSPEAKING_GGUF_URL` (serveur local) : OK. **Le GGUF n'est pas encore sur Hugging Face** : l'envoi public a été bloqué par Claude Code, l'utilisateur doit le lancer (commande ci-dessous). Adresse prévue : `sivelsguy/DictaLM-3.0-1.7B-Instruct-Q8_0-GGUF`, fichier `dictalm-1.7b-instruct-q8_0.gguf`, SHA-256 `871d3ba7…c8a7`.
  - SIGTERM intercepté (sinon `pkill` laissait llama-server orphelin).
  - **Avis de Shuli après chaque réponse** (`lib/feedback.ts`, carte sous la bulle) : juge du test de niveau (pertinence, grammaire, correction fiable), conseils par règles (répondre à la question, phrase complète, développer), exemple de meilleure réponse gardé seulement s'il passe le juge (pertinence ≥ 0,5, grammaire ≥ 0,85) ; compliment sinon. 0,35-1 s après la réplique de Shuli.
  - **Questions annexes dans les scènes guidées** (`sideQuestion` dans `lib/dialogue.ts`) : « אני רוצה חלון, אבל יש אוכל במטוס? » accomplit la mission et reçoit une réponse (réplique écrite à la main, sinon DictaLM vérifiée par le juge de pertinence, sinon « je ne suis pas sûr »). 9 cas sur 9 corrects, toutes scènes.
  - **Espace** en conversation (micro on/off) ; l'espace n'est plus captée par un bouton cliqué à la souris (`lib/keys.ts`).
  - **GGUF en ligne** (envoyé par l'utilisateur) : `sivelsguy/DictaLM-3.0-1.7B-Instruct-Q8_0-GGUF`, SHA-256 vérifié identique.
  - **whisper.cpp natif (fait, vérifié dans l'app)** : whisper.cpp v1.9.5 compilé en statique avec Metal intégré (`~/learnbyspeaking-models/whispercpp/src/build/bin/whisper-server`, 8,4 Mo, `cmake` installé par brew), embarqué par `mac/build.sh`. Modèle ivrit-ai large-v3-turbo quantifié en q8_0 (874 Mo, SHA-256 `123a936e…c9a6`, même transcription que le f16 sur 6 phrases `say -v Carmit`). Serveur : port 47901, chemin d'inférence secret (pas d'option de jeton), `-bs 5 -bo 5` (en glouton : « לימ-אי »). Page : `lib/whisper.ts` envoie un WAV, amorce avec « ? » (sinon 2 questions sur 3 perdaient leur « ? »), retire « , » / « - » parasites en tête, réessaie 20 s pendant le chargement (~4 s). **0,5 s par phrase** (WebGPU : 2-3 s). `ModelServer`/`ModelDownload` génériques dans `mac/main.swift`, `lib/native.ts` commun. Modèle de dev : lien dans `~/Library/Application Support/LearnBySpeaking/models/`.
  - **Whisper q8_0 en ligne** (envoyé par l'utilisateur) : `sivelsguy/whisper-large-v3-turbo-ivrit-q8_0-ggml`, SHA-256 vérifié identique, téléchargeable (HTTP 200).
  - Poussé : `9489868` (déploiement Pages OK).
- **Après `9489868` (non commité)** :
  - **Niveau visé** (`Profile.targetLevel`, `targetLevelOf` : sinon niveau suivant) : choisi dans `GoalSetup` et dans Réglages › Profil.
  - **Avis selon le profil** (`lib/feedback.ts`) : pastille « A2 → B1 · Voyage » ; longueur attendue au niveau visé (A2 5 mots, B1 8, B2 12, +2 si focus « oser parler ») ; compétence du niveau visé si absente (A2 relier, B1 כי/אבל/אז, B2 nuance/avis, C1 argumenter) ; focus grammaire = doute signalé dès 75 ; exemple écrit au niveau visé ; réponse déjà bonne : piste liée à l'objectif (voyage, travail…).
  - **Gemma 4 E2B dans l'app Mac (fait, 02/11 soir)** : `mac/main.swift` télécharge `unsloth/gemma-4-E2B-it-GGUF` (Q4_K_M, 3,1 Go, SHA-256 `740185b2…34b8`) au lieu de DictaLM ; dev : lien `~/Library/Application Support/LearnBySpeaking/models/gemma-4-E2B-it-Q4_K_M.gguf` → `~/learnbyspeaking-models/cand/gemma4-e2b-q4km.gguf`. `chat_template_kwargs.enable_thinking=false`. **Conversation libre** (`lib/humanDialogue.ts`, appelé par `nextReply` quand `provider === "llamacpp"`) : consigne humaine (rôle, faits, étapes à demander dans l'ordre, règles : silence, hors sujet, mot français, pas compris, question perso, impatience ; exemples), 3 essais, contrôles genre (dont « את » + verbe dit à un homme), latin, rôle inversé (questions seulement), répétition. Silence / « אממ » : encouragement + dernière question, sans modèle. Missions : mots-clés ou juge, jamais pour une mission où l'apprenant doit demander (`answersOnlyByAsking`). Juge sur Gemma : pertinence 18/19, grammaire nette (0 vs 1). `related()` rapproche הולכת/הלכתי (squelette sans ו/י). Simulations (`scratchpad/sim-users.ts`, apprenant joué par Gemma, 11 comportements tirés au hasard, 320 répliques par passage) : 2-4 défauts automatiques, ~0,5-0,7 s/réplique ; le juge « cohérence » est trop bruité pour servir de mesure, lecture manuelle : hors sujet, français, questions perso et silences bien gérés. Web/iPhone : toujours DictaLM + scènes guidées (à revoir plus tard avec Gemma ONNX).
  - **Prochaine grande étape (demande du 02/11)** : conversations vraiment humaines, sans scènes génériques ni répliques écrites d'avance. L'utilisateur veut un modèle « entre les deux » (~4B) qui tourne **aussi sur téléphone**. Candidats trouvés : Gemma 4 E2B (3,1 Go Q4, ONNX dispo pour le web), Gemma 4 E4B (5 Go), Qwen3.5-4B (2,7 Go ; Qwen3 était mauvais en hébreu). DictaLM 3.0 Nemotron 12B (7,5 Go Q4) écarté : pas sur téléphone. Gemma 4 E2B téléchargé, testé et branché dans l'app Mac (voir ci-dessus ; build du 02/11 15:54 à jour). Reste : la même conversation libre sur le web et l'iPhone (Gemma 4 E2B en ONNX/WebGPU, ~3 Go à télécharger sur téléphone : à valider), puis commit.
  - **Tests de la conversation libre (02/11, nuit)** : banc `scratchpad/talk.ts` (conversations écrites jouées contre le llama-server de l'app). Corrigé : consigne propre à la réplique (`turnHint` : « לא הבנתי » → redire plus simplement ; question de l'apprenant → y répondre d'abord), défaut « à côté » (`MUST_ANSWER` : prix, durée, heure) ; demande faisable (« מהר בבקשה ») → accepter. Prix taxi/marché, question annexe aéroport, heure d'embarquement, petit-déjeuner hôtel : justes.
  - **Menu « Dev »** dans la barre des menus de l'app, après Fenêtre (`debugOnboardingItems` + « Autres outils » = `debugMenuItems`, `mac/Debug.local.swift`) : test de niveau (intro avec genre, direct m/f), écran des objectifs avec résultat A1-B2, premier lancement complet, terminer le premier lancement.
  - **Test de niveau comme une discussion** (`lib/placementTalk.ts`, `components/Placement.tsx`) : Shuli réagit à chaque réponse (réplique courte du modèle, vérifiée, sinon phrase écrite) ; analyse affichée dessous automatiquement. Pas noté, question gardée ouverte (2 fois max par question) : silence/« אממ » (encourage + repose), « לא הבנתי »/« מה? »/« je comprends pas » (repose + traduction affichée), français (demande l'hébreu + exemple affiché), « ואתה? » (Shuli répond sur lui, puis « ועכשיו את: » + question), hors sujet (pertinence < 0,25 : réagit puis « אבל שאלתי: » + question). Le modèle ne reformule jamais la question (Gemma en changeait le sens).
  - **Scènes moins rigides** (`lib/dialogue.ts`) : sans mission reconnue, si Shuli venait de poser une question et que l'apprenant y répond (juge de pertinence ≥ 0,5 ; 16/19 justes, aucun faux « oui »), la mission en cours est validée et mémorisée sur le message (`Message.missions`, `sceneProgress(…, credited)`). Aéroport complet avec « לברצלונה », « יש לי שתיים », « לא משנה לי ». Ajout « לא משנה / לא אכפת / מה שיש » à la mission place.
- Ensuite : Whisper hébreu d'**ivrit-ai** (`ivrit-ai/whisper-large-v3-turbo-ggml`) avec whisper.cpp, pour mieux comprendre l'hébreu parlé.

### 2. Entraînement LoRA de DictaLM : essayé, pas intégré
- `~/learnbyspeaking-models/lora/` : `data_he.py` + `data_he2.py` (164 dialogues écrits à la main, m/f), `gen.py`, `evalh.py`, adaptateurs `adapters` (500 it.), `a250`, `a80`, `b150` (meilleur). venv : `~/.venvs/lora` (mlx-lm, torch).
- Résultat : réponses plus courtes, genre toujours juste, mais moins pertinentes que DictaLM d'origine → rien intégré. Il faudrait des milliers de dialogues (génération par Claude via l'API, ou par lots).
- Corpus regardés, aucun prêt pour un tuteur : Kol Zchut, HeQ, hebrew_speech_campus (cours magistraux), ivrit-ai (parole, utile pour Whisper), HUJI Corpus of Spoken Hebrew (30 appels, PDF, usage académique), HebDB (2 500 h transcrites automatiquement, CC BY 4.0).

### 3. Dictionnaire papier (fait)
- Extraction : `scripts/extract_dictionary2.py` (appariement hébreu/français par position) puis `scripts/clean_dictionary2.py` → `~/Documents/dictionnaire-extrait/dico2_fiable.jsonl` (47 222 entrées, ~85 % justes).
- Dans l'app : seulement les mots confirmés par le Wiktionnaire (`scripts/merge_dictionary.py`) : 270 mots, 315 sens ajoutés à `public/dict-fr-he.json`.

### Ménage possible
- `~/learnbyspeaking-models/src-instruct` (3,2 Go) et `lora/` si la piste LoRA est abandonnée ; `llamacpp/src*` et le `.tar.gz` après intégration.

## Réécriture native de l'app Mac (commencée le 02/11, demande : « maximum natif », aucune vue web)

L'app Mac est désormais l'app SwiftUI native : `mac/build/LearnBySpeaking.app` (`bash mac/build.sh`, identifiant `app.parle.mac`). L'ancienne coque web reste dans `mac/build-web.sh` (sortie `LearnBySpeaking Web.app`, mêmes ports 47900/47901 : ne pas lancer les deux). Le site et l'iPhone restent en web.
- Contenus et consignes partagés : `scripts/export-native.ts` → `mac/native/Resources/content.json` (scènes, missions sérialisées via `spec`, cours, test, sujets, règles regex, consignes Gemma à trous `{{Q}}`/`{{A}}`/`{{LEVEL}}`…). Toujours modifier le TS, puis relancer le build natif.
- Serveurs partagés : `mac/Models.swift` (extrait de `main.swift`).
- Données : `~/Library/Application Support/LearnBySpeaking/data/lbs.*.json`, reprises une fois du localStorage WebKit de l'app web (`Store.swift`).
- Menu « Dev » natif : `mac/native/Dev.local.swift` (ignoré par git, sinon `DevStub.swift`).

Étapes (interface recopiée écran par écran depuis les composants TSX, même mise en page « lg », police Nunito embarquée en graisses fixes) :
1. ~~Socle~~ : contenus, données, client Gemma (`LLM.swift`), micro natif + whisper-server (`Ear.swift`), Shuli dessiné en natif (`Avatar.swift`), kit d'interface (`UI.swift` : Btn, Chip, Header, BackButton, ombres).
2. ~~Conversation~~ (`Brain.swift`, `ConversationView.swift`) : bulles, traduction, avis, missions et « À toi », répétition notée, Répéter / Stop / Mains libres, bilan.
3. ~~Premier lancement~~ (`OnboardingViews.swift`, `PlacementView.swift`, `Placement.swift`, `SpeechMetrics.swift`) : téléchargement des modèles et de la voix, test adaptatif mené comme une discussion, analyse de la voix en direct, rapport, objectifs.
4. ~~Cours~~ (`CoursViews.swift`, `PracticeView.swift`) : niveaux, frise des jours, écran du jour, ressources, entraînement à la parole.
5. ~~Bilan, Moi, outils~~ (`ReportViews.swift`, `MoiViews.swift`, `ParlerViews.swift`, `ToolChatView.swift`) : radar, semaine, historique, vocabulaire à révision espacée, réglages (modèles, sauvegarde au format du site, taille du texte, diagnostic, profil), hub, situations, Comment dire / Traduction / Dictionnaire (Wiktionnaire + Gemma vérifié).
6. Voix Piper native (fait, testée : 0,18 s de calcul pour 4 s d audio) : `Phonikud.swift` (portage de lib/phonikud : 2 466/2 466 phonèmes identiques au TS, nombres identiques), `Voice.swift` (onnxruntime via `mac/native/ort/ort_shim.c`, `brew install onnxruntime`, bibliothèques copiées dans Contents/Frameworks par `build.sh`). Voix « michael » de Phonikud TTS (au lieu de la voix par défaut) avec noise 0,3 / noise_w 0,6 : mesuré avec Whisper sur 90 phrases, 96-97 % des mots retrouvés contre 92 % avant (shaul 92 %). Plus de voix système en hébreu : les modèles de la voix sont requis, la voix attend le chargement de Piper. Traducteurs opus-mt natifs faits (`Translator.swift` : tokenizer Unigram, encodeur/décodeur ONNX sans cache KV, faisceau de 2 ; modèles dans models/mt/, téléchargés avec les autres ; Gemma en secours). L'app web est remplacée (fait). Banc d'essai du 03/11 (10 scénarios × 4 types d'apprenant, test de niveau simulé, outils, bilans, cours) : prix ajoutés aux scènes + règle « répondre à une question de prix » durcie, « je ne sais pas » noté 10 au test (ne relance plus la question), pronom « אתה » corrigé pour une apprenante, traducteur masculinisé pour un apprenant. Limite connue : le dictionnaire (Wiktionnaire) donne de mauvais verbes (manger → אֻכַּל, dormir → ישן). Reste : à tester à la main, conversation libre sur le web/iPhone.
- Menu Dev natif (`mac/native/Dev.local.swift`) : test de niveau (intro, m, f), objectifs A1-B2, premier lancement, terminer.

## À reprendre, dans l'ordre (historique)

1. ~~Envoyer les 2 modèles sur Hugging Face~~ : fait le 30/10 (`sivelsguy/DictaLM-3.0-1.7B-Instruct-q4f16_1-MLC`, `sivelsguy/opus-mt-tc-big-he-en-onnx`, tous les fichiers présents).
2. ~~Tester l'app avec les modèles hébergés~~ : fait le 30/10 (Chrome, WebGPU Metal). Préparation ~95 s (1,7 Go), 1re réplique de Noa ~4 s, transcription Whisper exacte en ~3 s, réponse ~5 s, traduction opus-mt correcte. 1re utilisation plus lente (~110 s) : téléchargement du traducteur (465 Mo). `.env.local` renommé en `.env.local.off` pour ce test.
3. ~~Pousser sur GitHub Pages~~ : fait le 31/10 (`93d5b8b`). Ne pousser qu'après accord (« push »).
4. ~~Ménage Ollama~~ : fait (DictaLM GGUF de test supprimé ; `qwen3*` et `translategemma` gardés).
5. Supprimer le jeton Hugging Face (huggingface.co/settings/tokens) : plus d'envoi prévu après celui des traducteurs (31/10).

6. ~~Refaire l'interface d'après les captures~~ : fait, vérifié par captures 390 px (clair + sombre). Palette `--soft`/`--pink`/`shadow-card`, `BackButton`, accueil, hub, test (intro à anneaux ondulés, ligne de progression à points, heure des messages, bulle « moi »), rapport de niveau (onglets Rapport / Mes réponses, conseils par question avec Conseil + Exemple, filtre « À revoir », partage), bilan de session avec radar, cours (frise alternée), jour, entraînement (carte portrait + sous-titre, carte « Répète » avec boutons ronds). Pas repris : vidéo réelle de tutrice, mode « Améliorateur d'accent ».

7. ~~Voix naturelle (Piper)~~ : en ligne depuis le 30/10. Phonikud (vocalisation, ONNX int8, MIT, 308 Mo) + voix Piper « défaut » de Phonikud TTS (64 Mo, CC BY-NC), sur le CPU (onnxruntime-web) dans `lib/voice.worker.ts`. Règles portées en TypeScript dans `lib/phonikud/` : phonèmes identiques au Python sur 380/381 phrases de l'app, vocalisation 58/60, nombres 5994/5994 identiques à num2words. ~430 ms par phrase sur Mac. Réglage « Voix de Shuli » (naturelle / système) dans la préparation ; la voix du système reste en secours. Voix masculine : le personnage est devenu Shuli (tuteur), avatar redessiné.

8. ~~Fiabilité en production~~ (30/10) : le service worker effaçait les caches des modèles (corrigé) ; production compilée avec webpack (Turbopack cassait le worker Whisper) ; chaque worker signale `alive`. Mémoire réduite : Whisper q4f16, chargement séquentiel, traducteur déchargé après 45 s, iPhone sans Whisper par défaut. Batterie de 25 parcours de bout en bout dans Chrome : tout passe. Safari non automatisable ici, iPhone non testé.
9. ~~Hub~~ : « Professeur d'hébreu » → « Comment dire… ? » (phrases du cours au bon genre, sinon traduction avec exemples au genre de l'apprenant) ; « Professeur de grammaire » → leçons écrites à la main (Cours › Ressources › Grammaire). DictaLM n'est pas fiable pour expliquer.

10. **IA testée et corrigée partout (31/10)**, sur DictaLM 4 bits (MLX, groupes de 32 comme WebLLM, mais quantification pas identique) avec les vraies consignes de l'app (bancs d'essai : scratchpad de la session, `jiti`) :
    - **Test de niveau noté par l'IA** (`lib/placement.ts`) : pertinence (probabilité du « oui », échelle log), grammaire (30 % probabilité + 70 % mots gardés par la correction de l'IA), développement et vocabulaire par règles. Sur 90 réponses étiquetées : justes ≥ 75 dans 87-97 % des cas, fautives < 75 dans 88-92 %, hors sujet ≤ 25 dans 100 %. Correction proposée affichée si elle change peu de mots. Plus de « Tu as répondu en hébreu avec N mots ».
    - **Conversation** : consignes au genre de l'apprenant, rôle des scénarios en hébreu, 4 exemples d'échange, jusqu'à 3 essais avec choix de la réplique la moins fautive (`replyFlaws`). Sur 108 répliques : trop longues 12 → 0, sans question 64 → 20, genre faux 4 → 0. Suggestions : > 8 mots 142/216 → 0.
    - **Traducteurs dédiés vers l'hébreu** : `opus-mt-fr-he`, `en-he`, `es-he` convertis en ONNX 8 bits (≈ 145 Mo chacun, `~/learnbyspeaking-models/convert_mt_to_he.py`), 30/30 phrases justes contre ~20/30 pour DictaLM (qui répondait aux questions). Passage au féminin par DictaLM sous garde-fou (`lib/sayInHebrew.ts`) : 11/11 justes, 0 dérapage. Utilisés par « Comment dire », Traduction, Aide, dictionnaire. Traduction phrase par phrase dans le worker (par lots, les phrases finissaient en « ..?? »).
    - **Dictionnaire** : `public/dict-fr-he.json` (Wiktionnaire, CC BY-SA, 4 615 mots français, 4 564 hébreux, ≈ 200 Ko compressé ; `~/learnbyspeaking-models/dict/extract_dict.py`) : nikud, prononciation, genre, pluriel ; verbes à l'infinitif. « Définir un mot » : dictionnaire → traducteur → DictaLM vérifié ; exemple gardé seulement si sa traduction contient le mot. « hopital » sans accent trouvé.
    - **Micro** : gardé ouvert 30 s entre deux réponses (sauf iOS), « Ouverture du micro… » tant qu'il n'est pas prêt, sans réduction de bruit (rognait le début des phrases).
    - ~~Envoyer les 3 traducteurs sur Hugging Face~~ : fait le 31/10 (`sivelsguy/opus-mt-{fr,en,es}-he-onnx`, Apache-2.0, vérifiés en les téléchargeant depuis Hugging Face). Sources dans `~/learnbyspeaking-models/`.

11. **Deuxième passe (31/10, soir)** :
    - Conversation : question de relance ajoutée quand Shuli n'en pose pas (`followUpMessages`, sans dépasser 16 mots) → sans question 20/108 → 1/108 ; suggestions mises au féminin pour une apprenante (table des 40 formes courantes + DictaLM sous garde-fou, aussi après שאני/ואני/כשאני).
    - **Bilan de conversation noté par l'IA** (`scoreSessionAI`, `lib/judge.ts` partagé avec le test) : pertinence (sans pénaliser une question en retour ni une réplique de Shuli sans question), grammaire, participation, vocabulaire ; « Phrases à revoir » avec les corrections de l'IA. Plus de « N réponses avec X mots ».
    - Corrections de style (טוב → נהדר) ignorées si l'IA juge la phrase correcte (`rewordedOnly`).
    - Test de niveau : attend le modèle s'il finit de se charger (sinon il notait par règles juste après l'ouverture de l'app).
    - Traduction : guillemet orphelin retiré.
    - **Cours** : faute corrigée (נאכול → נאכל), transcription « li-sde ha-te'ufa » ; **niveau B1 écrit** (unités 6 « Raconter et donner son avis » et 7 « La vie pratique », 8 jours) ; un apprenant B2 commence au B1 (`courseLevelFor`) au lieu du A1.

12. ~~Niveau B2 du cours~~ (31/10) : unités 8 « Hypothèses et nuances » (conditionnel, nuancer, regrets et souhaits, raconter) et 9 « Travail et société » (entretien, réunion, actualité, réclamation), 8 jours. Parcours complet A1 → B2 : 36 jours, tous déroulés dans Chrome sans erreur.

13. ~~Début de phrase coupé au micro~~ (31/10) : reproduit avec un faux micro qui met 400-800 ms à s'ouvrir (l'élève parle dès le toucher) : l'ancienne version perdait « שלום » 6 fois sur 6. Correction : micro ouvert dès l'arrivée sur un écran où l'on parle (conversation, test, entraînement), gardé ouvert jusqu'à la sortie de l'écran ou 5 min sans enregistrement, et un toucher pendant l'ouverture attend ce micro au lieu d'en ouvrir un second (`warmMic`, `openMic` dans `lib/whisper.ts`). Phrase complète 6 fois sur 6. Pas sur iOS (voix de Shuli trop faible micro ouvert).

14. Conversation sans aide à la réponse (31/10) : plus de réponses suggérées sous les répliques de Shuli, plus de bouton « Aide » (c'est à l'apprenant de répondre). Restent « Répéter » et « Traduire ».

15. Premier lancement refait (01/11) : 1) téléchargement obligatoire de tous les modèles (cerveau, Whisper, voix, traducteurs préchargés puis déchargés), 2) test de niveau (genre demandé sur l'intro), 3) `GoalSetup` : objectif, points à améliorer (`FOCUS`), prénom, temps par jour. Étape stockée dans `profile.onboarding`. Option « Garder l'écran allumé » (`lib/wakeLock.ts`, Screen Wake Lock) pendant tout téléchargement. Pas encore vérifié de bout en bout (téléchargement lancé dans Chrome, pas fini) ni sur téléphone.

16. App macOS native (01/11) : `mac/` (AppKit + WebKit, sans Electron, compilée avec `swiftc` : pas de Xcode). `mac/build.sh` construit `mac/build/LearnBySpeaking.app` (62 Mo, signée ad hoc) : le site exporté (`out/`) est servi sur `127.0.0.1:47831` (origine fixe = stockage et modèles conservés), WebGPU/micro/Cache API vérifiés dans la WKWebView (`PARLE_SELFTEST=<fichier>`). Icône de la barre d'état avec menu ; menu **Debug** (fausse progression, niveau, étapes du premier lancement, effacements, copie du stockage) dans `mac/Debug.local.swift`, ignoré par git (sinon `DebugStub.swift`). 30 propositions d'icônes : `mac/icons/` (planche.png) ; l'icône actuelle est celle de la PWA.

Plus tard : test sur un vrai téléphone (iPhone), confirmation du micro avec une vraie voix.

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

- Onglets Parler / Cours / Bilan / Moi, avatar animé de Shuli (tuteur).
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

## Interface à reproduire (captures TalkFace du 29/10)

Captures sauvées dans `design-refs/` (ignoré par git : interface et photos tierces, à ne pas publier). Numéros = sections ci-dessous.

Style général : fond gris très clair, cartes blanches arrondies (rayon ~16 px) sans bordure, ombre légère ; couleur principale violet-indigo (~#4f46e5) ; gros boutons pilule pleine largeur en bas d'écran ; avatars ronds (photos chez eux → illustration maison chez nous) ; typographie sans-serif, titres gras.

1. **Navigation** : barre d'onglets en pilule centrée en haut : « Parler · Cours · Bilan · Mon(Moi) », onglet actif sur fond gris clair, texte violet. Icône grille à droite (Cours).
2. **Accueil « Parler »** : à gauche un bouton rond éclair ; à droite des pastilles (calendrier + nombre de jours, courbe + score cible, « ? »). « Salut ! Je suis Sora ! » (chez nous Noa). Grande carte violette : titre « Parlez couramment en 30 jours », barre de progression avec coche, sous-titre, petit bouton contour « Vue du cours › », gros bouton blanc « Démarrer » ; personnage qui dépasse en haut à droite de la carte. Section « Préparation … » : liste de cartes blanches avec avatar rond à gauche, titre gras, sous-titre gris. Section « Assistant gratuit » : 2 cartes côte à côte (titre, sous-titre, illustration en bas à droite). Barre fixe en bas : champ arrondi à bord violet avec avatar à gauche, texte « Je suis votre assistante en français, Sora », bouton micro rond violet à droite.
3. **Hub de l'assistante** (en touchant la barre du bas) : flèche retour ronde en haut à gauche, grande photo ronde centrée, nom en gros, « Salut ! {prénom} ! », « Que puis-je faire pour vous ? », grille 2 colonnes de cartes violet très pâle (titre gras + sous-titre gris) : Conversation libre, Discussion libre, Sujets quotidiens, Améliorateur d'accent, Professeur de grammaire, Professeur de langue, Traduction intelligente, Définir le mot. Bouton dégradé violet pleine largeur en bas « Parlez directement ». Quand on lance une conversation, l'IA propose directement un sujet.
4. **Test de niveau — intro** : plein écran dégradé violet, titre blanc « Connaissez votre niveau en 3 minutes », grand logo au centre entouré d'anneaux ondulés animés (lignes fines rose/violet), texte cyan en bas, bouton blanc pleine largeur « Démarrer ». (Ne pas reprendre leur « précision 98,6 % » invérifiable.)
5. **Test de niveau — questions** : titre centré, barre de progression fine avec points aux extrémités, en-tête de message « avatar + nom + heure », carte blanche avec la question floutée tant qu'on ne l'a pas écoutée/révélée, actions « 🔊 Traduire Exemple » sous le texte. Barre du bas violet pâle « ||| Appuyez pour enregistrer ». Réponse de l'utilisateur : bulle violette à droite avec « me » + avatar, actions « Correction grammaticale · Langue · Déployer · Prononciation › ». Retour de l'IA : « Good job! », puces, « Improvement suggestions », exemple amélioré. Pendant le traitement : bouton bas « Annuler » avec spinner.
6. **Rapport** : titre « Rapport de compétence en expression orale », onglets « Rapport / Enregistrer », gros score centré, radar en losange à 4 axes avec valeurs, puis « Conseils d'amélioration (n) » avec onglets (Part1, Grammaire, Lexical) et pour chaque question : question + points en orange, « Your Answer », « Tips », « Example ». Bouton bas plein violet « Définir des objectifs & Progresser ». Icône partager en haut à droite.
7. **Cours — liste** : cartes larges centrées (avatar rond, « Niveau 1 Débutant », « A2 · … », chevron dans un rond violet pâle à droite).
8. **Cours — niveau déplié** : carte du niveau + « Démarrage rapide », carte d'unité violet pâle (icône livre, « Unité 1 · … », barre de progression, pastille « 0/16 »), puis frise verticale centrale : cartes « Jour n / titre / À apprendre ▶ » alternées gauche/droite, rond gris avec icône livre sur la ligne centrale.
9. **Jour** : retour en haut à gauche, photo ronde centrée, « Unit 1 · Day 1 », titre en gros, phrase clé dessous, « 2 activités » : carte blanche avec « ▶ Entraînement à la parole · 4 min » (rond violet) et « Jeu de scénario · 5 minutes » (rond rose), coche grise à droite de chaque.
10. **Entraînement à la parole** : titre « … __ ? ⌄ » centré, barre de progression segmentée (4 segments), vidéo de la tutrice qui parle avec sous-titre mot à mot en pastille sombre, « TOUCHEZ POUR CONTINUER · Poursuivre en 2… ». Puis carte blanche centrée : étiquette violette « Parler maintenant… », phrase cible en gris en gros, traduction dessous, boutons ronds « recommencer » et « pause ».

## État de l'app (novembre 2026)

- **Identité** : mascotte Shuli (renard, 7 expressions via `Avatar mood`), palette forêt et miel, police Nunito, boutons en relief, thème clair uniquement. Charte et maquette dans `mac/brand/`.
- **Test de niveau adaptatif** (`lib/adaptive.ts`) : 14 questions A1-B2, estimation bayésienne de la compétence, 4 à 8 questions, arrêt quand le niveau est fiable à 85 %. Analyse de la voix (`lib/speechMetrics.ts`) : pauses, hésitations, débit, temps de réaction, note de fluidité.
- **Révision espacée** (`lib/srs.ts`) : 4 notes (à revoir, difficile, bien, facile), mode oral « dire le mot », carte « Révision du jour » à l'accueil.
- **Série avec gel** et bilan de la semaine (`lib/streak.ts`).
- **Sauvegarde** (`lib/backup.ts`) : copie miroir dans IndexedDB restaurée toute seule si localStorage est vidé, export et import JSON (panneau d'enregistrement natif dans l'app Mac). Diagnostic, taille du texte, raccourcis clavier (⌘1 à ⌘4, Échap, espace).
- **IA absente** : fonctions grisées ; modèles sur l'appareil en cours de chargement : bandeau « Shuli se réveille ». Reprise automatique des téléchargements (3 essais, et au retour du réseau).
- **App Mac native** (`mac/`, AppKit + WebKit) : `mac/build.sh`, mode debug local `mac/Debug.local.swift` (ignoré par git).
