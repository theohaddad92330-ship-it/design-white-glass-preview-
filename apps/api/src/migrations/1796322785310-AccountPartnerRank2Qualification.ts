import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2316.22-.27 (épopée #2956) — LES CINQ CRITÈRES QUI QUALIFIENT UN RANG 2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2316 demande qu'un rang 2 soit qualifié sur cinq critères (compte/périmètre
 * accessible, brief précis, interlocuteur responsable, économie claire,
 * prochaines étapes) avant tout CV/positionnement — règle NO-GO. Aucune des
 * cinq colonnes n'existe sur `account_partners` (vérifié `git grep` sur
 * origin/main) : le moteur de qualification (`qualifyRank2`,
 * `packages/contracts/src/schemas/partner.ts`) n'a rien à lire tant qu'elles
 * n'existent pas.
 *
 * GA-11/GA-12 — cette migration ARRIVE AVANT `PartnersService.qualify` (même
 * commit, mais dans l'ordre : la table s'élargit, le code lit ensuite).
 *
 * Chaque colonne est un booléen NULLABLE, jamais `NOT NULL DEFAULT false` :
 * `null` = « non mesuré », `false` = « mesuré et absent ». Confondre les deux
 * ferait dire « non » à un critère que personne n'a encore regardé — exactement
 * la probabilité déguisée que la doctrine refuse.
 *
 * Additif, aucune ligne existante n'est touchée : toute relation déjà en base
 * naît avec ses cinq critères à `null`, donc `qualifyRank2` la classe
 * `incomplete`, jamais `go` ni `no_go` par défaut.
 */
export class AccountPartnerRank2Qualification1796322785310 implements MigrationInterface {
  name = 'AccountPartnerRank2Qualification1796322785310'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_partners
        ADD COLUMN IF NOT EXISTS rank2_scope_accessible boolean,
        ADD COLUMN IF NOT EXISTS rank2_brief_precise boolean,
        ADD COLUMN IF NOT EXISTS rank2_contact_accountable boolean,
        ADD COLUMN IF NOT EXISTS rank2_economics_clear boolean,
        ADD COLUMN IF NOT EXISTS rank2_next_steps_ready boolean
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_partners
        DROP COLUMN IF EXISTS rank2_scope_accessible,
        DROP COLUMN IF EXISTS rank2_brief_precise,
        DROP COLUMN IF EXISTS rank2_contact_accountable,
        DROP COLUMN IF EXISTS rank2_economics_clear,
        DROP COLUMN IF EXISTS rank2_next_steps_ready
    `)
  }
}
