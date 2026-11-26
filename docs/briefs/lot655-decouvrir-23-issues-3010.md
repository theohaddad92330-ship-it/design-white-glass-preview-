# Lot 655 — Découvrir, 23 issues, une PR

<!-- prettier-ignore -->
Périmètre : apps/web/src/features/discover/**, apps/web/src/i18n/locales/*/discover.json, packages/contracts/src/schemas/account.ts, apps/ia/tests/test_signal_freshness.py

## Livré dans cette PR

- #4824 — la pastille « Fit marché » dit un compte (« · N expertises »), la liste passe dans une ligne de texte qui se replie. `badge.tsx` non touché.
- #4841 — « talend en occitanie », « java dans le gard », « sap département 30 » posent région/département dans le rail (chip + URL) ; le mot de zone ne part plus en mot-clé. Le rail déjà rempli gagne.
- #4832 — `signalDateMs` lit une date incomplète à la FIN de sa période (comme `read_signal_date`), plage « 2023-2024 » comprise. Garde #4647 / #4716 (ancrage sur la première année, mois en lettres).

## Ce qu'on ne fait pas / ce qu'on défait

- On défait l'ancien contrat « année seule = 1er janvier » de `signalDateMs` (tests #4716 ajustés : 2024 est `current` au 14/07/2026, 2023 archive).
- `signalSortMs` garde le début de période (il ordonne, il ne classe pas).
- Pas de nouvelle surface d'accès : pas de section Droits.

## Déjà livrés (prouvés par commentaire, aucun code)

#4574 #4632 #4646 #4663 #4664 #4710 #4712 #4715 #4716 #4734 #4735 #4738 #4754

## Non traités

#4814, #4819 (arbitrage de produit), #4842 (chemin à situer, risque pour la recherche par nom), #4793 (dépend du « lecteur commun » absent), #4798 (jeton humain), #4420, #4762 (épopées).

## Décisions touchées

Garde #4392 (ancrage sur la première année : test ajusté, règle conservée), garde #4450, #4456, #4615, #4617, #4618, #4620 (forme du résultat de `parseNeedsFreetext` : deux champs de zone ajoutés, aucun retiré).
