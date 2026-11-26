import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Audit IA M6 — les tables porteuses de secrets n'avaient pas de RLS dans `public`.
 *
 * `oauth_*` (codes, refresh tokens, consentements), `api_keys` (hachages de clés),
 * `google_connections` (jetons AES-GCM) et `user_sessions` (identifiant d'appareil = valeur du
 * cookie `bellum_did`) étaient laissées sans RLS, et Supabase accorde par défaut tous les
 * droits à `anon` / `authenticated` sur `public` : une clé anon qui fuit permettait à PostgREST
 * de les lire et de les écrire.
 *
 * ACCÈS RÉEL VÉRIFIÉ (audit du 13/10/2026) : ces sept tables ne sont lues que par l'API NestJS
 * via TypeORM (entités `database/entities/*`, connexion Postgres directe, rôle propriétaire qui
 * contourne la RLS) ; aucun `supabase.from('<table>')`, aucun appel du service IA, aucun accès
 * du navigateur. Il n'y a donc PAS de policy propriétaire à poser : `ENABLE ROW LEVEL
 * SECURITY` sans AUCUNE policy refuse tout à `anon` / `authenticated`, et `service_role`
 * (BYPASSRLS) comme le rôle de l'API passent. `REVOKE ALL` retire de surcroît le droit
 * d'exposition PostgREST (défense en profondeur).
 *
 * Si un futur accès navigateur à l'une d'elles apparaît, il passe par l'API, pas par une policy.
 *
 * Idempotente (ENABLE/REVOKE rejouables). Réversible : `down` rend l'état précédent (RLS
 * désactivée, droits Supabase par défaut rétablis).
 */
const SECRET_TABLES = [
  'oauth_clients',
  'oauth_authorization_codes',
  'oauth_refresh_tokens',
  'oauth_consents',
  'api_keys',
  'google_connections',
  'user_sessions',
] as const

export class SecretTablesRowLevelSecurity1796541542000 implements MigrationInterface {
  public name = 'SecretTablesRowLevelSecurity1796541542000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of SECRET_TABLES) {
      await queryRunner.query(`ALTER TABLE IF EXISTS ${table} ENABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`
        DO $$ BEGIN
          IF to_regclass('public.${table}') IS NOT NULL THEN
            REVOKE ALL ON public.${table} FROM anon, authenticated;
          END IF;
        END $$
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of SECRET_TABLES) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF to_regclass('public.${table}') IS NOT NULL THEN
            GRANT ALL ON public.${table} TO anon, authenticated;
          END IF;
        END $$
      `)
      await queryRunner.query(`ALTER TABLE IF EXISTS ${table} DISABLE ROW LEVEL SECURITY`)
    }
  }
}
