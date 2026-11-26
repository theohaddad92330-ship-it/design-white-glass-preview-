# LOT CB — les cinq bugs d'onboarding du call client du 17/09, + #2572

base : d6c8f4074e8c6d813f931ab2e69a226b8d825278 — 18/09/2026
branche : `fix/lonboarding-ne-bloque-plus-le-client-18-09`

Cinq issues `beta-client` nées de l'appel Ludovic Marx (17/09/2026), + un
sixième point (#2572) confié en cours de lot par le coordinateur — même
porte que #2537.1 (« un état écrit à un endroit, lu par un garde qui ne le
regarde pas en entier »).

⚠️ **Ce que la mesure contredit dans le brief initial** : le brief affirmait
« ces cinq issues n'ont aucune ligne de registre ». Faux — un lot antérieur,
« LOT A » (`.claude/notes/registre-2026-09-18-A-onboarding-client.md`,
commit `cf561f9c2`, **déjà fusionné dans `origin/main`** avant le début de ce
lot), avait déjà traité #2537.1/.2/.3/.4, #2538.1, #2539.1, #2540.1, #2541.1
et #2572.1/.2/.3. Un second lot, « LOT AY » (branche
`feat/sortie-onboarding-toujours-possible-18-09`, PR #2595, **fusionnée dans
`origin/main` PENDANT ce lot** — `origin/main` est passé de `7b9083854` à
`d6c8f4074` en cours de route, d'où le rebase de cette branche), avait traité
la partie « quitter » de #2537.1 (#2579.2) que LOT A avait explicitement
laissée de côté (conflit de fichier avec #2577, alors non fusionné). Ce lot
(CB) a donc consisté à **vérifier** (lecture de code + relance des suites,
pas seulement lire l'état écrit par les lots précédents) plutôt qu'à
réécrire, et à traiter le SEUL point réellement encore cassé : #2572.1.

| numéro | demande en huit mots | sujet | mesure | état | preuve |
| --- | --- | --- | --- | --- | --- |
| 2537.1 | onboarding bloqué : fausse erreur, boucle, quitter impossible | onboarding, reprise, sortie | 3 symptômes distincts, mesurés séparément (voir détail ci-dessous) | déjà là | (a) `apps/web/src/features/onboarding/hooks/useOnboardingNavigation.ts:30` `onboardingSaveErrorKey` distingue réseau/session/enregistrement (Lot A #2537.4) — (b) `useOnboardingNavigation.ts:113-133` : le `catch` de `onContinue`/`onBack` n'appelle jamais `goTo`/`navigate`, donc un échec ne fait jamais avancer de sous-étape (Lot A #2537.1/.3 « vérifié, déjà correct » + `apps/api/.../onboarding.service.ts:613` `transitionTo` idempotent) — (c) `apps/web/src/features/onboarding/view/OnboardingWizard.tsx:207-283` `handleQuit` appelle `useSkipOnboarding().mutateAsync()` puis navigue (Lot AY #2579.2, PR #2595, fusionné `d6c8f4074`). Tests relancés : `useOnboardingNavigation.test.tsx` (7), `OnboardingWizard.test.tsx` (15), `onboarding.service.spec.ts` (86) — tous verts. |
| 2538.1 | plusieurs domaines d'expertise personnalisés effacés l'un l'autre | onboarding, questionnaire, saisie libre | lecture écriture (`addOtherValue`) et lecture relecture (test « trois entrées enregistrées apparaissent TOUTES ») | recetté | `apps/web/src/features/onboarding/components/QuestionField.tsx:273-278` `addOtherValue` ajoute à `selected` au lieu de remplacer un `otherValue` singulier (Lot A #2538). Test `QuestionField.test.tsx` describe `#2538` (5 tests, dont « trois entrées libres déjà enregistrées apparaissent TOUTES, séparément ») — vert. Note : la branche vague I (PR #2595, fusionnée) ajoute par-dessus `normalizeExpertiseFreeText` (#2549.2) — un alias « cybersécu »/« cyber-sécurité », **différent** de la cause de #2538.1 (l'écrasement), déjà réglée avant. ‖ RECETTÉ EN PROD 18/09 (espace Louis, 31 comptes) — `/onboarding/.../offer_expertise/domaines`, champ « Autre (préciser) » : « mécanique », « automatisme », « génie civil » saisis à la suite, les TROIS cochées simultanément, aucune n'efface la précédente. Chaque saisie libre REJOINT le catalogue (« mécanique » → « Mécanique & Conception (CAO, DAO) », etc.). Non testé : le rechargement de page, qui exigerait d'enregistrer les réponses réelles de Louis. |
| 2539.1 | positionnement commercial sans explication (régie/assistance technique) | onboarding, questionnaire, texte | grep des 9 choix + clés i18n FR/EN | recetté | `apps/web/src/features/onboarding/lib/questions/offre-prestations.ts:30-38` — les 9 choix de `service_types` portent un `descriptionKey`. `apps/web/src/i18n/locales/fr/onboarding.json:483-491` et `.../en/onboarding.json:482-490` — 9 clés FR+EN résolues (Lot A #2539.1). Test `offre-prestations.test.ts` (12 tests) — vert. ‖ RECETTÉ EN PROD 18/09 — `/onboarding/.../offer_expertise/offre-prestations` : NEUF choix sur neuf portent une explication. Régie : « Facturation au temps passé : le client pilote le résultat au quotidien, ton consultant peut intervenir sur site ou à distance. » Assistance technique : « Un ou plusieurs de tes consultants sont intégrés à l'équipe du client, sur site, sous sa direction technique directe. » |
| 2540.1 | pas de résultats/témoignages à montrer, bloque Continuer | onboarding, questionnaire, preuve | `isSatisfied` + test « Continuer actif sur liste vide » | recetté | `apps/web/src/features/onboarding/lib/questions/credibilite-preuves.ts:25-51` — `case_study_results`/`client_testimonials` portent `optional: true` (Lot A #2540, mécanisme réutilisé #2059.7). `apps/web/src/features/onboarding/lib/validation.ts:51` `isSatisfied` rend `true` sans lire la valeur quand `optional`. Trace ajoutée par ce lot (docs seuls) : `credibilite-preuves.ts:38-40,52` `// #2540.1 — « je n'en ai pas encore » n'est pas un zéro`. Test `credibilite-preuves.test.ts` (4) + `TagsField.test.tsx` (7) — verts. ‖ RECETTÉ EN PROD 18/09 — `/onboarding/.../offer_expertise/credibilite-preuves`, les deux champs vides : l'écran dit « Tu n'en as pas encore ? Tu peux laisser le champ vide et continuer — tu pourras revenir plus tard. » Vérifié dans le DOM (pas à l'œil) : bouton Continuer `disabled = false`. |
| 2541.1 | changer de salve ne remet pas le défilement en haut | onboarding, questionnaire, défilement | grep `scrollTo`/`scrollIntoView` + test avant/après `onContinue`/`onBack` | déjà là | déjà là sur la base avant ma bascule : commit 1c540db70 'fix(web): #2541 -- remonter le CONTENEUR qui defile, pas window' corrige exactement la cause racine mesurée (scrollTop du div.flex-1.overflow-y-auto, jamais window.scrollY). OnboardingWizard.tsx:55 scrollContainerRef passé à useOnboardingNavigation(state, sub, scrollContainerRef) (ligne 146) ; useOnboardingNavigation.ts:103 goTo() appelle scrollContainerRef?.current?.scrollTo({top:0,left:0}), plus jamais window.scrollTo. Test useOnboardingNavigation.test.tsx describe #2541 (ligne 189) asserte le scrollTo du CONTENEUR (containerScrollTo), pas de window — 10/10 tests verts. Rien à coder. |
| 2572.1 | « Reprendre la reconfiguration » ne rouvre rien, report périmé | profil, reconfiguration, report | test rouge prouvé (mock repo, assertion sur l'appel `save`, pas sur la valeur relue) puis vert | déjà là | **Root cause mesurée, différente de l'hypothèse du brief** : `apps/web/src/features/profile/components/ReconfigureAnswersSection.tsx:64` `onRequest` sautait `refresh.mutateAsync()` quand `alreadyRequested` (transition supposée illégale) et naviguait sans jamais purger `skipped_at`. Côté API, `apps/api/src/modules/onboarding/onboarding.service.ts:376-410` `requestRefresh` posait `state.skipped_at = null` en mémoire mais `transitionTo` (ligne 613, `if (state.status === to) return success(state)`) ne persiste RIEN quand la transition est déjà en place — la clé n'était donc jamais écrite en base sur un compte DÉJÀ `refresh_required`. Corrigé : le clic redemande toujours (l'API le traite en idempotence, #2004.11) + `states.save(state)` explicite après la transition. Tests : `onboarding.service.spec.ts` `#2572.2` (nouveau, prouvé rouge : le mock repo partage la RÉFÉRENCE de l'entité, une assertion sur la VALEUR relue passait à tort — l'assertion porte sur l'appel à `states.save`) ; `ReconfigureAnswersSection.test.tsx` `#2572.1` (nouveau, 2 tests) — tous verts. Changelog FR+EN : `packages/contracts/src/changelog/entries.ts` id `2026-09-18-reprendre-la-reconfiguration-ouvre-vraiment`. Résiduel NON corrigé (hors mesure de ce lot) : un accès DIRECT à l'URL `/onboarding` (hors du bouton « Reprendre ») sur un compte `refresh_required` + `skipped_at` périmé resterait bloqué par `needsOnboarding` (`onboarding-gate.ts:125`) — non observé en production, non traité ici. ‖ SERVI EN PROD 18/09 (API `08bfa42a8`) — tracé par le numéro dans un commit ancêtre ET par la présence de TOUS les fichiers cités à ce SHA. ‖ **EN PRODUCTION** — la ligne ne nommait aucune branche ; retrouvée par la TRACE du numéro dans l'historique : commit `622d75b4c` (fix(web) ReconfigureAnswersSection), ancêtre confirmé du commit servi `08bfa42a8`. Le commit change bien du CODE, pas seulement un registre — vérifié au `--stat`. |

## Démo

Aucun changement de comportement observable par un prospect ne sort de ce
lot (six points déjà couverts ou corrigés par du code déjà en démo-safe) :
`ReconfigureAnswersSection` reste « vide à dessein » en démo (`credits.is_demo
=== true`, commentaire déjà en place) — inchangé par ce lot. `demo-coverage.ts`
non touché : aucune nouvelle capacité, aucune nouvelle table/clé.

## Gates — état à la fin

- `cd apps/web && node node_modules/vitest/vitest.mjs run src/features/onboarding/components/QuestionField.test.tsx src/features/onboarding/components/TagsField.test.tsx src/features/onboarding/hooks/useOnboardingNavigation.test.tsx src/features/onboarding/lib/questions/offre-prestations.test.ts src/features/onboarding/lib/questions/credibilite-preuves.test.ts src/features/onboarding/view/OnboardingWizard.test.tsx src/features/onboarding/lib/onboarding-gate.test.ts src/features/profile/components/ReconfigureAnswersSection.test.tsx src/features/profile/view/ProfilePage.test.tsx --maxWorkers=2` → 251 tests, vert
- `cd apps/api && node node_modules/jest/bin/jest.js --config jest.config.js --maxWorkers=2 src/modules/onboarding` → 86 tests, vert
- `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` → 0 erreur
- `pnpm --filter @bellum/api check-types:tests` → 0 erreur
- `cd packages/contracts && node_modules/.bin/vitest run src/changelog/changelog.test.ts` → 25 tests, vert (ciblé — `--dir packages/contracts` entier non relancé, cf. avertissement du brief sur l'OOM)
- `pnpm lint:exports:types` (knip) → vert, aucune fuite nouvelle
- `node node_modules/prettier/bin/prettier.cjs --list-different <fichiers touchés>` → vert

## Ce qui n'est pas fait, et pourquoi

- Le résiduel `/onboarding` en accès direct (voir ligne 2572.1) : non mesuré
  en production, hors du geste que le coordinateur a décrit. Signalé, pas
  corrigé — un correctif plus large demanderait un champ de date dédié
  (« quand la reconfiguration a été demandée ») que le contrat actuel ne
  porte pas, donc une migration — hors du périmètre borné donné pour ce lot.
- `python3 tools/registres/coherence.py` : non relancé sur l'ensemble du dépôt
  (trop large pour ce lot) — le format de CE registre a été vérifié à la main
  contre `tools/registres/coherence.py` (vocabulaire des 7 états, pas de
  suffixe, première cellule = numéro seul).
