# Résumé — où on en est (30/10/2026, après-midi)

## À reprendre, dans l'ordre

1. ~~Envoyer les 2 modèles sur Hugging Face~~ : fait le 30/10 (`sivelsguy/DictaLM-3.0-1.7B-Instruct-q4f16_1-MLC`, `sivelsguy/opus-mt-tc-big-he-en-onnx`, tous les fichiers présents).
2. ~~Tester l'app avec les modèles hébergés~~ : fait le 30/10 (Chrome, WebGPU Metal). Préparation ~95 s (1,7 Go), 1re réplique de Noa ~4 s, transcription Whisper exacte en ~3 s, réponse ~5 s, traduction opus-mt correcte. 1re utilisation plus lente (~110 s) : téléchargement du traducteur (465 Mo). `.env.local` renommé en `.env.local.off` pour ce test.
3. **Pousser sur GitHub Pages** seulement après accord (« push »). Les commits locaux sont en avance sur `origin/main`.
4. ~~Ménage Ollama~~ : fait (DictaLM GGUF de test supprimé ; `qwen3*` et `translategemma` gardés).
5. Supprimer le jeton Hugging Face (huggingface.co/settings/tokens) une fois l'envoi fini.

6. ~~Refaire l'interface d'après les captures~~ : fait, vérifié par captures 390 px (clair + sombre). Palette `--soft`/`--pink`/`shadow-card`, `BackButton`, accueil, hub, test (intro à anneaux ondulés, ligne de progression à points, heure des messages, bulle « moi »), rapport de niveau (onglets Rapport / Mes réponses, conseils par question avec Conseil + Exemple, filtre « À revoir », partage), bilan de session avec radar, cours (frise alternée), jour, entraînement (carte portrait + sous-titre, carte « Répète » avec boutons ronds). Pas repris : vidéo réelle de tutrice, mode « Améliorateur d'accent ».

7. ~~Voix naturelle (Piper)~~ : en ligne depuis le 30/10. Phonikud (vocalisation, ONNX int8, MIT, 308 Mo) + voix Piper « défaut » de Phonikud TTS (64 Mo, CC BY-NC), sur le CPU (onnxruntime-web) dans `lib/voice.worker.ts`. Règles portées en TypeScript dans `lib/phonikud/` : phonèmes identiques au Python sur 380/381 phrases de l'app, vocalisation 58/60, nombres 5994/5994 identiques à num2words. ~430 ms par phrase sur Mac. Réglage « Voix de Noam » (naturelle / système) dans la préparation ; la voix du système reste en secours. Voix masculine : le personnage est devenu Noam (tuteur), avatar redessiné.

8. ~~Fiabilité en production~~ (30/10) : le service worker effaçait les caches des modèles (corrigé) ; production compilée avec webpack (Turbopack cassait le worker Whisper) ; chaque worker signale `alive`. Mémoire réduite : Whisper q4f16, chargement séquentiel, traducteur déchargé après 45 s, iPhone sans Whisper par défaut. Batterie de 25 parcours de bout en bout dans Chrome : tout passe. Safari non automatisable ici, iPhone non testé.
9. ~~Hub~~ : « Professeur d'hébreu » → « Comment dire… ? » (phrases du cours au bon genre, sinon traduction avec exemples au genre de l'apprenant) ; « Professeur de grammaire » → leçons écrites à la main (Cours › Ressources › Grammaire). DictaLM n'est pas fiable pour expliquer.

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

- Onglets Parler / Cours / Bilan / Moi, avatar animé de Noam (tuteur).
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
