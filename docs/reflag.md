# Reflag — feature flags

[Reflag](https://docs.reflag.com/) est notre service de feature flags. Une seule plateforme côté dashboard, deux SDKs côté code (un par runtime) :

| Surface      | Package                                                                      | Version  |
| ------------ | ---------------------------------------------------------------------------- | -------- |
| API (NestJS) | [`@reflag/node-sdk`](https://docs.reflag.com/supported-languages/node-sdk)   | `^1.6.0` |
| Web (React)  | [`@reflag/react-sdk`](https://docs.reflag.com/supported-languages/react-sdk) | `^1.4.8` |

Les flags sont créés dans le dashboard Reflag. Le code n'a qu'à appeler `isEnabled('flag-name', context)` (API) ou `useFlag('flag-name')` (Web).

## Variables d'environnement

| Var                           | Surface | Secret ? | Comportement si vide                                                                          |
| ----------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------- |
| `REFLAG_SECRET_KEY`           | API     | Oui      | Warning au boot, chaque flag retourne `false` (fail open).                                    |
| `VITE_REFLAG_PUBLISHABLE_KEY` | Web     | Non      | Le `<ReflagProvider>` se transforme en pass-through, `useFlag()` retourne `isEnabled: false`. |

Pour récupérer les clés : [app.reflag.com → Settings → App environments](https://app.reflag.com/env-current/settings/app-environments). Une clé par environnement (dev / staging / prod) — ne jamais réutiliser une clé prod en local.

## Côté API (NestJS)

`ReflagModule` est un module global déclaré dans `app.module.ts`. Tu n'as donc rien à importer dans tes propres modules — il suffit d'injecter `ReflagService` :

```ts
import { Injectable } from '@nestjs/common'
import { ReflagService } from '../reflag/reflag.service'

@Injectable()
export class AccountsService {
  constructor(private readonly reflag: ReflagService) {}

  async list(userId: string) {
    if (this.reflag.isEnabled('accounts-pagination-v2', { userId })) {
      return this.listPaginated(userId)
    }
    return this.listLegacy(userId)
  }
}
```

Le service est **fail-open par design** : pas besoin de gérer les cas "Reflag down / mal configuré". `isEnabled` renvoie `false` si le SDK n'a pas pu démarrer ou si le flag est inconnu.

## Côté Web (React)

`<ReflagProvider>` (notre wrapper) est monté dans `App.tsx`, à l'intérieur de `<SessionProvider>`. Le contexte est injecté automatiquement :

- **user** = l'utilisateur de session (`id`, `email`). Le nom d'affichage vit sur le profil, pas sur la session — il n'est pas envoyé.
- **company** = le **workspace** (`id` uuid + `name`), c'est-à-dire l'entité qui porte le plan et les sièges. Un flag peut donc être déployé à une ESN entière d'un coup. La requête réutilise la clé de cache de l'écran Équipe : aucune requête supplémentaire.

Côté API, `companyId` est lui aussi le workspace — les deux surfaces ciblent la même entité.

Dans n'importe quel composant :

```tsx
import { useFlag } from '@reflag/react-sdk'

export function ExportPdfButton() {
  const { isEnabled, track } = useFlag('export-pdf')

  if (!isEnabled) return null
  return <Button onClick={track}>Exporter en PDF</Button>
}
```

`track()` enregistre l'usage côté Reflag (signal d'adoption). Appelle-le quand l'utilisateur active réellement la feature, pas juste au render.

## Backoffice (DM)

L'écran **Feature flags** (`/flags`) évalue les flags pour un `userId` / `workspaceId` donné et répond à la question « la fonctionnalité X est-elle active pour CE client ? ». Il est en **lecture seule** : les flags se créent et se ciblent dans le dashboard Reflag, qui reste la source de vérité — le DM ne la duplique pas.

L'écran distingue explicitement « aucun flag défini » de « Reflag non connecté » (`REFLAG_SECRET_KEY` absente), deux états qui donnent sinon la même liste vide.

## Points d'entrée

- API : [`apps/api/src/modules/reflag/reflag.service.ts`](../apps/api/src/modules/reflag/reflag.service.ts) — singleton SDK, `isEnabled(flag, ctx)`.
- Web : [`apps/web/src/features/reflag/ReflagProvider.tsx`](../apps/web/src/features/reflag/ReflagProvider.tsx) — bridge session + workspace → contexte Reflag.
- Backoffice : `GET /internal/admin/flags` → [`apps/dashboard-manager/src/app/flags/page.tsx`](../apps/dashboard-manager/src/app/flags/page.tsx).
- Env schema : [`packages/contracts/src/schemas/env.ts`](../packages/contracts/src/schemas/env.ts) (`REFLAG_SECRET_KEY`).
- Vite env types : [`apps/web/src/vite-env.d.ts`](../apps/web/src/vite-env.d.ts) (`VITE_REFLAG_PUBLISHABLE_KEY`).
