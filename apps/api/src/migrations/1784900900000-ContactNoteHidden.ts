import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Add a free-form commercial `note` and a soft-hide `hidden` flag on contacts
 * (Théo P0 « Fiche contact » : les onglets vides doivent proposer une action —
 * enrichir / note / masquer). Hidden contacts are excluded from the default
 * `GET /contacts` list but stay reachable by id.
 *
 * SAFE : ajouts de colonnes nullable / avec défaut, aucun backfill destructif.
 * Les lignes existantes récupèrent `hidden = false` via le DEFAULT.
 */
export class ContactNoteHidden1784900900000 implements MigrationInterface {
  public name = 'ContactNoteHidden1784900900000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS note text,
      ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS hidden`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS note`)
  }
}
