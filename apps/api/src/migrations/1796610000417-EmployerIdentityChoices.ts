import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4419.8 — le choix de l'entreprise PAR UN COMMERCIAL, sur une ligne « Plusieurs entreprises portent ce nom ».
 *
 * Une ligne par (espace, nom normalisé) : le choix est gardé POUR L'ESPACE, jamais partagé avec un autre
 * (cloisonnement #4791.3), et gagne toujours sur le calcul (doctrine : la correction humaine gagne). La clé
 * primaire composite EST la portée — choisir deux fois le même nom remplace le choix. Le SIREN est contraint à
 * 9 chiffres dès la création (GA-11/GA-12) : la migration est déployée avant le code qui écrit.
 */
export class EmployerIdentityChoices1796610000417 implements MigrationInterface {
  name = 'EmployerIdentityChoices1796610000417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employer_identity_choices (
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name_key text NOT NULL,
        siren text NOT NULL,
        legal_name text NULL,
        chosen_by uuid NOT NULL,
        chosen_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, name_key),
        CONSTRAINT employer_identity_choices_siren_check CHECK (siren ~ '^[0-9]{9}$')
      )
    `)
    await queryRunner.query(`ALTER TABLE employer_identity_choices ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS employer_identity_choices`)
  }
}
