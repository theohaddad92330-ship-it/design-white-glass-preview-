# LOT R — /onboarding, activité en création (Ludovic Marx, 17/09/2026)

base : 4de833423 — 18/09/2026
branche : `feat/onboarding-activite-en-creation-18-09`

Mesure AVANT de couper (#2548.4) : `TEMPS1_STAGES` porte **115 questions** (compte `key:` dans
`apps/web/src/features/onboarding/lib/questions/*.ts`, hors `types.ts`/`index.ts`/`visibility.ts`/tests) —
cohérent avec les compteurs 20/63, 5/13, 18/33 et « 67 questions sans réponse » observés sur un profil réel.

⚠️ Déjà livré sur ce même écran, NON fusionné, donc absent de ma base et non redoublé : #2538 (domaines
personnalisés multiples), #2539 (positionnements — `offre-prestations.ts` — expliqués), #2540 (`optional`
sur `case_study_results`/`client_testimonials`), #2541 (retour en haut), #2572 (`refresh_required`) —
branche `fix/onboarding-client-18-09`. `normalizeExpertiseFreeText` (#2549.3) est sur
`feat/taxonomie-industrielle-18-09`, également non fusionnée et absente de mon worktree.

Une ligne par point : demande · zone · état · preuve en recette.

- **#2548.1** — branche « activité en création » qui évite les questions supposant un passé commercial ·
  `apps/web/src/features/onboarding/lib/questions/maturite.ts` (nouveau : `ESN_ACTIVITY_IN_CREATION`,
  `hasNoCommercialHistory`) + `sante-activite.ts`, `effectif-reel.ts` (aucun changement, déjà honnête —
  voir #2548.2), `vivier-comptage.ts`, `vivier-collecte.ts`, `vivier-etats.ts`, `base-clients-activite.ts`,
  `base-clients-capitalisation.ts`, `base-clients-suivi.ts`, `credibilite-preuves.ts` · **corrigé** ·
  `esn_maturity_situation` (sous-étape `maturite`, 3e écran du parcours) portait DÉJÀ le choix
  « Activité en création » depuis #2034 — pas de colonne neuve, pas de migration : `hasNoCommercialHistory`
  lit cette réponse existante. `when` (mécanisme #2023.5, déjà branché à l'écran, au bouton Continuer, à la
  progression ET à la reprise) retire **30 questions** pour ce profil : 3 (santé d'activité), 14 (vivier —
  aucune bande de comptage n'a de sens sans pool, et deux questions du funnel n'ont AUCUN choix « zéro »,
  contrairement aux bandes comptées), 11 (base de clients, missions/REX/satisfaction/suivi), 2 (preuves
  clients, `credibilite-preuves`). Reste 85 questions pour ce profil — LOIN de la cible « 8 à 12 » de
  #2548.4 (voir ce point plus bas, NON atteint). Preuve : `company-activity-branching.test.ts` (nouveau —
  sait dire NON, LIT un corpus ≥13 questions échantillonnées sur les 8 sous-étapes, témoin non masqué,
  reprise non bloquée sur une sous-étape entièrement masquée).
- **#2548.2** (ferme #2027.1 partiellement — décision Louis 17/09 au soir) — quatre états d'incertitude sur
  les questions de CHIFFRES · `apps/web/src/features/onboarding/lib/questions/client-ideal.ts`
  (`ideal_client_min_deal_size`), `vivier-comptage.ts` (`talent_pool_avg_tjm_band`) · **corrigé, partiel** ·
  mécanisme #2027 déjà existant (`allowUnknown`), posé sur DEUX champs de plus (panier visé, TJM du vivier).
  `consultants_managed_by_user_band` (effectif) **laissé SANS** `allowUnknown` à dessein : son choix
  « Aucun consultant géré directement » est déjà un zéro honnête, et l'ajouter faisait échouer
  `SubStepQuestions.test.tsx` (deux boutons « Non applicable » sur le même écran `effectif-reel`, qui rend
  les deux questions ensemble) — corrigé en amont plutôt qu'en élargissant le test. `avg_tjm` (Temps 2,
  TJM vendu) **non posé** : `ProfileQuestionnaireDialog.tsx` rend `QuestionField` directement, jamais
  `SubStepQuestions.tsx` — seul lecteur de `allowUnknown` (`UnknownAnswerChoices`) — poser le flag serait
  une métadonnée morte ; câbler Temps 2 sur #2027 est un lot à part. « Marge » et « délai d'encaissement »
  (cités par #2548) **n'ont aucun écran d'onboarding aujourd'hui** — mesuré par grep sur tout le
  questionnaire, aucun champ ne les porte : rien à corriger sans inventer un champ, hors périmètre.
  Preuve : `company-activity-branching.test.ts` (#2548.2 — deux champs positifs, un champ témoin négatif).
- **#2548.3** — même patron que #2539 : un terme de notre vocabulaire s'explique là où il est demandé ·
  `apps/web/src/features/onboarding/lib/questions/maturite.ts` (`esn_maturity_situation`) +
  `i18n/locales/{fr,en}/onboarding.json` (`esnMaturitySituationChoices`) · **corrigé, partiel** ·
  `exampleKey` posé sur « Plusieurs agences / BU » et « Transformation d'un modèle existant » (mécanisme
  #2087.9, choix COURT en carte, déjà rendu par `QuestionField.tsx` — aucun changement de composant
  nécessaire). Choisi car c'est la PREMIÈRE question de jargon du parcours et le fichier était déjà
  touché par #2548.1. Le reste du questionnaire porte encore des termes non expliqués
  (« nearshore », « staffing », `positioning` en `kind: multi`) — non traités : `descriptionKey` sur
  `kind: 'multi'` (carte courte) n'existe pas encore dans ma base (c'est la plomberie du #2539 non
  fusionné) et l'étendre serait redoubler ce lot. Preuve : `company-activity-branching.test.ts` (#2548.3).
