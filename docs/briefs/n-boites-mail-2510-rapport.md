# Rapport — #4546 Plusieurs boîtes mail par commercial

**Branche** : `claude/n-boites-mail-2510`  
**SHAs** : `fa969734`, `abc536dc`

## Fichiers modifiés

- `apps/api/src/migrations/20261025100000-MultiMailboxConnections.ts` — migration
- `apps/api/src/migrations/__tests__/20261025100000-MultiMailboxConnections.spec.ts`
- `apps/api/src/common/util/personal-connection.ts` — helpers `findConnectionByMailbox`, `findAllPersonalConnections`
- `apps/api/src/database/entities/google-connection.entity.ts` — index + `scope_type`
- `apps/api/src/database/entities/microsoft-connection.entity.ts` — idem
- `apps/api/src/modules/google/google.service.ts` — `listConnections`, `disconnect(id?)`
- `apps/api/src/modules/google/google.service.spec.ts`
- `apps/api/src/modules/microsoft/microsoft.service.ts` — idem
- `apps/api/src/modules/microsoft/microsoft.service.spec.ts`
- `apps/api/src/modules/google/google.controller.ts` — `GET /connections`, `DELETE /:id?`
- `apps/api/src/modules/microsoft/microsoft.controller.ts` — idem

## Tests lancés (rouge -> vert)

- `MultiMailboxConnections20261025100000` — 10 tests (migration idempotente, up/down)
- `GoogleService` — 38 tests (dont 3 nouveaux multi-boîtes)
- `MicrosoftService` — 16 tests (dont 3 nouveaux multi-boîtes)
- **Total** : 61 tests, tous verts

## Ce qui est livré

1. **Migration** : index unique `(user_id, provider, external_account_id)` au lieu de `(user_id, provider)`
2. **Backwards compat** : `scope_type` distingue `inherited_shared` (existant) de `personal` (nouveau)
3. **Services** : `upsertConnection` cherche par `external_account_id`, `listConnections`, `disconnect(id?)`
4. **Routes** : `GET /google/connections`, `DELETE /google/:id?` (idem Microsoft)

## Ce qui n'est pas fait

- **Frontend** : l'écran Intégrations n'affiche pas encore la liste des boîtes — hors périmètre VM (4 vCPU, pas de Node 22)
- **Sélection de l'expéditeur** : la route d'envoi utilise toujours la première connexion — à faire en frontend
- **Demo seeding** : `google_connections` et `microsoft_connections` sont vides à dessein (pas de compte réel en démo)

## Questions

Aucune — le brief était complet.
