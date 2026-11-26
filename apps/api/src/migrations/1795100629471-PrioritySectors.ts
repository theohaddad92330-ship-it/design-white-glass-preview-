import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les secteurs PRIORITAIRES — #2041.1 (« cinq niveaux par secteur, pas vingt
 * "prioritaires", relance à deux »).
 *
 * UNE colonne ADDITIVE, `text[]` par défaut vide, comme `reference_sectors`
 * (`1794010756001-OffrePrestationsCredibilite`) : `target_sectors` et
 * `no_go_sectors` ne sont NI renommées NI rétrécies — la doctrine « ajout
 * seulement » (GA-11 / GA-12) et « on archive, on ne supprime pas ». Les cinq
 * niveaux sont une LECTURE de quatre colonnes ensemble
 * (`sectorEngagementLevels`, `@bellum/contracts`), pas une cinquième colonne.
 *
 * ⚠️ Cette colonne voyage du code vers la base AVANT le code qui l'écrit :
 * elle est posée ici, la question du questionnaire (`secteurs.ts`) la remplit
 * ensuite. Une ligne écrite avant ce lot rend `'{}'` — un tableau vide, jamais
 * « zéro secteur prioritaire déclaré » : la relance ne dit rien dessus.
 *
 * Pas dans `TEMPS1_REQUIRED_KEYS` : la porte de complétion serveur ne bouge pas.
 */
export class PrioritySectors1795100629471 implements MigrationInterface {
  name = 'PrioritySectors1795100629471'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS priority_sectors text[] DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS priority_sectors;
    `)
  }
}
