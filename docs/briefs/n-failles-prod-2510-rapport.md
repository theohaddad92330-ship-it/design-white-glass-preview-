# Rapport — Lot N-FAILLES-PROD (#4554)

Branche `claude/n-failles-prod-2510`. Pas de PR, `zod`, `ci.yml` et les PR Dependabot non touchés.

## Audit `pnpm audit --prod` (metadata.vulnerabilities)

- AVANT : low 7 · moderate 36 · **high 6** · critical 0
- APRÈS : low 6 · moderate 34 · **high 2** · critical 0
- Les 2 high restants sont le MÊME advisory `zod` GHSA-mrhx-c7xc-m3w5 (deux chemins : zod 3.25.76 via `@bellum/contracts`, zod 4.4.1 via `apps/website > @anthropic-ai/sdk`). Rien d'autre en high/critical.

## Versions montées

- `happy-dom` ^20.8.9 -> ^21.0.4 (apps/web)
- `undici` ^8.11.2 -> ^8.12.2 (apps/api, packages/http)
- `pypdf` 6.21.1 -> 6.21.2 (apps/ia/pyproject.toml + requirements.txt, cohérents)
- override `multer@<2.3.0: ^2.4.0` -> `multer@<2.5.0: ^2.5.0`
- override ajoutée `body-parser@<2.4.0: ^2.4.0`
- `pnpm-lock.yaml` régénéré (`pnpm install --no-frozen-lockfile`)

## Garde

`apps/api/src/architecture/pnpm-overrides-keep-prod-fixes.spec.ts` : échoue si `multer` ou `body-parser` perd son override ou passe sous le correctif. Prouvé rouge (override multer retirée : 1 failed) puis vert (2 passed).

## Tests

- jest `import-body-limit.spec.ts` (corps de requête) : 7/7 verts. Garde : 2/2 verts.
- tsc api : 3 erreurs `TS2307 Cannot find module '@bellum/email'` (paquet workspace non construit dans la VM, sans lien avec le lot).
- tsc web : lancé, pas terminé au moment du rapport (VM lente) ; à la CI.

## Non fait

- pytest IA (`pypdf`) : pytest lancé mais `fastapi` et les dépendances de l'app absentes de la VM ; non installées (lourd). A la CI.
- vitest web sous happy-dom : `@bellum/contracts` non construit (build = CI), la suite ne démarre pas.
- Aucun spec d'upload `multer` ciblé trouvé en dehors de `import-body-limit`.
- Aucune question d'auth/upload : aucun changement de comportement requis.

[lot-fini] claude/n-failles-prod-2510 dc63a4541b
