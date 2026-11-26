# Lot 401 — Divers (1/2) — 9 issues

Périmètre : apps/api/src/common/zod-validation-exception.filter.spec.ts, apps/api/src/common/zod-validation-exception.filter.ts, apps/api/src/modules/demo/demo-dataset.ts, apps/api/src/modules/demo/demo-signals-stale-collection-coverage.spec.ts, apps/api/src/modules/onboarding/onboarding.controller.ts, apps/api/src/modules/onboarding/onboarding.service.spec.ts, apps/api/src/modules/onboarding/onboarding.service.ts, apps/web/src/features/accounts/view/account-detail/tabs/TabCommittee.tsx, apps/web/src/features/consultants/lib/talentInlineFields.ts, apps/web/src/features/consultants/view/detail/TalentFieldGroup.tsx, apps/web/src/features/onboarding/components/AnswerStatusSelect.tsx, apps/web/src/features/onboarding/components/FramingValidationBlock.tsx, apps/web/src/features/onboarding/components/ThemeQuestionCard.tsx, apps/web/src/features/onboarding/lib/required-answers.ts, apps/web/src/i18n/locales/en/consultants.json, apps/web/src/i18n/locales/en/onboarding.json, apps/web/src/i18n/locales/fr/consultants.json, apps/web/src/i18n/locales/fr/onboarding.json, packages/contracts/src/schemas/segment-catchup.ts

## Livré

- #4837 : entrée `#4754` au registre `SEGMENT_CAPABILITY_HISTORY.signals` (commit IA réel, `at` = fusion #4764). L'epoch `signals` avance : la collecte « fraîche » de SNCF en démo est repoussée après (garde #2291.2 / #4437.5 conservée).
- #4813 : les avertissements du comité d'achat s'enroulent (`whitespace-normal max-w-full`) côté appelant ; `Badge` inchangé (garde #1608/#1631.7 conservée, #3263.37 conservée).
- #4817 : `POST /onboarding/complete` refuse avec `code: 'incomplete'` + `missing[]` ; l'écran nomme chaque réponse (libellé) et la relie ; un échec autre ne dit plus « il manque des réponses ».
- #4818 : la question exigée par la porte (`TEMPS1_REQUIRED_KEYS`) porte un repère, son absence se lit « À répondre — exigée… ». Aucun second registre.
- #4833 : le filtre Zod nomme les champs refusés ; la fiche talent dit quand le champ refusé n'est pas celui édité (garde #4402.1 conservée).

## Ce qu'on ne fait pas

- #4869, #4834 : exigent `.github/workflows/ci.yml` (jeton sans scope `workflow`) — non poussable, signalé au rapport.
- #4845 : la partie « cliquet CI » exige aussi un workflow ; la tâche survivante (AccountStrategy5PCard) n'a pas été reproduite ici (suite web 800 fichiers, hors VM).
- #4875 : arbitrage de produit (sens 1 ou 2) → QUESTION pour Louis. #4817 rend déjà le cul-de-sac sortable (les clés sont nommées et reliées).

## Droits

Aucune surface d'accès nouvelle (ni page, ni route, ni garde, ni rôle). Test de refus ajouté : `missingKeysOf` / 503 → pas de phrase « il manque ».

## Décisions touchées par `git blame`

Garde #4686, garde #4700, garde #4702 (le commit qui porte la ligne du filtre Zod est le catalogue BoondManager : aucun rapport, la décision n'est pas modifiée). Garde #4688 (la connexion Boond semée en démo reste ; seule la date `signals_collected_at` de SNCF avance).
