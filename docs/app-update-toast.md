# Toast de mise à jour applicative (ENG-64)

## But

Quand un nouveau build est déployé, prévenir les utilisateurs qui ont l'ancien bundle chargé en surfant un toast `Une nouvelle version de l'application est disponible` avec une action `Mettre à jour` qui recharge la page.

## Architecture

```
build (Vite)
 ├─ injecte __CODE_VERSION_ID__ dans le bundle (via vite.config define)
 └─ écrit dist/latest-version.json (via plugin emitFile)
                                ↓
               déploiement atomique (Vercel)
                                ↓
runtime (client navigateur)
 ├─ useApplicationUpdate() poll /latest-version.json toutes les 5 min
 ├─ compare manifest.latestVersion à __CODE_VERSION_ID__
 └─ <UpdateHandler> émet le toast quand state ∈ { 'available', 'force' }
```

## Composants

| Fichier                                            | Rôle                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `tools/get-version.sh`                             | Calcule `YY.MM.DD-tsUNIX+gitSHA10` (cible `package` ou `docker`).                                 |
| `apps/web/vite.config.ts`                          | `defineConfig` async : appelle `get-version.sh`, injecte `__CODE_VERSION_ID__`, émet le manifest. |
| `apps/web/src/lib/hooks/use-application-update.ts` | Poll `/latest-version.json`, état `idle` / `up-to-date` / `available` / `force`.                  |
| `apps/web/src/components/UpdateHandler.tsx`        | Affiche le toast une seule fois (`hasShownToast`) avec action `Mettre à jour`.                    |
| `packages/utils/src/env.ts` (`isDevEnvironment`)   | Source de vérité dev/prod, court-circuite le polling en dev.                                      |

## Comportement

| `updateState` | Quand                                                           | Action                          |
| ------------- | --------------------------------------------------------------- | ------------------------------- |
| `idle`        | premier render en prod, avant la 1re réponse du manifest        | rien                            |
| `up-to-date`  | manifest = `__CODE_VERSION_ID__`                                | rien                            |
| `available`   | manifest plus récent, et `now - releaseTimestamp < 24 h`        | toast une seule fois            |
| `force`       | manifest plus vieux que `MAX_VERSION_AGE_MS` (24 h), ou `v > 1` | toast une seule fois            |
| dev           | `isDevEnvironment() === true`                                   | jamais — `up-to-date` synchrone |

## Comment voir le toast

Aucun toast en `pnpm dev` — par design.

```bash
# 1) Build en figeant une version "ancienne" dans le bundle
VITE_CODE_VERSION_ID="26.05.01-ts1746091200+git1111111111" \
  pnpm --filter @bellum/web build

# 2) Écraser le manifest avec une version plus récente (timestamp = maintenant)
NOW=$(date +%s)
echo "{\"v\":1,\"latestVersion\":\"26.05.01-ts${NOW}+git2222222222\"}" \
  > apps/web/dist/latest-version.json

# 3) Preview
pnpm --filter @bellum/web preview
```

→ Toast `available` avec bouton `Mettre à jour` cliquable, qui recharge la page.

Pour tester `force` (toast une seule fois, pas de doublon) : `echo '{"v":2}' > apps/web/dist/latest-version.json`.

## Pré-requis pour la prod

- L'hébergement (Vercel) doit servir `latest-version.json` depuis le déploiement courant — c'est automatique avec Vercel car le fichier est généré dans `dist/` par le plugin Vite.
- Pour qu'un user avec un ancien bundle voie le manifest mis à jour, le déploiement doit avoir publié la nouvelle version sous `/latest-version.json` à la même URL (Vercel route automatiquement vers le dernier déploiement, donc OK).

## Override du versioning

`VITE_CODE_VERSION_ID` peut être défini en env (CI / Vercel) pour forcer une version. Sinon `vite.config.ts` shell `tools/get-version.sh package` au build. Fallback `'dev'` si pas dans un git repo.
