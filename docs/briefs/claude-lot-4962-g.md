# Lot G — onboarding et arrivée (retours bêta, contrat validé par Louis le 31/10/2026)

Compris : à l'onboarding, l'audit plante ou traîne, un outil maison (CRM, ATS, ERP interne) ne peut pas être déclaré, une société neuve se voit poser des questions qui supposent un historique, et un commercial qui a déjà son compte en tête n'a pas de chemin direct ; à l'arrivée, il ne sait pas par où commencer.
Je fais :

- #4969.1 l'erreur à « générer mon audit » : trouver la cause (route de génération, journal d'erreur côté API/IA, timeout) et la corriger ; un échec dit une erreur claire, jamais un faux succès. Lenteurs : mesurer et dire où passe le temps dans le rapport (pas d'optimisation spéculative).
- #4971 l'étape outillage accepte « outil interne / autre » avec un NOM libre (CRM, ATS, ERP) ; la valeur est stockée sans inventer de connecteur.
- #4972 une réponse explicite « je démarre / société neuve » ; les questions qui supposent un historique se masquent ou proposent « pas encore ». JAMAIS déduit de l'âge de la société.
- #5027 compte déjà ciblé + profil demandé : un chemin direct (taper le nom du compte et l'analyser) au même niveau que « je n'ai aucun compte en tête » (`welcome.json:~148`). Lire #4432 avant.
- #4962.1 et #4962.3 l'arrivée nomme trois entrées : analyser un compte, trouver des comptes, parler à Laura.
  Je ne fais PAS : #4962.2 (rattaché à #4868, montée du routeur) ; #4962.4 (attente de Kevin) ; refondre l'onboarding ; créer un connecteur.

## Droits

Aucun : pas de menu, route ni permission nouvelle.
Je défais : rien ; garde #4529 (arrivée neutre), #4432.
Je mesure : temps de génération de l'audit (étapes) dans le rapport.
Périmètre : apps/web/src/_, packages/i18n/_, apps/api/src/modules/onboarding/_, apps/api/src/modules/profiles/_, apps/api/src/modules/demo/_, apps/ia/app/_, apps/ia/tests/_, docs/briefs/_

## Règles communes (lot d'écrivain cloud — lire en entier, une fois)

- Dépôt `Bellum-AI/belllum-monorepo`. Tu travailles sur la branche `claude/lot-4962-g` (déjà créée, elle porte ce brief). `git fetch origin && git checkout claude/lot-4962-g`. Tu ne pousses QUE sur `claude/lot-4962-g`. Jamais main, jamais de PR (le fil principal intègre), jamais de force-push.
- **Plafond : 300 tours.** À 240 : commit + push de ce qui est vert, rapport, STOP.
- Lis d'abord `CLAUDE.md` du dépôt (doctrine, craft rules, design rules) et `agent_docs/chantiers-livres.md` pour ton sujet. Chaque point a un diagnostic ci-dessous (cause fichier:ligne lue sur main le 31/10) : **revérifie-le avant de coder** (le code a pu bouger), et si un point est déjà là sur main, note-le `déjà là <fichier:ligne de l'appelant>` dans le rapport au lieu de le recoder.
- **TDD** : test qui échoue d'abord, puis le code. Le test doit savoir dire NON.
- **Tests CIBLÉS seulement** : ≤ 5 fichiers de spec liés + `pnpm --filter <paquet> exec tsc -p . --noEmit` du paquet touché (ou `pytest <fichier>` pour apps/ia). JAMAIS la suite complète, jamais `check-types` racine, jamais de build : c'est la CI.
- **Compagnons d'un changement visible** : toutes les langues i18n (fr + en au minimum, les mêmes clés partout), le semis de démo si l'écran affiche une donnée neuve (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`), l'APPELANT (le composant monté dans une route), gardes d'architecture `apps/web/src/architecture/` (aucune couleur hex dans le JSX, plancher 12 px, cibles ≥ 44 px, « non mesuré » ≠ 0).
- **Trace** : commentaire `// #<issue>.<point> — <raison>` à l'endroit du comportement.
- **Commits** groupés par écran, numéros dans le sujet : `fix(web): … (#4968, #4970)`. **Push après chaque point vert** (`git push origin claude/lot-4962-g`), jamais tout à la fin.
- Hooks git : si un hook pre-commit/pre-push lance une suite longue, `GARDE_PORTE_PUSH=0 git push …` est permis ; ne jamais `--no-verify` un test qui échoue réellement.
- Interdits : `git stash`, `reset --hard`, `checkout -- .`, `skip`/`.only` de test, migration qui supprime/renomme (ajout seulement), donnée fictive en dehors du semis de démo, nommer un fournisseur à l'écran, afficher une probabilité.
- Hors périmètre (ligne `Périmètre :`) = ne pas toucher ; si c'est indispensable, l'écrire en QUESTION dans le rapport.
- **Rapport** : écris `docs/briefs/claude-lot-4962-g-rapport.md` (≤ 15 lignes : par point `livré <sha> <fichier:ligne>` / `déjà là <preuve>` / `bloqué <raison>` ; tests lancés et leur résultat ; questions), commit + push. Puis STOP.

