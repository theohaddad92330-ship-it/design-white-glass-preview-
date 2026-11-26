import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3410 (retour bêta #3406-lot) — quatre préférences NOUVELLES sur la fiche
 * consultant, dans le même esprit que `TalentMobilityPreferences` (§8.3) :
 * « une préférence négative est aussi importante qu'une compétence
 * positive » (Louis, retour bêta #3410).
 *
 * ADDITIVE, NULLABLE, sans défaut ni CHECK — texte libre comme
 * `refused_sectors`/`refused_technologies` : aucune taxonomie fermée ne
 * survivrait à deux ESN, et deviner une valeur non saisie fabriquerait une
 * préférence que personne n'a déclarée.
 *
 * - `preferred_client_types` (#3410.10) : le type de client visé.
 * - `refused_clients` (#3410.11) : des clients NOMMÉS refusés par la
 *   personne — distinct de `clientHistoryFlag` (calculé, matching), qui
 *   porte un refus DU client, jamais un refus DE la personne.
 * - `environments_to_avoid` (#3410.13) : un environnement à éviter,
 *   distinct de `refused_technologies` (un outil) et de
 *   `mobility_restrictions` (une contrainte personnelle).
 * - `non_negotiable_conditions` (#3410.14) : la condition qui rend une
 *   mission inacceptable, en clair. Un seul texte, pas un tableau : c'est
 *   une phrase composée, pas une liste de mots-clés.
 */
export class ConsultantPreferenceExtensions1796409400173 implements MigrationInterface {
  name = 'ConsultantPreferenceExtensions1796409400173'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS preferred_client_types text[]`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS refused_clients text[]`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS environments_to_avoid text[]`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS non_negotiable_conditions text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'non_negotiable_conditions',
      'environments_to_avoid',
      'refused_clients',
      'preferred_client_types',
    ]) {
      await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS ${column}`)
    }
  }
}
