# Décision : le E2E Playwright est en quarantaine (25/10/2026)

Décideur : Louis, 25/10/2026. Réexamen : **25/11/2026**.

## Contexte

Le job « E2E (Playwright smoke) » (`.github/workflows/e2e-nightly.yml`, job `e2e`) a quitté les pull requests le 22/10/2026 : il est nocturne (03:30 UTC) et manuel (`workflow_dispatch`). Le ruleset « main — CI Status requise » (25155651, actif) n'exige qu'un seul contrôle, `CI Status`. Le job `ci-status` de `ci.yml` agrège : `changes`, `quick`, `build`, `test`, `test-web`, `test-ia`, `arch`, `doc-suit-le-code`, `test-demo-db`, `promptfoo`. Le E2E n'en fait pas partie : il ne conditionne donc aucun merge, et la décision ne change aucun comportement de fusion. Elle l'écrit.

## Chiffres (mesurés le 25/10/2026)

Sur les 30 derniers runs : **13 KO, 9 annulés, 7 verts, dernier vert le 22/10.** Trois specs sont cassées sur la base elle-même (« Importer », violation de mode strict), donc le rouge ne dit rien d'une PR.

## Décision

Le E2E est en quarantaine : hors chemin bloquant, il n'est ni promu dans `CI Status` ni lu comme un signal de santé. Il continue de tourner la nuit pour qu'on voie le jour où il redevient vert.

## Ce qui le remplace dans le chemin bloquant

`CI Status` agrège déjà, et c'est ce qui tient lieu de garde :

- `build` : build de l'application web et vérification de types ;
- `test-web` : tests des composants et pages web (Vitest) ;
- `test` / `test-demo-db` : API et semis sur vraie base.

Limite assumée, dite sans détour : **aucun de ces jobs n'ouvre un navigateur.** Ne sont plus gardés à la fusion : le plancher tactile 44 px et la portée mobile de `/onboarding` (projet `web-mobile`, #2639.1), et tout défaut qui n'apparaît qu'au rendu réel.

Plus petit test de fumée proposé pour le chemin bloquant (non implémenté par ce lot) : dans `build`, après le build web, démarrer `next start` et exiger un `curl -fsS` à 200 sur UNE route publique (`/login`). Une route, une requête, quelques secondes, sans Playwright.

## Conditions de sortie de quarantaine

1. Les trois specs cassées sur la base sont corrigées sur `main`.
2. Au moins 10 runs nocturnes consécutifs verts.
3. Le temps de job tient dans le budget de la PR (le job coûtait ~8 min de runner par PR).
   Alors seulement : promotion dans `needs` ET dans la liste de `CI Status`. Sinon, au réexamen du 25/11/2026 : suppression franche ou prolongation motivée par écrit.

## Date de réexamen

25/11/2026.
