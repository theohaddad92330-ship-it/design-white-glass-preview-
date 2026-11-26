import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3935.2b (lot M07, 09/10) — LA PROVENANCE PAR CHAMP D'UNE EXPÉRIENCE.
 *
 * `consultant_experiences` (#2793) n'avait aucune mémoire de QUI avait écrit chaque
 * champ : l'écrire depuis la lecture d'un CV aurait pu écraser une expérience saisie
 * à la main sans le détecter — contraire à « une correction humaine gagne toujours »
 * (mesure du lot Z02, #3935.1). `field_provenance` porte, par nom de colonne, la
 * source (`human` / `connector` / `pipeline` / `model`) — la même échelle que la
 * table `field_provenance` des fiches, arbitrée par le même `decideFieldWrite`.
 *
 * Posée AVANT le code qui l'écrit (GA-11/GA-12). Les lignes existantes reçoivent `{}` :
 * provenance INCONNUE, que l'arbitre traite plus haut qu'une lecture de modèle — une
 * expérience saisie avant ce lot n'est donc jamais réécrite par un CV.
 */
export class ConsultantExperienceFieldProvenance1796437900702 implements MigrationInterface {
  public name = 'ConsultantExperienceFieldProvenance1796437900702'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultant_experiences
        ADD COLUMN IF NOT EXISTS field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb
    `)
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'consultant_experiences_field_provenance_object'
        ) THEN
          ALTER TABLE consultant_experiences
            ADD CONSTRAINT consultant_experiences_field_provenance_object
            CHECK (jsonb_typeof(field_provenance) = 'object');
        END IF;
      END $$
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
