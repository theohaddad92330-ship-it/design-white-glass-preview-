import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `project_documents` — les pièces d'une OPPORTUNITÉ (devis, NDA, contrat
 * cadre) et leur statut. #2171.24 (épopée #2951) : équivalent, côté
 * opportunité, de `need_documents` (`1790974000001-NeedDocuments`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RATTACHÉ AU PROJET, PAS AU BESOIN
 * ─────────────────────────────────────────────────────────────────────────────
 * `need_documents.need_id` porte un devis sur UN RÔLE précis. Une pièce
 * suivie au niveau de l'AFFAIRE (le contrat cadre qui couvre plusieurs rôles,
 * la NDA signée avant même qu'un besoin existe) n'a pas de besoin auquel se
 * rattacher : `project_id` est la seule clé qui tient dans les deux cas.
 * `ON DELETE CASCADE` : même raisonnement que `need_documents` — un document
 * sans opportunité ne veut plus rien dire.
 *
 * `status` reste un texte contraint (pas un enum PostgreSQL), même leçon de
 * GA-08 que `need_documents` : un `CHECK` se réécrit sans toucher aux lignes
 * existantes, un enum PostgreSQL non.
 *
 * ⚠️ PAS de colonne `storage_object_id` dans cette migration : cette tranche
 * suit kind/name/status, elle ne porte aucun fichier — voir le docblock de
 * `project-document.ts` (`@bellum/contracts`) pour la raison et ce qui reste.
 */
export class ProjectDocuments1796321404173 implements MigrationInterface {
  public name = 'ProjectDocuments1796321404173'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        project_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        kind text NOT NULL,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT project_documents_kind_check CHECK (kind IN ('quote', 'nda', 'master_agreement', 'other')),
        CONSTRAINT project_documents_status_check CHECK (status IN ('draft', 'sent', 'pending', 'signed', 'refused'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS project_documents_project_idx ON project_documents (project_id, created_at ASC)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`, comme
    // toutes les tables filles d'une opportunité.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS project_documents_workspace_idx ON project_documents (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE project_documents IS
        'Les pieces d''une opportunite (devis, NDA, contrat cadre) et leur statut - #2171.24. Rattachees au PROJET (project_id), pas au besoin : need_documents couvre deja un role precis.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS project_documents`)
  }
}
