# Recette humaine d'accessibilité — protocole (#2436.17, #2436.18)

## Pourquoi ce document existe

Deux points du lot #2436 (`.claude/notes/registre-2026-09-20-chat-lot4.md`, zone
« accessibilité écran ») ne se livrent PAS en code : **#2436.17** (tests humains
clavier/VoiceOver/NVDA/TalkBack/zoom/daltonisme) et **#2436.18** (golden
journeys parcourus à la souris, au clavier, en mobile, au lecteur d'écran). Ils
demandent une personne devant un vrai lecteur d'écran — aucun test automatisé
ne peut les remplacer, et ce dépôt refuse d'inventer une preuve ÉCRAN qu'un
grep ou un test jsdom ne peut pas fournir (mémoire : « preuve ÉCRAN ne se
remplace pas par un grep »).

Ce protocole est ce qu'un humain (le recetteur) suit pour produire cette
preuve. Il reste `retenu` au registre jusqu'à ce qu'une session réelle soit
consignée ci-dessous.

## Ce qui est DÉJÀ couvert par le code — à ne pas re-vérifier à la main

Avant de recetter, vérifier que ces gardes automatiques sont vertes
(`pnpm --filter @bellum/web exec vitest run src/architecture src/styles`) :

- **GA-374** — label et erreur reliés programmatiquement au champ
  (`aria-describedby`, `role="alert"`) sur tous les formulaires partagés.
