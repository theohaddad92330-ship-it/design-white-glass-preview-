import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Contenu de cadence par touche (annexe méthodo p12 : « une preuve NEUVE par
 * touche »).
 *
 * Les touches de relance email (J+3, J+6, J+9) étaient des rappels datés qui
 * pointaient tous sur le MÊME email initial — une répétition, pas une séquence.
 * La phase 4 rédige désormais un texte propre à chaque touche (relance avec une
 * preuve neuve, preuve sociale, close-loop) ; cette colonne le stocke pour que la
 * carte de cadence l'affiche sous la bonne échéance.
 *
 * Additive et nullable : un dossier antérieur laisse la colonne NULL et la carte
 * reste au comportement historique.
 */
export class ContactCadenceMessages1788021874503 implements MigrationInterface {
  public name = 'ContactCadenceMessages1788021874503'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cadence_messages jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS cadence_messages`)
  }
}
