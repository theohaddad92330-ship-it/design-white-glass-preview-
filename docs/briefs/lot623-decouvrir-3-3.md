# Lot 623 — Découvrir 3/3 (#4824, #4841, #4832)

Périmètre : apps/web/src/features/discover/\*_, apps/web/src/i18n/locales/_/discover.json, packages/contracts/src/schemas/account.ts, packages/contracts/src/schemas/signal-date.test.ts

## Livré

- #4824 : la liste des expertises recoupées sort de la pastille (`fitMatchedBadge` + ligne `fitMatched`). `badge.tsx` intact. Garde #4813 (nowrap) conservée.
- #4841 : `parseNeedsFreetext` lit « en <région> », « dans le <département> », « dans le 30 » ; posés dans le rail (modes Besoins et Comptes). Garde #4419.29 / #4579.9 / #4493 conservées.
- #4832 : `signalDateMs` lit la FIN de période (année seule → 31/12, plage → fin de la dernière année), miroir de `read_signal_date` (#4647). Revient sur la lecture « 1er janvier » de #4716 pour l'année seule / le mois seul.

## Ne fait PAS

- #4798 (jeton d'espace de test : geste humain), #4814 (arbitrage de Louis), #4819 (arbitrage bloc/carte), #4842 (chemin d'entrée par raison sociale non localisé dans le temps imparti).
- `signalSortMs` inchangé : un tri ne doit pas faire gagner « 2026 » sur « 2026-07-15 » (test existant).
- #4841 : « mesure d'abord », « non pris en compte », nombre nu « 30 » (« java 11 » est une version), démo : non faits.
- #4824 : démo non seedée.

## Droits

Aucune surface d'accès touchée.

## Décisions touchées (garde)

garde #4450 · garde #4456 · garde #4615 · garde #4617 · garde #4618 · garde #4620 · garde #4640 · garde #4641 — lignes du test/commentaire `discover-needs-freetext` modifiées seulement pour ajouter `region`/`department` au résultat ; aucune de leurs règles n'est changée.
