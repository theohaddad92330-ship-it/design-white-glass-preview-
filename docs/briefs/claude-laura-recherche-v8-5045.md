# Brief — #5045 : recherche accompagnée habillée V8 (Laura)

Branche : `claude/laura-recherche-v8-5045` (ce fichier est déjà dessus). Dépôt : Bellum-AI/belllum-monorepo, base `origin/main`.
Agent : écrivain. **Plafond : 300 tours.** À 240 : commit et push de ce qui est vert, rapport, stop.
Issue : #5045 (la lire en entier : `gh issue view 5045`). Épopée : #5033 (section « Arbitrages »).

Maquette (paquet hors dépôt, extraits versionnés pour toi) : `docs/briefs/laura-v8-maquette/`

- `travail-app-js-645-810.txt` : le bloc de travail de la maquette (lignes 645-810 de `app.js` : `runStage`, `work-stages`, « Voir le détail », `stopWork`, mise en file). `statut-app-js-1155-1170.txt` : le kicker de statut (lignes 1155-1170). Les numéros `app.js:N` de l'issue renvoient à ces lignes.
- `travail-styles.txt` : règles CSS de la maquette (à traduire en Tailwind et tokens `--bellum-*` ; aucun hexadécimal, D79).
- `v7-production-contract.txt`, `v8-decisions.txt` : contrats. Le V7 dit lui-même que les questions pendant un run exigent d'étendre le protocole.

## Contrat (Louis 31/10 : « forme de la maquette, fonction gardée »)

**Compris** : un travail long lisible — où en est Laura, comment l'arrêter, comment reprendre — sans toucher au job réel.

**Je fais** (présentation seulement) :

- `LauraJobCard` prend la forme du bloc de travail de la maquette : kicker de statut (« Recherche en cours » / « Recherche interrompue » / « Recherche terminée », dérivé de l'état RÉEL du job), libellé de l'étape courante, progression « x sur y », détail repliable « Voir le détail » qui liste les VRAIES étapes du job avec leur capacité nommée. Les quatre pastilles fixes de la maquette (Demande / Dossier / Sources / Synthèse) ne sont PAS reprises telles quelles : les pastilles sont les étapes réelles du job.
- L'indicateur de tour en cours (libellé d'étape serveur `pendingStep`, `role="status"`) prend la même forme compacte (libellé + Arrêter).
- `DeepenJobResumeBanner` habillé V8, mêmes arrêts expliqués (plafond de crédits, après N reprises).
- L'estimation avant lancement (`ResearchModeSelector`, `chat-mode-estimate-text.ts`) : mêmes valeurs mesurées, présentation V8.
- Arrêt : « Recherche interrompue à ta demande », le texte déjà reçu reste ; échec distinct avec « Relancer » (inchangé fonctionnellement). Mise en file : même fonction, libellé V8 « La demande est ajoutée à la suite. ».
- Mobile ≤ 768 px (GA-28).

**Je ne fais PAS** : aucune modification du job serveur, du protocole de flux (`delta` / `step` / `done`), ni du contrat `@bellum/contracts` ; pas de questions pendant la recherche ; pas de « Voir l'activité » ; pas d'horloge côté client ni de fourchette de durée inventée (« Environ 12-20 s », « Plus long que prévu » de la maquette sont de démonstration) ; pas de reprise « à partir d'ici », ni de résultat partiel ouvrable, ni de travail conservé par fil ; pas de changement du corps des réponses (#5044) ni du pied (#5032). **Aucun contrôle sans fonction.**

**Droits** : aucun changement d'accès.

**Je défais** : nomme dans un commit (« revient sur #N » / « garde #N ») chaque `#N` que `git blame` attache aux lignes modifiées (la porte `anteriorite` le vérifie). Lis le titre de chaque issue avant de choisir. Les gestes (Confirmer et lancer, Valider l'étape, Reprendre, Annuler, erreur 402) et « Rien n'est parti, rien n'est débité » + plafonds de coût sont GARDÉS.

## Pièges

- `Chat.tsx` est aussi modifié par #5032 (PR #5040, pas encore fusionnée) : diff MINIMAL dans `Chat.tsx`. Mets la forme dans des composants (`LauraJobCard.tsx`, un nouveau composant pour l'indicateur de tour si besoin), et ne touche dans `Chat.tsx` que l'appel de rendu.
- L'état vient du serveur (relecture 4 s, `POLL_MS`), jamais d'une minuterie.
- Annonces `role="status"` conservées (arrêt, mise en file, frappe).
- Démo (craft rule 9) : le job de démo (`DEMO_LAURA_JOB`, `apps/api/src/modules/demo/demo-coverage.ts` ~302-348) doit montrer les états habillés (en cours, terminé, interrompu). Si un état manque en démo, sème-le ou écris pourquoi il est vide à dessein.
- Changelog : `packages/contracts/src/changelog/` (`entries.ts` + `labels.fr.ts` + `labels.en.ts`, parité). i18n fr ET en, clés orphelines retirées.
- Prettier : config du dépôt (printWidth 120, guillemets simples) ; jamais un reformatage de fichier entier.

## Périmètre

Périmètre : apps/web/src/features/chat/view/LauraJobCard.tsx, apps/web/src/features/chat/view/DeepenJobResumeBanner.tsx, apps/web/src/features/chat/view/ResearchModeSelector.tsx, apps/web/src/features/chat/view/chat-mode-estimate-text.ts, apps/web/src/features/chat/view/Chat.tsx, apps/web/src/features/chat/view/work/**, apps/web/src/i18n/locales/**, apps/api/src/modules/demo/**, packages/contracts/src/changelog/**, packages/figma-sync/src/spec/overlays/\*\*

(Les nouveaux composants vont dans `apps/web/src/features/chat/view/work/`.) Un fichier hors périmètre nécessaire : n'y touche pas, nomme-le dans le rapport.

## TDD et gates — CIBLÉS seulement

- Tests d'abord : kicker de statut par état du job ; étape courante + progression ; détail repliable = étapes réelles ; arrêt garde le texte ; échec + Relancer ; bandeau de reprise ; estimation inchangée en valeur ; aucune durée inventée (test qui sait dire NON) ; pas de bouton « Voir l'activité ».
- `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` (filtre les TS6305, ou `pnpm --filter @bellum/contracts build` d'abord).
- `pnpm --filter @bellum/web exec vitest run <≤ 5 fichiers>` + les gardes `apps/web/src/architecture/` qui citent les fichiers touchés (GA-26/27/28/32/33/35, `accessible-names`, `no-hardcoded-colors`).
- `pnpm lint:exports:types` (knip).
- **JAMAIS** la suite complète, le `check-types` racine ou le build.

## Livrer

Commits groupés (sujet ≤ 100 caractères, scope web/api/contracts/tooling…) : `feat(web): recherche accompagnée habillée V8 (#5045)`. Trace `// #5045` à l'endroit de chaque comportement. Push sur `claude/laura-recherche-v8-5045` après chaque étape verte. **N'ouvre PAS de PR.**

Rapport (≤ 15 lignes) : SHA, critères d'acceptation de #5045 tenus (preuve `fichier:ligne`), non faits + raison, fichiers hors périmètre, chemins orphelins. Puis STOP.
