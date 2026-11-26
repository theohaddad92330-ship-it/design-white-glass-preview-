# Lot 629 — Divers 2/3 (#4818)

Périmètre : apps/web/src/features/onboarding/components/ThemeQuestionCard*.tsx, apps/web/src/features/onboarding/components/AnswerStatusSelect.tsx, apps/web/src/i18n/locales/*/onboarding.json, docs/briefs/\*

## Livré

- #4818 : dans le cadrage, une question exigée par la porte (`TEMPS1_REQUIRED_KEYS`) et sans réponse porte « Exigée pour ouvrir ton espace » ; les facultatives gardent « Pas encore répondu ». Source unique : le contrat (GA-26). « Pas suggéré dans ton contexte » n'est pas touché.

## Déjà livré (prouvé, aucun code)

- #4817 : commit 212b5e7a, `FramingValidationBlock.tsx` + `lib/missing-essentials.ts`.

## Non fait, et pourquoi

- #4696, #4700 : bloqués sur la réponse du support Boond (#4699) / épopée.
- #4748 : défaut côté IA (`chat_tools.py` en cours de modification par un autre lot).
- #4800, #4804 : #4804 dépend de #4803 ; #4800 demande l'inventaire des champs publics, arbitrage de conception.
- #4830 : PR #4874 déjà ouverte.

## Droits

Aucune surface d'accès touchée.
