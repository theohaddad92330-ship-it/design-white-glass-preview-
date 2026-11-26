import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `rfp_import_sessions` — #2957 (#2180.53) : un import d'appel d'offres
 * INTERROMPABLE ET REPRENABLE (30/09/2026).
 *
 * LE MANQUE MESURÉ : l'état de l'import (titre, texte collé, aperçu rendu)
 * vivait dans `useState` de `RfpImportFlow` — un rechargement de page, un
 * onglet fermé ou une coupure réseau faisait tout recommencer, alors que
 * l'analyse de plusieurs documents prend des minutes et coûte un appel modèle.
 *
 * UNE session `in_progress` par (espace, personne) — index unique partiel.
 * `confirmed` / `cancelled` restent en base : on archive, on ne supprime pas.
 * Aucun octet de fichier : seuls les noms (`document_names`), `confirm` restant
 * la seule écriture qui range les fichiers sources (#2180.54).
 */
export class RfpImportSessions1796413352817 implements MigrationInterface {
  public name = 'RfpImportSessions1796413352817'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rfp_import_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'in_progress',
        title text NOT NULL DEFAULT '',
        pasted_text text NULL,
        document_names jsonb NOT NULL DEFAULT '[]'::jsonb,
        preview jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT rfp_import_sessions_status_check CHECK (status IN ('in_progress', 'confirmed', 'cancelled'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS rfp_import_sessions_one_in_progress_idx
        ON rfp_import_sessions (workspace_id, user_id) WHERE status = 'in_progress'
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS rfp_import_sessions_workspace_user_status_idx ON rfp_import_sessions (workspace_id, user_id, status)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE rfp_import_sessions IS
        'Un import d''appel d''offres en cours (#2957, #2180.53) : reprenable apres une interruption. Noms de documents seulement, jamais les octets ; confirmed/cancelled se gardent.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS rfp_import_sessions`)
  }
}
