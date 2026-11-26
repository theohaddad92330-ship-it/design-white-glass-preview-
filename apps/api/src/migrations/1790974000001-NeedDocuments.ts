import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `need_documents` — les pièces d'une AFFAIRE, avec leur statut (dossier du
 * 26/08, image 02 — fiche besoin, section « Documents »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `need_document` / `NeedDocument` : zéro occurrence dans `apps/api/src` et
 * `packages/contracts/src` avant ce lot. `openNeedRowSchema`
 * (`packages/contracts/src/schemas/open-needs.ts`) porte vingt-huit champs et
 * aucun ne dit « où en est le devis », « la NDA est-elle signée » — la fiche
 * d'un besoin ne pouvait montrer que ce qui manquait, jamais ce qui a déjà
 * circulé chez le client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RATTACHÉ AU BESOIN, PAS AU PROJET
 * ─────────────────────────────────────────────────────────────────────────────
 * Un devis ou une NDA porte sur UN rôle précis quand un projet en porte
 * plusieurs — même raisonnement que `submissions.need_id`
 * (`1789382641057-Submissions`). `ON DELETE CASCADE` : un document sans besoin
 * ne veut plus rien dire, contrairement à un besoin qu'on veut pouvoir
 * consulter sans ses documents.
 *
 * `status` est un texte contraint, pas un enum PostgreSQL : la leçon de GA-08
 * (un enum PostgreSQL ne perd jamais de valeur et n'en insère jamais au
 * milieu) coûte cher à chaque ajout, alors qu'un `CHECK` se réécrit dans une
 * migration ultérieure sans toucher aux lignes existantes.
 */
export class NeedDocuments1790974000001 implements MigrationInterface {
  public name = 'NeedDocuments1790974000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS need_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        need_id uuid NOT NULL REFERENCES project_needs(id) ON DELETE CASCADE,
        kind text NOT NULL,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT need_documents_kind_check CHECK (kind IN ('quote', 'nda', 'master_agreement', 'other')),
        CONSTRAINT need_documents_status_check CHECK (status IN ('draft', 'sent', 'pending', 'signed', 'refused'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS need_documents_need_idx ON need_documents (need_id, created_at DESC)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`, comme
    // toutes les tables filles d'un besoin.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS need_documents_workspace_idx ON need_documents (workspace_id)`)
    await queryRunner.query(`
      COMMENT ON TABLE need_documents IS
        'Les pieces d''une affaire (devis, NDA, contrat cadre) et leur statut - fiche besoin, dossier du 26/08 image 02. Rattachees au BESOIN (need_id), pas au projet : un role precis, pas l''affaire entiere.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS need_documents`)
  }
}
