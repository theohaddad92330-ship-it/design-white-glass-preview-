import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3404.5 — LE LIEN ENTRE UNE PRÉSENCE (`account_partners`) ET LA RELATION
 * GOUVERNÉE (`partner_relations`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE, DÉJÀ NOMMÉ AVANT CETTE MIGRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `partner-pipeline.service.ts` (docblock de `UNCOLLECTED_ON_PARTNER_RELATIONS`)
 * constatait déjà qu'aucune colonne ne relie une présence rang 2 sur un compte
 * (`account_partners`, « une ESN est en place CHEZ ce compte ») à MA relation
 * gouvernée avec cette ESN (`partner_relations` : marge plancher, partage,
 * qui possède le compte, qui possède le consultant, clause de
 * non-sollicitation, délais de paiement, durée, conditions de sortie…) — et
 * documentait que la câbler « demande une colonne neuve — un
 * `partner_relation_id`… — donc une migration ». C'est cette migration.
 *
 * Additive, nullable : une présence existante naît NON liée (`null`), jamais
 * rapprochée par nom (le rapprochement textuel a déjà été écarté dans le même
 * docblock — deux tables sans SIREN commun). Le lien se pose par un geste
 * humain, dans `PartnersService.qualify` — jamais deviné ici.
 */
export class AccountPartnerRelationLink1796409390001 implements MigrationInterface {
  name = 'AccountPartnerRelationLink1796409390001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_partners
        ADD COLUMN IF NOT EXISTS partner_relation_id uuid
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_account_partners_partner_relation_id
        ON account_partners (partner_relation_id)
        WHERE partner_relation_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_account_partners_partner_relation_id`)
    await queryRunner.query(`
      ALTER TABLE account_partners
        DROP COLUMN IF EXISTS partner_relation_id
    `)
  }
}