- **GA-375** — aucun bouton ne se révèle SEULEMENT au survol (#2436.19).
- **GA-376** — l'analyse longue (3-6 min) annonce sa PHASE au lecteur d'écran,
  jamais le pourcentage à chaque tick (#2436.6).
- **GA-377** — audit `axe-core` sur les champs partagés (#2436.16).
- **`contrast.test.ts`** — contraste AA rejoué depuis les jetons CSS pour le
  texte (primaire/secondaire/muted/accent) et les pastilles (badges), clair et
  sombre (#2436.9).
- **GA-32 / GA-35 / GA-27** — nom accessible, cible ≥ 44 px, `<Navigate>`
  interdit. **GA-33** — pas de couleur en dur, parité clair/sombre. **GA-67** —
  une couleur ne porte jamais seule une information (#2436.8).

Le protocole ci-dessous porte donc sur ce que SEUL un humain peut juger : le
rendu réel d'un lecteur d'écran, le geste au clavier bout en bout, le zoom, la
perception des couleurs.

## Champ de la recette

**Parcours** : les routes de premier niveau (voir
`apps/web/src/architecture/chaque-route-de-premier-niveau-survit-au-chargement-direct.test.tsx`
pour la liste courante) et les golden journeys déjà enregistrés au registre
produit — `/chat` (le fil et ses panneaux), `/accounts/:id` (dossier + analyse
en cours), l'authentification (connexion, inscription, mot de passe oublié),
et les golden journeys nommés dans `registre-2026-09-16-dashboard.md` (#2208),
`registre-2026-09-20-chat-lot7.md` (#2386) et `registre-2026-09-20-chat-lot5.md`
(#2339.12).

## Protocole par axe

### 1. Clavier seul (#2436.3, #2436.4)

Débrancher la souris. Pour chaque parcours du champ de recette :

1. Atteindre chaque geste clé (envoyer, joindre, valider, ouvrir un panneau,
   le fermer) uniquement par `Tab` / `Maj+Tab` / `Entrée` / `Espace` / `Échap`.
2. Noter l'ORDRE de tabulation : logique (gauche→droite, haut→bas, jamais un
   saut qui contredit l'ordre visuel).
3. À chaque étape, le focus doit être VISIBLE (contour net, jamais seulement
   une teinte de fond).
4. Ouvrir un panneau flottant (ex. bulle Laura, panneau de conversation),
   le fermer avec `Échap` ou son bouton : le focus doit revenir sur l'élément
   qui l'a ouvert — pas sur `<body>`, pas perdu.

### 2. VoiceOver (macOS/iOS)

`Cmd+F5` pour l'activer. Naviguer au rotor (`VO+U`) par landmarks, titres,
puis boutons/liens.

1. Chaque région a un nom annoncé (pas seulement « région »).
2. Chaque bouton icône-seule annonce une action, jamais « bouton » nu.
3. Envoyer un message dans `/chat` : la réponse de Laura est annoncée UNE
   fois à son arrivée — jamais fragment par fragment pendant qu'elle
   s'affiche (#2436.6, déjà gardé côté code pour l'analyse ; à confirmer côté
   flux du chat).
4. Lancer une analyse de compte : la PHASE s'annonce à quelques reprises
   pendant les 3-6 minutes, jamais à chaque pourcent.
5. **#2434.83** — le micro de `/chat` (`VoiceInput.tsx`) : chaque état (repos,
   permission demandée, écoute, transcription, refus persistant, permission
   refusée) porte un nom ou un `role="status"`/`role="group"` annoncé SANS
   qu'il faille regarder l'écran — vérifier qu'aucun état ne se déduit
   SEULEMENT d'une couleur ou d'une icône muette. Le micro refusé porte une
   mention distincte et persistante (pas une seule alerte transitoire), et
   « Écouter la réponse » annonce le changement d'état sans relire tout le
   texte affiché deux fois. « J'écoute » (`role="status"` posé sur le texte
   lui-même, pas seulement sur le groupe qui le porte, 27/09/2026) s'annonce
   dès l'apparition, sans qu'il faille déjà avoir le focus dessus.
6. **#2434.8/.9/.10/.12/.24/.30** — le mode CONVERSATION de `/chat`
   (`VoiceConversation.tsx`, 27/09/2026) : démarrer la session, poser une
   question, la laisser enchaîner envoi → lecture de la réponse
   (`speechSynthesis`) → réécoute SANS toucher l'écran — chaque changement de
   phase (« J'écoute », « Envoi… », « Laura répond », l'état d'échec) doit
   s'entendre (`role="status"`/`aria-live="polite"` sur l'état), jamais
   seulement se voir. Vérifier aussi : « Interrompre » (pendant la lecture)
   coupe la voix et reprend l'écoute sans fermer la session ; « Arrêter »
   referme la session et le rend audible (le bouton redevient « Démarrer »).
   La langue transmise à la dictée (FR/Anglais/Détection automatique,
   `VoiceInput.tsx`) se choisit et s'annonce au clavier/lecteur d'écran comme
   n'importe quel autre réglage du formulaire.

### 3. NVDA (Windows)

Même trame que VoiceOver, plus spécifiquement :

1. Mode navigation vs mode focus : un champ de formulaire bascule
   automatiquement en mode focus.
2. `aria-invalid`/l'erreur sont annoncés à la soumission d'un formulaire en
   échec, même si le focus n'est plus dans le champ (GA-374 pose
   `role="alert"` pour ça — à confirmer à l'oreille).

### 4. TalkBack (Android)

Parcourir `/chat` et le dossier compte au doigt (balayage droite/gauche).

1. Chaque cible se tabule/s'atteint par balayage, aucune n'est sautée.
2. Les gestes qui dépendent d'un survol souris sur desktop (aucun ne devrait
   subsister, GA-375) ont un équivalent tactile direct.

### 5. Zoom 200 % (#2436.10)

Zoom navigateur à 200 %, fenêtre desktop standard (1440×900 avant zoom).

1. Aucun texte n'est coupé, aucun bouton ne devient inatteignable.
2. Aucune fonction ne disparaît (un panneau qui débordait devient une liste
   qui scrolle, jamais un panneau qui masque son propre bouton de fermeture).
3. Refaire à 400 % sur un parcours critique (WCAG 1.4.10, reflow) — la barre
   de défilement horizontale de PAGE ne doit jamais apparaître (seuls
   tableaux/diagrammes peuvent défiler horizontalement, dans leur propre
   conteneur).

### 6. Daltonisme

Simuler (extension navigateur type « Colorblindly », ou `chrome://
accessibility`) protanopie, deutéranopie, tritanopie sur :

1. Les badges de statut (GO/PRUDENT/NO-GO, ok/dégradé/tombé) — la FORME ou le
   TEXTE doit rester lisible sans la couleur (GA-67 le garde côté code ; ici
   on vérifie l'effet visuel réel).
2. Les graphiques (CA, progression) : au moins deux encodages (texte, motif,
   icône) en plus de la teinte.

## Modèle de compte-rendu

Copier ce bloc, une ligne par session, sous cette section — jamais réécrire
les lignes précédentes :

| date | testeur | outil + version | parcours | axe | verdict | détail / issue ouverte |
| ---- | ------- | --------------- | -------- | --- | ------- | ---------------------- |

## Journal des sessions

_Aucune session consignée à ce jour — #2436.17 et #2436.18 restent `retenu`
tant que cette section est vide._
