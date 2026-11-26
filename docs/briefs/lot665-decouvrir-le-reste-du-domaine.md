# Lot 665 — DÉCOUVRIR, le reste du domaine (18 issues)

Périmètre : apps/web/src/features/discover/view/MarketObservedSection*, apps/web/src/i18n/locales/*/discover.json, packages/contracts/src/schemas/account.ts, packages/contracts/src/schemas/signal-date\*

## Ce que le lot livre

- **#4824** — la liste des expertises recoupées sort de la pastille « Fit marché » (`whitespace-nowrap`, gardé dans
  `badge.tsx`, non modifié) : la pastille dit un compte, une ligne de texte dit la liste. Garde #2613 (pas de pastille
  sans fit mesuré), #3777 (l'absence ne fait pas de ligne), #4632 (vocabulaire tenu : « observé », jamais un score).
- **#4832** — `signalDateMs` lit une date incomplète à la FIN de sa période, comme `read_signal_date` côté IA : garde
  #4647 (Louis 27/10/2026, jamais le 1er janvier), garde #4716 / #4822 (mois en toutes lettres, règle d'ancrage sur la
  première année). Revient sur le test d'archivage de #4716 qui encodait « 2024 = archive », et sur
  la ligne de `account.signals.test.ts` posée par #4394 (« lit l'année de tête ») : son intention est GARDÉE (#4394), seul
  l'exemple change (2023 + dépôt 2024-11, qui discrimine toujours la règle d'ancrage).

## Ce que le lot ne fait PAS

- `signalSortMs` (clé de TRI, `signal-date.ts`) n'est pas touché : il ne décide ni archive ni digest.
- Aucun changement Python, aucun workflow, aucune migration.
- #4814 attend l'arbitrage de Louis (agences d'intérim / VMS / MSP / apporteurs sont-ils des clients finaux ?).
- #4798 exige un jeton d'espace de test (geste humain).

## Déjà livrés (prouvés dans la PR, pas recodés)

#4710, #4715, #4716, #4632, #4574, #4712, #4734, #4735, #4738, #4754 — voir le corps de la PR.
