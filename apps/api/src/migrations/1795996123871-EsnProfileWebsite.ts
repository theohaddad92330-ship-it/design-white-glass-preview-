import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2640.2 — le site de l'entreprise devient une réponse comme les autres.
 *
 * Une colonne ADDITIVE, NULLABLE : le questionnaire ne bloque jamais sur ce
 * champ (une ESN sans site public reste un profil valide), et une ligne
 * écrite avant ce lot lit simplement `NULL`, jamais une valeur devinée.
 *
 * `text` libre comme `esn_name` : pas de contrainte CHECK, la valeur est une
 * URL résolue par `esn_prefill.pick_website` (registre/SIREN → domaine
 * d'e-mail → recherche par nom) ou tapée à la main.
 */
export class EsnProfileWebsite1795996123871 implements MigrationInterface {
  name = 'EsnProfileWebsite1795996123871'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS esn_website text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS esn_website;
    `)
  }
}
