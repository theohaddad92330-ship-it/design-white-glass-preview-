import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le niveau d'EFFORT d'un compte (tome 5 §28).
 *
 * Une colonne de plus sur `accounts`, et il faut dire pourquoi ce n'en est pas
 * une de trop. Le dossier porte déjà deux axes voisins :
 *
 * | Colonne | Question |
 * | --- | --- |
 * | `priority_gate` | ai-je DÉCIDÉ de travailler ce compte ? |
 * | `commercial_status` | où en est la RELATION ? |
 * | `sprint` (ici) | combien d'ÉNERGIE j'y mets cette semaine ? |
 *
 * Les trois se croisent : un compte priorisé, en veille, travaillé au volume
 * est un état parfaitement cohérent. Les fondre obligerait à choisir entre
 * « décidé » et « intense », qui ne sont pas la même chose.
 *
 * `NULL` par défaut, délibérément : aucun compte existant n'entre dans un
 * sprint sans que quelqu'un l'y mette. Un remplissage d'office ferait apparaître
 * quatre-vingts comptes dans un board qui n'en accepte que huit au premier
 * niveau.
 */
export class AccountSprint1789996184270 implements MigrationInterface {
  name = 'AccountSprint1789996184270'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sprint text`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sprint_entered_at timestamptz`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sprint_exit_reason text`)
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP CONSTRAINT IF EXISTS accounts_sprint_check,
        ADD CONSTRAINT accounts_sprint_check
        CHECK (sprint IS NULL OR sprint IN ('focus', 'extension', 'volume', 'no_go'))
    `)
    // Le plafond du Focus se vérifie par un COMPTE, à chaque entrée : sans
    // index, chaque déplacement relit tous les comptes de l'espace.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS accounts_sprint_idx ON accounts (workspace_id, sprint)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_sprint_check`)
    await queryRunner.query(`DROP INDEX IF EXISTS accounts_sprint_idx`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS sprint_exit_reason`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS sprint_entered_at`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS sprint`)
  }
}
