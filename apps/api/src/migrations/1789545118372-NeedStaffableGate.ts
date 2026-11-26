import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La porte G3 — ce besoin est staffable, ou il ne l'est pas (PDF 2 §7.6).
 *
 * La porte était DÉCLARÉE au catalogue des huit depuis le 19/08 et n'avait
 * aucun appelant : `need_staffable` n'apparaissait que dans une migration et un
 * enum. Une porte nommée et jamais franchie est une case à cocher.
 *
 * Ce que le refus produit, et qui n'existait nulle part : le **taux de besoins
 * refusés PAR CAUSE**. Le §7.6 le dit mieux que n'importe quel commentaire —
 * « le taux de besoins refusés par cause dit à l'ESN ce qu'elle ne sait pas
 * faire. C'est un KPI stratégique, pas une statistique de rejet. » Sans motif
 * obligatoire, ce chiffre n'existe pas.
 *
 * `unknown` est le défaut, et c'est une RÉPONSE : « la question n'a pas encore
 * été posée ». La distinguer de « non » compte — l'un se traite, l'autre est
 * tranché.
 */
export class NeedStaffableGate1789545118372 implements MigrationInterface {
  name = 'NeedStaffableGate1789545118372'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_needs
        ADD COLUMN IF NOT EXISTS staffable text NOT NULL DEFAULT 'unknown',
        ADD COLUMN IF NOT EXISTS staffable_reason text,
        ADD COLUMN IF NOT EXISTS staffable_decided_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_staffable_check CHECK (
        staffable IN ('unknown','yes','no')
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS project_needs_staffable_idx ON project_needs (workspace_id, staffable)
    `)

    // Le catalogue de motifs de non-staffabilité, même patron que les motifs de
    // perte et d'écartement : par espace, éditable, jamais supprimé quand il sert.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS need_unstaffable_reasons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        label text NOT NULL,
        archived boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS need_unstaffable_reasons_unique
        ON need_unstaffable_reasons (workspace_id, lower(label))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS need_unstaffable_reasons`)
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_staffable_check`)
    await queryRunner.query(`
      ALTER TABLE project_needs
        DROP COLUMN IF EXISTS staffable,
        DROP COLUMN IF EXISTS staffable_reason,
        DROP COLUMN IF EXISTS staffable_decided_at
    `)
  }
}
