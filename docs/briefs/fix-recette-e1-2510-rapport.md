# Rapport — lot FIX-RECETTE-E1 (25/10/2026)

Branche `claude/fix-recette-e1-2510`, base `origin/main` (af76f469). Pas de PR. Typecheck web : `tsc --noEmit` exit 0.

## #4327.2 — filiale non confirmée étiquetée (commit aa4fac1c)

- **Calcul vs appelant** : le calcul existait (`source: 'web'` → « non confirmée », #4327.2 dans `entityData.ts`) mais l'étiquette
  n'était visible que sous « Détails » ; la bannière comptait `entities_exhaustive` seul, la liste fusionnait analyse + filiales + vocabulaire.
- Fait : badge « À confirmer » SUR la ligne ; note `entities-unconfirmed` (« N à confirmer ») ; `countGroupEntities` — bannière et liste
  lisent maintenant le MÊME calcul. Fichiers : `EntitiesGraphCard.tsx`, `entities/entityData.ts`, `TabSites.tsx`, i18n `accountOrg`.
- Tests : `EntitiesGraphCard.test.tsx` (+2), `entityData.test.ts` (+2), rouge → vert.
- **Non fait** : le « 8 filiales connues » vient d'`EntityResolutionCard` (`children_count` du registre) — autre source, autre écran ;
  non réconcilié avec la bannière (écart dit seulement par la note « dont N à confirmer » / « Autres »). Pas de recette navigateur.

## #4418.1 — « Marquer envoyé » (commit fff9ac81)

- **Appelant manquant** : `declare-sent` / `declared-touch` + `CadenceService` existaient, seul l'onglet Engagement les appelait.
- Fait : `DeclareSentAction` sur le brouillon de la messagerie (à côté de « Copier le texte »), qui dit les échéances J+n datées **lues
  sur le calendrier serveur** (`useContactCadence`), et la phrase « Déclaré par toi… ne vaut jamais preuve d'envoi ». Si le calendrier n'est
  pas planifié, l'écran ne promet rien. Aucune écriture de preuve d'envoi.
- Tests : `DeclareSentAction.test.tsx` (4), `DraftsView.test.tsx` (+1).
- **Non fait** : `/actions` (« Fait vérifié » / « Les marquer faites ») n'a PAS reçu le geste — y brancher la cadence ferait de « Fait »
  un geste d'envoi, ce que la doctrine interdit ; à trancher par Louis.

## #4405.1 — modale « Répondre à ce fil » (commit ff603d81)

- Cause : `DialogFooter` = cinq boutons sur UNE ligne, et `Button` de base est `shrink-0 whitespace-nowrap`. Fix : rangée `flex-wrap`, `min-h-11`.
- Libellé : « Préparer une réponse » (`reader.prepareReply`) aligné sur « Préparer la réponse » (les deux autres clés + test Beeper) — décision dite ici.
- Test : `DraftDialog.test.tsx` garde la CAUSE (jsdom ne mesure pas) ; la mesure 1512/768 px reste à la recette.

## #4305.2 — effort de la recherche (commit 378fc5e3)

- **Appelant manquant** : le compteur `_REGISTRY_CALLS` n'était que journalisé. `_search_effort` → `query.searchEffort`
  `{sourcesQueried, stoppedBy: limit|time|exhausted}` ; `SearchEffortNotice` l'affiche. Ni crédit, ni fournisseur ; le budget des signaux
  (`discover-signals`) ne passe pas pour une liste coupée. Démo seedée (`demo-scripts.ts`, `DEMO_DISCOVER_SEARCH_EFFORT_COVERAGE`).
- Tests : `test_discover_search_effort_4305.py` (6), `SearchEffortNotice.test.tsx`, `discover-search-effort.test.ts`, `demo-discover-search-effort.spec.ts`.
- Contrat : `query` est un dict libre côté contrat — aucun `packages/*` touché. Le texte « sans plafond » (`firstBatch`) reste (décision #4016 L7).

## #4421.3 / #4408.1 — Laura (commits d410e29d, dc640b39)

- **Appelant, pas calcul** : le moteur élargissait déjà (`widenedBy`), mais `_split_by_scope` (#3705) rangeait ces voisins ÉTIQUETÉS « hors demande » → 3 comptes sur 10.
  Désormais l'étiquette sauve la ligne, sur l'axe qu'elle nomme seulement. `shortfall` : plus de « je ne complète pas » nu — il dit le palier atteint,
  `applied` vrai si élargi, « sans demander la permission » (proposition d'élargissement reformulée en conséquence).
- Offre datée : `_split_by_dated_offer` — pour « qui recrute » (moteur compétence), un compte sans offre datée sort de la liste principale
  (`without_matching_offer`, raison dite, non compté). Deux fixtures existantes (#4434.3, #4438.1) ont reçu une offre datée.
- Tests : `test_fix_recette_e1_paliers_4421.py` (8) ; 93 fichiers pytest `run_account_search` : 1432 verts.
- **Non fait** : « Contact à identifier » (résolution de contact) non traité ; recette live non faite.

## Environnement

- `@bellum/{contracts,utils,errors,http,observable,events}` buildés localement pour vitest (dist ignorés par git).
- `ruff` sur `discover.py` : lint/format déjà rouges sur main avant ce lot (non touché).
- Tests écrits en même temps que le code (pas de rouge observé) : `demo-discover-search-effort.spec.ts`, `DeclareSentAction.test.tsx` (rouge = module absent).
