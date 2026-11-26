import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4546 — Plusieurs boîtes mail par commercial (Google et Outlook).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REVIENT PARTIELLEMENT SUR LE PARTAGE D'ÉQUIPE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les docblocks de `google-connection.entity.ts:12-15` et
 * `microsoft-connection.entity.ts:11-14` disaient que les connexions étaient
 * partagées par l'équipe (`workspace_id`), `user_id` n'étant qu'une attribution.
 *
 * Décision de Louis du 25/10/2026 : les boîtes sont rattachées au COMMERCIAL,
 * et lui seul les voit. Pas de boîte d'équipe partagée.
 *
 * Les connexions DÉJÀ POSÉES gardent leur comportement (on archive, on ne
 * supprime pas) — distinguées par `scope_type = 'inherited_shared'`.
 * Les NOUVELLES sont personnelles (`scope_type = 'personal'`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INDEX UNIQUE S'ÉLARGIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ancien index `(user_id, provider)` interdisait la seconde boîte.
 * Le nouveau `(user_id, provider, external_account_id)` permet plusieurs
 * boîtes par fournisseur, identifiées par leur adresse/id externe.
 *
 * Pour l'existant avec `external_account_id` NULL (les scopes par défaut ne
 * donnent pas accès au profil), on remplit avec l'UUID de la connexion — ce que
 * la table sait déjà. Une connexion existante garde son identifiant synthétique
 * et ne rentre pas en collision avec une nouvelle boîte réelle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ORDRE DES OPÉRATIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Ajouter `scope_type` aux deux tables
 * 2. Marquer l'existant comme `inherited_shared`
 * 3. Remplir `external_account_id` depuis l'UUID pour les NULL
 * 4. Créer le nouvel index unique (AVANT de retirer l'ancien, pour ne jamais
 *    être sans contrainte)
 * 5. Retirer l'ancien index unique
 *
 * Idempotente (IF NOT EXISTS / IF EXISTS) : rejouable sans dégât.
 */
export class MultiMailboxConnections20261025100000 implements MigrationInterface {
  public name = 'MultiMailboxConnections20261025100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Ajouter scope_type aux deux tables
    await queryRunner.query(`
      ALTER TABLE google_connections
        ADD COLUMN IF NOT EXISTS scope_type text
        CONSTRAINT google_connections_scope_type_check
        CHECK (scope_type IN ('personal', 'inherited_shared'))
    `)
    await queryRunner.query(`
      ALTER TABLE microsoft_connections
        ADD COLUMN IF NOT EXISTS scope_type text
        CONSTRAINT microsoft_connections_scope_type_check
        CHECK (scope_type IN ('personal', 'inherited_shared'))
    `)

    // 2. Marquer l'existant comme inherited_shared (décision antériorité 25/10)
    await queryRunner.query(`
      UPDATE google_connections SET scope_type = 'inherited_shared'
      WHERE scope_type IS NULL
    `)
    await queryRunner.query(`
      UPDATE microsoft_connections SET scope_type = 'inherited_shared'
      WHERE scope_type IS NULL
    `)

    // 3. Remplir external_account_id depuis l'UUID pour les connexions sans identifiant
    await queryRunner.query(`
      UPDATE google_connections SET external_account_id = 'legacy:' || id::text
      WHERE external_account_id IS NULL
    `)
    await queryRunner.query(`
      UPDATE microsoft_connections SET external_account_id = 'legacy:' || id::text
      WHERE external_account_id IS NULL
    `)

    // 4. Créer le nouvel index unique AVANT de retirer l'ancien (GA-12)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS google_connections_multi_mailbox_uidx
        ON google_connections (user_id, provider, external_account_id)
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS microsoft_connections_multi_mailbox_uidx
        ON microsoft_connections (user_id, provider, external_account_id)
    `)

    // 5. Retirer l'ancien index unique
    await queryRunner.query(`DROP INDEX IF EXISTS google_connections_user_provider_uidx`)
    await queryRunner.query(`DROP INDEX IF EXISTS microsoft_connections_user_provider_uidx`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurer l'ancien index unique AVANT de retirer le nouveau
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS google_connections_user_provider_uidx
        ON google_connections (user_id, provider)
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS microsoft_connections_user_provider_uidx
        ON microsoft_connections (user_id, provider)
    `)

    // Retirer le nouvel index multi-boîtes
    await queryRunner.query(`DROP INDEX IF EXISTS google_connections_multi_mailbox_uidx`)
    await queryRunner.query(`DROP INDEX IF EXISTS microsoft_connections_multi_mailbox_uidx`)

    // Retirer scope_type (les données sont perdues mais c'est un rollback)
    await queryRunner.query(`ALTER TABLE google_connections DROP COLUMN IF EXISTS scope_type`)
    await queryRunner.query(`ALTER TABLE microsoft_connections DROP COLUMN IF EXISTS scope_type`)

    // Note: external_account_id reste avec les valeurs legacy:*, ce qui est OK
    // car l'ancien index ne les utilise pas et elles ne gênent pas.
  }
}
