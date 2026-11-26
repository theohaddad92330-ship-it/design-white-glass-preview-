import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3282 / #3263.30 (décision Louis 10/10) — LE NIVEAU D'ENTRÉE DU COMITÉ
 * D'ACHAT, DÉCLARÉ.
 *
 * « Interlocuteur trop haut » n'avait aucune référence : le niveau
 * hiérarchique se déduit du titre, l'offre est du texte libre du modèle. Le
 * commercial DÉCLARE l'échelon où son offre se vend, dans une liste fermée
 * (`c_level` / `direction` / `manager` / `operational`) — jamais déduit, jamais
 * rempli par le système. Nullable, aucun backfill : « non déclaré » n'est aucun
 * échelon, et sans lui rien n'est signalé « trop haut ».
 *
 * GA-11/GA-12 — cette migration ARRIVE AVANT le code qui écrit la valeur.
 */
export class AccountCommitteeEntryLevel1796438000011 implements MigrationInterface {
  name = 'AccountCommitteeEntryLevel1796438000011'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS committee_entry_level text`)
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD CONSTRAINT accounts_committee_entry_level_check
        CHECK (committee_entry_level IS NULL OR committee_entry_level IN ('c_level','direction','manager','operational'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP CONSTRAINT IF EXISTS accounts_committee_entry_level_check,
        DROP COLUMN IF EXISTS committee_entry_level
    `)
  }
}
