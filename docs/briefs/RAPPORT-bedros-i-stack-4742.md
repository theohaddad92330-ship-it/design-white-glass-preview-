# Rapport — Lot I (#4742) structure technique d'un compte

Branche `claude/bedros-i-stack-4742` (base origin/main 5c42f0af). Lecture tranchée : « quel rep » = ERP. Radar par technologie (#4285.3) : hors périmètre, non touché.

## Fait

- `GET /accounts/:id/tech-structure` (`accounts.controller.ts`, même porte d'appartenance que `market-context`) : cinq axes — CRM, ERP, données, hébergement, outils métier.
- `account-tech-structure.ts` (pur, testé) : classe ce qu'une source a NOMMÉ (compétences + titre des offres d'emploi, `detected_tech_stack`, `technology_stack`, technologies Apollo). Rien n'est deviné depuis le secteur.
- Chaque technologie porte ses preuves (≤ 3, la plus récente d'abord) : nature (`job_offer` / `analysis`), date, lien, intitulé de l'offre. Aucun fournisseur nommé.
- Axe non observé : reste NOMMÉ (`not_observed_axes`), jamais « 0 ». Offres de stage/alternance écartées.
- Démo (règle n°9) : dossier SNCF, 3 offres portent des outils + liens `example.org/demo` ; CRM volontairement « non observé ». `DEMO_TECH_STRUCTURE_COVERAGE` + garde `demo-tech-structure-coverage.spec.ts`.

## Fichiers

accounts/account-tech-structure.ts (+ .spec.ts), accounts.controller.ts, demo/demo-dataset.ts, demo/demo-coverage.ts, demo/demo-tech-structure-coverage.spec.ts.

## Tests lancés (réels)

- jest : account-tech-structure.spec, demo-tech-structure-coverage.spec, demo-signal-source-links.spec, accounts.market-context.spec -> 4 suites, 34 tests verts (rouge d'abord : module absent).
- jest api-response-fields-are-read.spec : vert. endpoint-guards.spec : 1 rouge DÉJÀ présent sur main sans mon code (GA-05, 367 routes sans permission contre 365 au gel) ; ma route est nue comme `market-context` (aucune permission de lecture générique n'existe), elle aggrave ce compteur d'une unité.
- `tsc --noEmit -p apps/api` : propre, hors 3 erreurs d'environnement `@bellum/email` (paquet non construit ici).

## Reste à faire / questions

- Écran : aucun composant web ni client d'API n'appelle encore la route (périmètre du brief = API + démo). Il faut une carte « Structure technique » (axes, preuves, axes non observés nommés) — sinon « code juste que personne n'appelle ».
- Le catalogue de technologies est volontairement court (≈ 40 noms) : à élargir sur retour terrain.
- Question : faut-il une permission de lecture dédiée pour résorber GA-05 ? Je n'ai pas tranché.
