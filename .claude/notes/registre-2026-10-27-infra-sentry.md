# Registre — lot INFRA-SENTRY (vague L, 27/10/2026)

| Point | État | Preuve en recette |
| --- | --- | --- |
| #4616.1 — le journal dit l'état du pool au checkout timeout (tenues / plafond / libres / en file, 1×/min, compteurs seuls) | livré | Railway → journaux API pendant une saturation : `Postgres checkout timeout — pool 5/5 connexions, 0 libres, 3 en file` |
| #4616.2 — timeout d'acquisition borné | déjà là | `database.module.ts` `buildDbPoolExtra` : `connectionTimeoutMillis: 10_000` ; plafond `decidePoolMax` (`pool-sizing.ts`) |
| #4616.3 — cause « deuxième connexion prise sous transaction » (bulkInsert, phase 3) | déjà là | `bulk-insert-pool-4616.spec.ts` |
| #4616.4 — QUI tient la connexion (requête par requête) | reformulé | `pg_stat_activity` agrégé via l'onglet supervision (`postgres-activite.service.ts`) ; pas de requête de diagnostic prise sur un pool saturé |
| #4480.1 — backoff, coupe-circuit, une lecture en vol par fenêtre, une erreur journalisée une fois | déjà là | `railway.client.ts` (`panne`, `enVol`, `avertir`) + `railway.client.spec.ts` « #4480 » |
| #4480.2 — l'écran dit ce qu'il n'a pas pu lire | déjà là | `railway.service.ts` rend `injoignable` + raison fermée ; `nonEvalue` nommé |
| #4472 — DPA : région Railway | déjà là | `dpa.md` / `dpa-a-signer.md` : europe-west4 ; `legal-docs/railway-region.spec.ts` |
| #4554 — failles `high` | déjà là | `pnpm audit --audit-level=high` → code 0 sur main (2 high, dont l'une exclue nommée/datée, commit ab5e179c) ; aucun fichier `.github/workflows/` requis |
