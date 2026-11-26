import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2323.18 / #2323.22 — la porte PRÉSENTER, LES DEUX CRITÈRES QUI MANQUAIENT
 * (LAU-FINAL-064). Tranchés le 25/09/2026 sans Louis, formes ACTÉES :
 *
 *  · `profile_type_agreement` — trois états, même famille que `staffable`
 *    (migration `1789545118372-NeedStaffableGate`) : `unknown` par défaut,
 *    et c'est une RÉPONSE (« pas encore demandé au client »), jamais un
 *    accord ou un refus deviné.
 *  · `presentation_process` — texte libre, même patron que `constraints`/
 *    `context` : aucune énumération de ses étapes, une décision produit
 *    qu'aucune spec ne donne.
 *
 * Voir `packages/contracts/src/schemas/need-presenter-gate.ts` pour la porte
 * qui les lit ensemble avec les trois critères déjà existants (destinataire,
 * conditions, budget, accord consultant).
 */
export class NeedPresenterGateFields1796321336417 implements MigrationInterface {
  name = 'NeedPresenterGateFields1796321336417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_needs
        ADD COLUMN IF NOT EXISTS profile_type_agreement text NOT NULL DEFAULT 'unknown',
        ADD COLUMN IF NOT EXISTS presentation_process text
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_profile_type_agreement_check CHECK (
        profile_type_agreement IN ('unknown','agreed','not_agreed')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_profile_type_agreement_check`,
    )
    await queryRunner.query(`
      ALTER TABLE project_needs
        DROP COLUMN IF EXISTS profile_type_agreement,
        DROP COLUMN IF EXISTS presentation_process
    `)
  }
}
