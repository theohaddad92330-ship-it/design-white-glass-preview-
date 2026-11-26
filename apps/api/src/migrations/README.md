# Migrations — apps/api

Une migration NEUVE prend un horodatage **supérieur au maximum de la série**, jamais
`Date.now()` : TypeORM exécute les migrations dans l'ordre de leur horodatage, et l'horloge
de développement a dérivé de deux mois devant les horodatages déjà en service — une
migration prise à `Date.now()` s'exécuterait avant des `CREATE TABLE` dont elle dépend, sur
toute base fraîche (donc en CI). Gardé par **GA-372**
(`apps/api/src/architecture/migration-neuve-est-la-plus-grande.spec.ts`) — détail et mesure :
issue #2684. Les 478 migrations déjà en place ne sont pas renumérotées : ce dépôt archive, il
ne réécrit pas ce qui a déjà tourné en production.

**Le geste**, plutôt que de calculer le maximum à la main (ce qui a déjà coûté un décalage de
+6 × 10⁹ ms posé à la main) — `pnpm migration:create` datant le fichier avec `Date.now()`, il
faut renommer ce qu'il rend :

```bash
pnpm --filter @bellum/api migration:next   # → l'horodatage à utiliser
```

Il rend l'horloge réelle dès qu'elle repasse devant la série, ne rend jamais un nombre rond, et
étale deux appels simultanés (trois collisions mesurées le 30/08/2026). Prouvé par
`apps/api/src/database/prochain-horodatage-migration.spec.ts`.
