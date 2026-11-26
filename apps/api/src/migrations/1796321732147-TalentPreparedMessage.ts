import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2185.51 — « Préparer un message » depuis la fiche consultant.
 *
 * Table NEUVE et SÉPARÉE de `outreach_messages` : ce dernier a `contact_id`
 * NOT NULL au cœur de ses séquences, versions et preuves d'approbation — le
 * généraliser à une seconde entité est un chantier à part (revue produit),
 * pas un ajout de fin de lot. `talent_prepared_messages` ne porte qu'un
 * brouillon : aucune séquence, aucune version, aucun envoi.
 *
 * GA-11/GA-12 : la table (et sa contrainte SQL) arrive AVANT le code qui
 * l'écrit — service et écran suivent dans le même lot, jamais avant elle.
 *
 * `prepared_by` vers `auth.users(id) ON DELETE SET NULL` : le départ d'un
 * membre ne supprime pas le brouillon (on archive, on ne supprime pas), il
 * en anonymise seulement l'auteur.
 */
export class TalentPreparedMessage1796321732147 implements MigrationInterface {
  public name = 'TalentPreparedMessage1796321732147'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS talent_prepared_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consultant_id uuid NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
        workspace_id uuid,
        channel text NOT NULL,
        subject text,
        body text NOT NULL,
        prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_talent_prepared_messages_consultant
        ON talent_prepared_messages (consultant_id, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS talent_prepared_messages`)
  }
}
