# Brief — #5043 : Idées de demandes, liste + aperçu (Laura V8)

Branche : `claude/laura-idees-v8-5043` (ce fichier est déjà dessus). Dépôt : Bellum-AI/belllum-monorepo, base `origin/main`.
Agent : écrivain. **Plafond : 300 tours.** À 240 : commit et push de ce qui est vert, rapport, stop.
Issue : #5043 (la lire en entier : `gh issue view 5043`, et ses commentaires). Épopée : #5033 (section « Arbitrages »).

Maquette (paquet hors dépôt, extraits versionnés pour toi) : `docs/briefs/laura-v8-maquette/`

- `catalogue-app-js-430-584.txt` : code de la modale « Idées de demandes » (`showRequestCatalog`), lignes 430-584 de `app.js`. Les numéros `app.js:N` cités dans l'issue renvoient à ces lignes.
- `catalogue-styles.txt` : règles CSS de la maquette pour le catalogue (à traduire en Tailwind et en tokens `--bellum-*` ; aucun hexadécimal dans le JSX, D79).
- `v8-catalogue-contract.txt`, `v8-decisions.txt` : le contrat V8 du catalogue.

## Contrat (Louis 31/10 : « forme de la maquette, fonction gardée »)

**Compris** : choisir une demande sans parcourir une grille de cartes chargées dans une modale étroite.

**Je fais** :

- Le tiroir `CommandDrawerButton` (titre actuel « Que puis-je demander ? ») devient la vue **liste à gauche + aperçu à droite** de la maquette, une seule demande sélectionnée (`aria-pressed` + `aria-controls`). Titre : « Idées de demandes ».
- Puces de moment avec compteur (Tout + les 9 moments existants, même ordre) ; compteur « N demandes sur 31 » en `role="status"` ; recherche plein texte actuelle (libellé + demande + résultat), champ à contour unique.
- Aperçu : la demande complète en citation, « Ce que tu obtiens », « À partir de » (données), **l'état RÉEL de disponibilité** (prête / dégradée / indisponible, « Il manque : … »), pied fixe « Préparer cette demande » + « Tu pourras la modifier avant l'envoi ».
- « Préparer » insère dans la saisie **sans envoyer** (inchangé). Si la saisie contenait déjà du texte : un toast « Annuler » rend le texte précédent (`offerUndo` de la maquette).
- Mobile ≤ 768 px (borne GA-28, PAS les 680 px de la maquette — commentaire de Louis sur #5043) : deux vues (liste, puis aperçu avec « Retour aux demandes ») ; filtre, recherche, sélection et défilement conservés au retour.
- Les trois entrées existantes (accueil « Tous les exemples », « Voir tout » du composeur, entrée du « + ») ouvrent cette même vue (GA-26).

**Je ne fais PAS** : aucun changement du catalogue serveur ni du contrat `command-library` (31 demandes identiques à la maquette) ; pas de champ `snippet` neuf (« À préciser » : on garde le texte actuel tronqué dans la liste) ; pas de note de périmètre dans l'aperçu ; la rangée d'amorces « Voir tout » du composeur reste telle quelle (#5048) ; `LauraCataloguePanel` (interventions proactives, Réglages) n'est pas concerné ; rien d'autre dans `Chat.tsx` que le branchement de l'annulation (#5032 modifie le même fichier : diff minimal).

**Ce qui PART** : la vue « Par domaine » et sa bascule « Par moment / Par domaine » (`CommandDrawerButton.tsx`, `features/chat-commands/categories.ts` si plus aucun appelant, clés i18n fr/en orphelines). **Repli de déploiement** (API sans `moment`) : il retombait sur « Par domaine » ; il devient une liste plate sous « Tout » (aucune puce de moment).

**Droits** : aucun changement d'accès.

**Je défais** : nomme dans un commit (« revient sur #N » / « garde #N ») chaque `#N` que `git blame` attache aux lignes retirées de `CommandDrawerButton.tsx` et `categories.ts` (la porte `anteriorite` le vérifie). Lis le titre de chaque issue avant de choisir.

## Pièges

- `git grep -n` de `CATEGORY_ORDER`, `categories`, `drawer.title`, `byDomain` (ou équivalent) AVANT de retirer : liste dans le rapport ce qu'on n'atteignait QUE par la vue « Par domaine ».
- Les états chargement / erreur réseau / vide restent distincts (aucune confusion avec « aucun résultat »).
- Une demande indisponible reste visible, grisée, non préparable, et dit ce qui manque.
- Démo (craft rule 9) : la salle de démo ouvre la vue avec les 31 demandes ; si la disponibilité dépend de connexions, vérifie `apps/api/src/modules/demo/demo-coverage.ts` et classe la nouveauté (seedée ou vide à dessein AVEC sa raison).
- Changelog : `packages/contracts/src/changelog/` (`entries.ts` + `labels.fr.ts` + `labels.en.ts`, parité stricte). i18n fr ET en.
- figma-sync : si un overlay de `packages/figma-sync/src/spec/overlays/` décrit le tiroir, mets-le à jour (test `overlay-inventory`).
- Prettier : config du dépôt (`.prettierrc.js` → `@bellum/tooling/prettier`, printWidth 120, guillemets simples) ; jamais un reformatage de fichier entier.

## Périmètre

Périmètre : apps/web/src/features/chat-commands/**, apps/web/src/features/chat/view/Chat.tsx, apps/web/src/features/chat/view/laura-home-grid.tsx, apps/web/src/i18n/locales/**, apps/api/src/modules/demo/**, packages/contracts/src/changelog/**, packages/figma-sync/src/spec/overlays/\*\*

Un fichier hors périmètre nécessaire : n'y touche pas, nomme-le dans le rapport.

## TDD et gates — CIBLÉS seulement

- Tests d'abord : liste + aperçu (sélection, `aria-pressed`) ; puces + compteur ; plus de « Par domaine » ; disponibilité dans l'aperçu ; Préparer sans envoyer + annulation ; mobile deux vues ; chargement / erreur / vide ; anglais.
- `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` (filtre les TS6305 de `packages/contracts/dist` non construit, ou `pnpm --filter @bellum/contracts build` d'abord).
- `pnpm --filter @bellum/web exec vitest run <≤ 5 fichiers>` + les gardes `apps/web/src/architecture/` qui citent les fichiers touchés (GA-26/27/28/32/33/35, `accessible-names`, `no-hardcoded-colors`).
- `pnpm lint:exports:types` (knip).
- **JAMAIS** la suite complète, le `check-types` racine ou le build.

## Livrer

Commits groupés, numéros dans le sujet (≤ 100 caractères, scope parmi web/api/contracts/tooling…) : `feat(web): Idées de demandes en liste + aperçu (#5043)`. Trace `// #5043` à l'endroit de chaque comportement. Push sur `claude/laura-idees-v8-5043` après chaque étape verte. **N'ouvre PAS de PR.**

Rapport (≤ 15 lignes) : SHA, critères d'acceptation de #5043 tenus (preuve `fichier:ligne`), non faits + raison, fichiers hors périmètre, chemins orphelins. Puis STOP.
