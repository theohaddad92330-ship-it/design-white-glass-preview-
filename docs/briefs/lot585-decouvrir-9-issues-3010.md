# Lot 585 — Découvrir, 9 issues vierges (30/10/2026)

Périmètre : apps/ia/app/services/account_qualification.py, apps/ia/app/services/discover_hiring_scope.py, apps/ia/app/services/hierarchy_level.py, packages/contracts/src/schemas/discover-hiring-scope.ts, packages/contracts/src/fixtures/discover-hiring-scope.json

## Livré

- #4626 : décision Louis 30/10 — badge « nom de personne » aussi quand tranche ET forme juridique inconnues, étayé par un indice fin (dirigeant physique du registre au même nom, ou casse « NOM Prénom »). Garde #4626 (SPIE BATIGNOLLES, AIR LIQUIDE restent sans badge).
- #4733 : un intitulé de dirigeant ne sort plus du filtre métier (« hors de ton métier »). Garde #4733, #4398 (famille de métier inchangée pour tout autre intitulé). CFO « courants faibles » (électricien) exclu.

## Ce que je ne fais pas

- #4892 (regroupement par marque), #4713 (registre étranger), #4750, #4706, #4627, #4519, #4517 : arbitrage Louis ou chantier trop large — voir la PR.
- Lignes de hierarchy_level.py (exclusions du dirigeant) : garde #4731, garde #4751, garde #4769 — l'exclusion existante est étendue (technicien, électricien, courants faibles), jamais retirée.