- **#2548.4** — 8 à 12 questions essentielles, le reste différé · **NON fait, mesuré et documenté** ·
  115 questions au total, 85 restantes même pour le profil « activité en création » après #2548.1. Réduire
  à 8-12 pour TOUT profil demanderait (a) une navigation qui saute les sous-étapes vides (aujourd'hui
  `useOnboardingNavigation.ts` avance par INDEX brut sur `TEMPS1_SUBSTEPS`, jamais testé au-delà d'une
  question isolée masquée — un saut de sous-étape ENTIÈRE n'est pas prouvé en navigation, seulement en
  reprise/progression/relecture) (b) un mécanisme « différé, atteignable depuis les réglages » qui n'existe
  pas au catalogue actuel. Trop large et trop risqué pour ce lot borné (fichiers déjà lourdement travaillés
  par 2 branches parallèles non fusionnées) : laissé à un lot dédié.
- **#2549.3** — câbler `normalizeExpertiseFreeText` sur la saisie libre des domaines d'expertise ·
  **retenu** · la fonction n'existe pas dans mon worktree (`packages/contracts/src/schemas` ne la contient
  pas) — elle vit sur `feat/taxonomie-industrielle-18-09`, non fusionnée. Rien à câbler tant qu'elle n'est
  pas mergée.
- **#2548.5** — semis de démo « activité en création » atteignant une première liste d'entreprises ·
  **NON fait** · `apps/api/src/modules/demo/demo-dataset.ts` fait 12 260 lignes et ne porte aujourd'hui
  qu'UN seul persona (`esn_maturity_situation: 'Activité stabilisée'`, ligne ~5634) ; ajouter un second
  persona complet (profil + comptes + première liste Découvrir) est un chantier à part entière, pas une
  extension bornée. Vérifié que ce lot ne CASSE rien côté démo : `demo-coverage.spec.ts` passe intégralement
  (53/53) sans modification — aucune colonne ni clé `raw_analysis` nouvelle, `when`/`allowUnknown`/
  `exampleKey` sont des métadonnées d'écran, pas de schéma.

## Gates

- `pnpm --filter @bellum/web run check-types` : vert (2 passages, avant et après le fix `effectif-reel`).
- `cd apps/web && node node_modules/vitest/vitest.mjs run <fichiers touchés + suites consommatrices>
  --maxWorkers=2` : vert — `company-activity-branching.test.ts` (9), `adaptive-branching.test.ts` (5),
  `questions/index.test.ts` (12), `questions.golden.test.ts` (98), `question-keys-reach-the-model.test.ts`
  (5), `long-selections-have-a-subtitle.test.ts` (2), `pending-steps.test.ts` (5), `onboarding-progress.test.ts`
  (13), `SubStepQuestions.test.tsx` (24), `QuestionField.test.tsx` (23), `ChoiceRow.test.tsx` (10),
  `OnboardingStepper.test.tsx` (16), `onboarding-review-blocks.test.ts`. Un rouge réel trouvé et corrigé en
  cours de lot : `allowUnknown` sur `consultants_managed_by_user_band` faisait échouer 3 tests
  `SubStepQuestions.test.tsx` (deux boutons « Non applicable » sur le même écran) — retiré, remplacé par un
  commentaire qui explique pourquoi.
- `pnpm run lint:exports:types` : vert.
- `prettier --list-different` sur tous les fichiers touchés : vert.
- API : aucun fichier `apps/api/**` touché (le lot est resté entièrement côté `when`/`allowUnknown`/i18n,
  sans nouvelle colonne ni migration) — gate jest ciblé et `check-types:tests` non lancés, sans objet.

## #2548.4 — TRANCHÉ le 18/09/2026 au soir (décision Louis)

**On assume les ~42 questions** du profil « activité en création » (115 au Temps 1,
une trentaine masquées par la branche « en création »). La demande « 8 à 12 questions
essentielles » **ne sera pas servie** : passer de 42 à 12 n'est pas une coupe technique,
c'est choisir ce que Laura sait faire dès la première minute, et il n'existe aucun
Temps 2 vers lequel reporter le reste.

État : **écarté**, avec cette raison. Les trois autres demandes de #2548 sont livrées
(branche « en création », les quatre états d'incertitude, le vocabulaire expliqué).
