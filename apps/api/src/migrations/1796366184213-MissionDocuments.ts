import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `mission_documents` — les pièces d'une MISSION (contrat signé, avenant,
 * NDA) et leur statut. #2193.51 (épopée #2953) : le dossier mission n'avait
 * aucun moyen de dire « le contrat est signé » ou « l'avenant est parti » à
 * son propre niveau — aucun système de documents générique n'existait dans
 * ce dépôt avant `project_documents` (#2171.24, `1796321404173`), qui couvre
 * l'OPPORTUNITÉ, pas la mission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RATTACHÉ À LA MISSION, PAS À L'OPPORTUNITÉ NI AU BESOIN
 * ─────────────────────────────────────────────────────────────────────────────
 * `project_documents.project_id` couvre déjà l'affaire ; une pièce propre à
 * l'EXÉCUTION (le contrat signé de CETTE mission précise, ses avenants) n'a
 * de sens qu'au niveau de la mission — une opportunité peut porter plusieurs
 * missions (reconductions), chacune avec son propre contrat.
 * `ON DELETE CASCADE` : même raisonnement que `project_documents` — un
 * document sans mission ne veut plus rien dire.
 *
 * `status` reste un texte contraint (pas un enum PostgreSQL), même leçon de
 * GA-08 que `project_documents`/`need_documents` : un `CHECK` se réécrit
 * sans toucher aux lignes existantes, un enum PostgreSQL non.
 *
 * ⚠️ PAS de colonne `storage_object_id` dans cette migration : cette tranche
 * suit kind/name/status, elle ne porte aucun fichier — voir le docblock de
 * `mission-document.ts` (`@bellum/contracts`) pour la raison et ce qui reste.
 */
export class MissionDocuments1796366184213 implements MigrationInterface {
  public name = 'MissionDocuments1796366184213'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        kind text NOT NULL,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_documents_kind_check CHECK (kind IN ('contract', 'amendment', 'nda', 'other')),
        CONSTRAINT mission_documents_status_check CHECK (status IN ('draft', 'sent', 'pending', 'signed', 'refused'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS mission_documents_mission_idx ON mission_documents (mission_id, created_at ASC)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`, comme
    // toutes les tables filles d'une mission.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS mission_documents_workspace_idx ON mission_documents (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE mission_documents IS
        'Les pieces d''une mission (contrat signe, avenant, NDA) et leur statut - #2193.51. Rattachees a la MISSION (mission_id), pas a l''opportunite : project_documents couvre deja l''affaire.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_documents`)
  }
}
