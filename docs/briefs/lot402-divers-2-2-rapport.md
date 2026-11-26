# Lot 402 — Divers (2/2) — 8 issues (#4753, #4729, #4718, #4714, #4711, #4699, #4525, #4293)

Périmètre : docs/briefs/lot402-divers-2-2-rapport.md

Aucun code : chaque point est soit déjà livré sur `main` (prouvé), soit bloqué par une décision de Louis ou par un tiers.

## Déjà livré — prouvé (ne rien recoder)

- **#4753** — garde `apps/web/src/architecture/GA-4753-lamorce-phare-reste-dans-les-six-visibles.test.ts` (#4864, 56ac5274) ;
  `DEMO_PINNED_STARTERS` / `pinnedStartersBeyondCap` dans `features/demo/demo-chat-script.ts:502-510`. Elle sait dire NON (7e) et OUI (6e). Relancée : 5/5 verts. Les 4 points de l'issue sont tenus → fermable.
- **#4525** — la route dédiée `approach.call` n'existe plus ; `ApproachPage.tsx:146` rend `CallApproachBody` dans l'onglet ; `approach-call-route.test.ts` vert (3/3). Reste la ligne « recette Chrome sur prod » (mobile, clair/sombre, démo), qui n'est pas faisable depuis le cloud.
- **#4729.4** — `anthropic` et `openai` sortis du groupe `majeures` (`.github/dependabot.yml:43`, #4863).
- **#4699** — registre des 9 questions Boond posé (#4855) ; reste l'attente des réponses du support.

## Bloqué — question à Louis

- **#4714** — arbitrage produit explicite : (1) router le remplissage de champ vide par `OutboundWriteService`, ou (2) nommer l'exception dans `doctrine.md` + `doctrine-registry.ts` (GA-38) et amender la garde de #4186. Rien à coder avant.
- **#4718** — deux « À préciser » ouverts : alerter ou seulement afficher ; un compte radié sort-il des listes de prospection. Ces réponses changent le périmètre.
- **#4711** — l'issue demande de trancher avant de coder si `built_at` apporte quelque chose que le SHA ne donne pas ; touche aussi la config Railway.
- **#4729.1-3** — `instructor` 1.17.0 est la dernière version et plafonne `jiter<0.15` (aucune résolution avec openai 3.x) ; `anthropic` 2.x retire `temperature` (23 endroits) : décision produit + éval avant/après (note dans dependabot.yml).
- **#4699** — réponses du support Boond, hors dépôt.
- **#4293** — chantier de recettes en production (9 points « livré, reste à le voir tourner ») : preuve par navigateur sur la prod, non faisable ici.

## Ce que ce lot ne fait pas

Il ne ferme aucune issue, ne touche ni code ni `.github/workflows`, ne change aucun plafond ni aucune doctrine.
