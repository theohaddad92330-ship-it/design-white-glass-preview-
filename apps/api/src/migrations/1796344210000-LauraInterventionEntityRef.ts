import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2995 (#2403.38) — l'ENTITÉ que porte une intervention de Laura, quand elle
 * en a une.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * « L'invalidation sur correction » (une suggestion redevient PÉRIMÉE si un
 * humain corrige, après coup, le fait qui l'a produite) a besoin de savoir
 * QUELLE fiche une trace concerne — aujourd'hui `laura_interventions` ne porte
 * que la CLÉ du catalogue, jamais l'entité métier. GA-11/GA-12 : la colonne
 * précède le code qui l'écrit (`LauraService.plan`).
 *
 * NULLABLE, sans défaut : l'immense majorité des interventions du catalogue
 * (les ~29 sur ~30 qui restent portées par leur seule phrase statique) n'ont
 * et n'auront jamais d'entité — `null` reste leur état ordinaire, jamais une
 * valeur inventée (GA-18/GA-19).
 */
export class LauraInterventionEntityRef1796344210000 implements MigrationInterface {
  public name = 'LauraInterventionEntityRef1796344210000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE laura_interventions ADD COLUMN IF NOT EXISTS entity_type text`)
    await queryRunner.query(`ALTER TABLE laura_interventions ADD COLUMN IF NOT EXISTS entity_id uuid`)
    await queryRunner.query(
      `COMMENT ON COLUMN laura_interventions.entity_type IS '#2403.38 — la fiche que cette intervention concerne (ex. account), quand elle en a une. NULL pour l’immense majorité du catalogue.'`,
    )
    await queryRunner.query(
      `COMMENT ON COLUMN laura_interventions.entity_id IS '#2403.38 — l’identifiant de cette fiche. NULL tant que entity_type l’est aussi.'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE laura_interventions DROP COLUMN IF EXISTS entity_id`)
    await queryRunner.query(`ALTER TABLE laura_interventions DROP COLUMN IF EXISTS entity_type`)
  }
}
