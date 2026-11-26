import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `commercial_outcomes` — épopée #2787 (#2126.47/.48/.50/.51/.53/.54/.55/.60).
 *
 * Le ledger des OUTCOMES commerciaux : ce qu'un compte ou un contact a
 * PRODUIT (relation qualifiée, partenaire pertinent ou non, contact
 * incorrect, message répondu, consultant positionné, refus), avec sa raison
 * libre (#2126.55).
 *
 * APPEND-ONLY par construction (#2126.60 — un outcome ne réécrit jamais
 * rétroactivement une preuve historique) : aucune colonne `updated_at`,
 * aucune contrainte d'unicité qui forcerait un UPSERT. Une correction
 * s'exprime en AJOUTANT un nouvel outcome daté, jamais en modifiant celui-ci —
 * `CommercialOutcomesService` ne porte que `record`/`list`/`summary`, jamais
 * d'UPDATE ni de DELETE.
 *
 * `account_id` est obligatoire (l'outcome porte toujours sur un compte) ;
 * `contact_id` est NULLABLE — un outcome de partenariat (#2126.48) ou un refus
 * peut porter sur le compte entier, sans contact précis.
 */
export class CommercialOutcomes1796321374213 implements MigrationInterface {
  public name = 'CommercialOutcomes1796321374213'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commercial_outcomes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
        outcome_type text NOT NULL,
        reason text,
        recorded_by uuid NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT commercial_outcomes_type_check CHECK (outcome_type IN (
          'qualified_relationship',
          'partner_relevant',
          'partner_not_relevant',
          'incorrect_contact',
          'message_replied',
          'consultant_positioned',
          'declined'
        ))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS commercial_outcomes_account_idx ON commercial_outcomes (account_id, recorded_at DESC)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS commercial_outcomes_contact_idx ON commercial_outcomes (contact_id) WHERE contact_id IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS commercial_outcomes_workspace_idx ON commercial_outcomes (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE commercial_outcomes IS
        'Ledger append-only des outcomes commerciaux (#2126, epopee #2787) - jamais de mise a jour ni de suppression, une correction est un NOUVEL outcome date.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS commercial_outcomes`)
  }
}
