# Détection des exports de types TypeScript inutilisés

## Pourquoi

Un `export type` / `export interface` / `export enum` qui n'est consommé que dans son propre fichier est du bruit : il élargit inutilement la surface publique d'un module et empêche un futur lecteur de savoir ce qui est vraiment réutilisé. `tsc` ne signale pas ce cas, et la config ESLint actuelle ne le couvre pas non plus.

## Outil

[**knip**](https://knip.dev) (déclaré en devDependency racine), configuré via `knip.json` à la racine. Knip lit le graphe d'import du monorepo (`apps/*`, `packages/*`, sauf `apps/ia` qui est Python) et signale les `export type | interface | enum` qui ne sont importés depuis aucun autre fichier.

## Comment lancer

Depuis la racine :

```bash
pnpm lint:exports:types       # check ciblé : types uniquement (ce que ce check garantit)
pnpm lint:exports             # élargi : exports nommés + types + namespace exports
pnpm lint:exports:fix         # retire automatiquement les exports détectés
```

`pnpm lint:exports:types` :

- exit code **0**, sortie vide → rien à corriger
- exit code **1**, liste `path:line:col  type  Name` → des types sont à dé-exporter ou à supprimer

## Comment fixer un cas signalé

Trois options, dans cet ordre de préférence :

1. **Type utilisé seulement dans son fichier** → retirer le mot-clé `export`. Le type reste local.
2. **Type utilisé nulle part** → supprimer le type entièrement.
3. **Re-export dead** (ex. `export type { Foo } from '@bellum/contracts'` dans un module qui n'est jamais consommé pour ce type) → supprimer la ligne de re-export.
4. **Cas légitime mais non détectable par knip** (rare : type public consommé via réflexion, ou contrat externe consommé via mécanisme dynamique) → ajouter le fichier à `ignore` dans `knip.json`, **avec une raison commentée**.

Ne jamais ajouter `// eslint-disable` ou bypass : le bon réflexe est dé-exporter, supprimer, ou justifier dans `knip.json`.

## Périmètre

Knip ne **signale jamais** ce qui est exporté depuis un `entry` déclaré dans `knip.json`. Pour les packages `@bellum/*`, les `entry` sont les `package.json#main` / `exports` (auto-détectés via le champ `exports`). Tout type ré-exporté depuis `packages/contracts/src/index.ts` est donc considéré comme utilisé externalement, qu'un app actuel le consomme ou non — c'est volontaire (ces packages exposent une API publique).

Fichiers explicitement ignorés :

| Fichier                                    | Raison                                              |
| ------------------------------------------ | --------------------------------------------------- |
| `apps/ia/**`                               | Python                                              |
| `apps/web/src/routeTree.gen.ts`            | Généré par TanStack Router                          |
| `packages/contracts/src/database.types.ts` | Généré par Supabase, le périmètre suit le schéma DB |
| `packages/utils/src/tlds.generated.ts`     | Généré par script de pré-build                      |

## Pourquoi pas en pre-commit

Knip parcourt tout le graphe d'import : ~3-10 secondes sur ce monorepo. Trop lent pour `lint-staged` qui doit rester sub-seconde. Le bon moment c'est :

- **À la main** avant push (`pnpm lint:exports:types`)
- **En CI** (la commande sera ajoutée au workflow GitHub Actions quand celui-ci sera mis en place — le script est déjà prêt)

## Fichiers de config

- [`knip.json`](../knip.json) — workspaces + ignores
- [`package.json`](../package.json) — scripts `lint:exports*`
- [`turbo.json`](../turbo.json) — task `lint:exports`