## Diagnostic par issue (vérificateur, lu sur main le 31/10 — à revérifier)

## #4962 Navigation globale

écran : /briefing (arrivée) + barre latérale · points : 4 · taille : M
| 4962.1 | trois entrées visibles à l'arrivée | retenu | cartes d'accueil Laura existent (laura-home-grid.tsx:274 ; chat.json:38-48 « Trouver des comptes compatibles », « Analyser une entreprise ») mais sur /chat, pas sur l'écran d'arrivée /briefing (sections.ts:248 `today`) | arrivée : 3 entrées nommées analyser/trouver/parler à Laura | nouveau compte, après connexion : 3 entrées visibles sans scroll | non (même menu) | non | — |
| 4962.2 | liens de Laura mènent à l'écran et l'onglet voulus | retenu | cause = #4868 OUVERTE : router 1.170.46 (apps/web/package.json:39) perd la requête dans `to`, 52 liens atterrissent sur /dashboard | rejeu des 5 liens : bon écran + bon onglet | cliquer un lien de Laura en prod → écran annoncé | non | non | — |
| 4962.3 | analyse → comptes → chat sans repasser par l'accueil | retenu (non prouvé « déjà là ») | barre latérale persistante NAV_SECTIONS sections.ts:248 ; parcours non rejoué | idem | enchaîner 3 écrans en ≤3 clics | non | non | — |
| 4962.4 | « UX à refaire » (Kevin) | à trancher | aucun écran nommé | rien tant que non précisé | — | non | non | Q: quels écrans ? Reco: demander à Kevin, sortir du lot |
antériorité : #4491 (close 24/10, barres V22, hors périmètre), #4868 ouverte, #2623 close ; refonte arborescence exclue.

## #4969 Audit, erreur et lenteurs

écran : /onboarding/$id/generating · points : 2 · taille : M
| 4969.1 | génération sans erreur | retenu | cause inconnue, journaux 29/10 13:48-14:58 absents ; page OnboardingGeneratingPage.tsx:38 | pas d'erreur | refaire l'onboarding | non | non | — |
| 4969.2 | attente explicite (phase) | déjà là | six phases + erreur nommée + relance ciblée : OnboardingGeneratingPage.tsx:92-124 ; monté par routes/onboarding/$id/generating.tsx:17 | — | vérifier que « ça mouline » vient de la phase non mise à jour | non | non | — |
antériorité : #4425 close, #2089.29-.35 (en commentaire).

## #4971 Outils internes à l'onboarding

écran : /onboarding (étape outillage) · points : 2 · taille : M
| 4971.1 | nom libre CRM/ATS/ERP | retenu | outillage.ts:36-47 échelle de présence sans saisie ; contracts answers-outillage.ts:46 ; saisie libre existe ailleurs : outils-invitation.ts:25 `allowOther: true` (tools_access) | champ « autre/interne » + nom | déclarer « CRM maison » | non | oui léger (nouvelle clé de réponse) | — |
| 4971.2 | jamais affiché comme connecté | retenu | resolveToolingChoices (tooling-resolve-choices) ne confirme que les connexions réelles | idem | écran sans pastille connecté | non | non | — |
antériorité : #4360 hors périmètre ; #2054.19.

## #4972 Questions pour société neuve

écran : /onboarding (rôle) · points : 2 · taille : S
| 4972.1 | masquer ou « je démarre » | retenu | role.ts:84-94 `portfolio_size` ; choix profile-questionnaire.ts:310 ['0','1-5',…] sans « je démarre » ni « je ne sais pas » | réponse « je démarre » | espace neuf : réponse proposée | non | oui (nouvelle valeur d'enum) | Q: déclencheur « société neuve » ? Reco: choix explicite, pas déduit |
| 4972.2 | « je démarre » ≠ réponse manquante | retenu | types.ts:114 `optional` existe | idem | pas de blocage | non | non | — |
antériorité : #4366.

## #5027 (diagnostic condensé)

- #5027 (M, partiel) : welcome.json:148 ne propose que « je n'ai aucun compte en tête ». #4432 non lu.
