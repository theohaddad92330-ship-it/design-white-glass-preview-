import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LES PARCOURS DEVIENNENT UNE LECTURE (#1503).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE FAIT CETTE MIGRATION, ET POURQUOI ELLE NE SUPPRIME RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * La position d'un dossier ne s'écrit plus : elle se dérive de l'objet métier à
 * chaque lecture. Les lignes de `chain_runs` déjà créées à la main portent donc
 * une position qui ne veut plus rien dire — et elle contredirait la dérivation
 * dès la première correction manuelle faite ailleurs.
 *
 * Elles sont ARCHIVÉES, pas effacées : savoir qu'un dossier avait été engagé, et
 * par qui, reste une information. C'est la doctrine du dépôt telle quelle — « on
 * archive, on ne supprime pas » — et les franchissements de porte déjà
 * journalisés dans `decision_gate_crossings` restent intacts et relisibles.
 *
 * `abandon_reason` existe pour que l'archivage porte SA raison. Sans elle, dans
 * six mois, une table entière d'`abandoned` sans motif se lirait comme un
 * abandon massif d'utilisateurs.
 */
export class ChainsDerived1791659427318 implements MigrationInterface {
  public name = 'ChainsDerived1791659427318'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chain_manual_marks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        chain_key text NOT NULL,
        subject_id uuid NOT NULL,
        position integer NOT NULL,
        marked_at timestamptz NOT NULL DEFAULT now(),
        marked_by uuid
      )
    `)
    // Un même geste ne se coche qu'une fois par dossier : sans cette unicité,
    // deux onglets ouverts produiraient deux coches et un compteur « 3/4 » sur
    // une checklist de trois gestes.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS chain_manual_marks_unique
        ON chain_manual_marks (workspace_id, chain_key, subject_id, position)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chain_manual_marks_subject
        ON chain_manual_marks (workspace_id, chain_key, subject_id)
    `)

    // La colonne AVANT l'écriture qui la remplit — dans la même migration, mais
    // dans cet ordre : une valeur qui voyage du code vers la base voit sa
    // contrainte élargie d'abord.
    await queryRunner.query(`ALTER TABLE chain_runs ADD COLUMN IF NOT EXISTS abandon_reason text`)
    await queryRunner.query(`
      UPDATE chain_runs
         SET state = 'abandoned',
             ended_at = COALESCE(ended_at, now()),
             abandon_reason = 'derived_engine_2026_09_05',
             updated_at = now()
       WHERE state <> 'abandoned'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On ne « désarchive » pas : les positions restaurées seraient fausses dès
    // le premier objet qui a bougé depuis. La colonne et la table s'en vont, les
    // lignes restent abandonnées — c'est le seul retour en arrière honnête.
    await queryRunner.query(`DROP TABLE IF EXISTS chain_manual_marks`)
    await queryRunner.query(`ALTER TABLE chain_runs DROP COLUMN IF EXISTS abandon_reason`)
  }
}
