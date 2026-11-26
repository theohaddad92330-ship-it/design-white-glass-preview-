import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3270 (BEL-SC-241) — LE CADRE DE GOUVERNANCE RANG 2, SUR `partner_relations`.
 *
 * GA-11/GA-12 : cette migration ARRIVE AVANT le code qui lit ces colonnes
 * (`PartnerPipelineService`, même lot mais après cette migration dans
 * l'ordre des commits). Dix-sept colonnes additives, toutes NULLABLES :
 * `null` = « personne n'a cadré ce point », jamais une valeur devinée — la
 * même discipline que `AccountPartnerRank2Qualification1796322785310`, sur
 * l'objet voisin `account_partners`.
 *
 * `non_circumvention` n'a pas de colonne ici : c'est `non_solicitation`,
 * déjà posée par `PartnerNonSolicitation1790700003003` sur cette même table
 * (voir le docblock de `packages/contracts/src/schemas/partner-governance.ts`).
 *
 * Les motifs de pause/blocage sont OBLIGATOIRES dès que la date l'est —
 * même geste que `invoice_cancel_reason_check`
 * (`PartnerCommissionAndPayment1790060000001`) : une pause ou un blocage sans
 * raison est exactement ce qu'on ne saura plus relire dans six mois.
 */
export class PartnerRank2Governance1796373928559 implements MigrationInterface {
  name = 'PartnerRank2Governance1796373928559'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partner_relations
        ADD COLUMN IF NOT EXISTS entry_door_scope text,
        ADD COLUMN IF NOT EXISTS accounts_accessible text[],
        ADD COLUMN IF NOT EXISTS accounts_forbidden text[],
        ADD COLUMN IF NOT EXISTS profiles_sought text[],
        ADD COLUMN IF NOT EXISTS domains_covered text[],
        ADD COLUMN IF NOT EXISTS margin_floor_percent numeric,
        ADD COLUMN IF NOT EXISTS margin_share_percent numeric,
        ADD COLUMN IF NOT EXISTS account_ownership text,
        ADD COLUMN IF NOT EXISTS action_ownership text,
        ADD COLUMN IF NOT EXISTS presentation_terms text,
        ADD COLUMN IF NOT EXISTS payment_terms text,
        ADD COLUMN IF NOT EXISTS delay_terms text,
        ADD COLUMN IF NOT EXISTS our_contact_name text,
        ADD COLUMN IF NOT EXISTS our_contact_email text,
        ADD COLUMN IF NOT EXISTS duration_terms text,
        ADD COLUMN IF NOT EXISTS exit_conditions text,
        ADD COLUMN IF NOT EXISTS referencing_proof text,
        ADD COLUMN IF NOT EXISTS confidentiality_level text,
        ADD COLUMN IF NOT EXISTS paused_at timestamptz,
        ADD COLUMN IF NOT EXISTS paused_reason text,
        ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
        ADD COLUMN IF NOT EXISTS blocked_reason text
    `)
    await queryRunner.query(`
      ALTER TABLE partner_relations
        ADD CONSTRAINT partner_paused_reason_check
        CHECK (paused_at IS NULL OR length(coalesce(paused_reason, '')) > 0)
    `)
    await queryRunner.query(`
      ALTER TABLE partner_relations
        ADD CONSTRAINT partner_blocked_reason_check
        CHECK (blocked_at IS NULL OR length(coalesce(blocked_reason, '')) > 0)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE partner_relations DROP CONSTRAINT IF EXISTS partner_blocked_reason_check`)
    await queryRunner.query(`ALTER TABLE partner_relations DROP CONSTRAINT IF EXISTS partner_paused_reason_check`)
    await queryRunner.query(`
      ALTER TABLE partner_relations
        DROP COLUMN IF EXISTS entry_door_scope,
        DROP COLUMN IF EXISTS accounts_accessible,
        DROP COLUMN IF EXISTS accounts_forbidden,
        DROP COLUMN IF EXISTS profiles_sought,
        DROP COLUMN IF EXISTS domains_covered,
        DROP COLUMN IF EXISTS margin_floor_percent,
        DROP COLUMN IF EXISTS margin_share_percent,
        DROP COLUMN IF EXISTS account_ownership,
        DROP COLUMN IF EXISTS action_ownership,
        DROP COLUMN IF EXISTS presentation_terms,
        DROP COLUMN IF EXISTS payment_terms,
        DROP COLUMN IF EXISTS delay_terms,
        DROP COLUMN IF EXISTS our_contact_name,
        DROP COLUMN IF EXISTS our_contact_email,
        DROP COLUMN IF EXISTS duration_terms,
        DROP COLUMN IF EXISTS exit_conditions,
        DROP COLUMN IF EXISTS referencing_proof,
        DROP COLUMN IF EXISTS confidentiality_level,
        DROP COLUMN IF EXISTS paused_at,
        DROP COLUMN IF EXISTS paused_reason,
        DROP COLUMN IF EXISTS blocked_at,
        DROP COLUMN IF EXISTS blocked_reason
    `)
  }
}
