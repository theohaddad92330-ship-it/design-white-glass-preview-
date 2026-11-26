import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `workspaces.document_signature` et `workspaces.document_footer` — Réglages › Mon espace › Marque & documents
 * (maquette `settings-espace`, N5, Théo V22 — Louis 22/10/2026).
 *
 * La SIGNATURE que l'espace propose en fin de document et le PIED de document répété en bas de chaque page des
 * dossiers de compétences (Word et PDF). Deux colonnes de plus sur la table existante, NULLABLES : un espace qui n'a
 * rien posé n'a ni signature ni pied — « aucun » est une réponse honnête, jamais une valeur devinée.
 * Les bornes SQL (600 / 300 caractères) sont posées AVANT le code qui écrit (GA-11/GA-12) et recopient celles du DTO.
 */
export class WorkspaceDocumentIdentity1796574800005 implements MigrationInterface {
  name = 'WorkspaceDocumentIdentity1796574800005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS document_signature text`)
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS document_footer text`)
    await queryRunner.query(`
      ALTER TABLE workspaces ADD CONSTRAINT workspaces_document_signature_len
        CHECK (document_signature IS NULL OR char_length(document_signature) <= 600)
    `)
    await queryRunner.query(`
      ALTER TABLE workspaces ADD CONSTRAINT workspaces_document_footer_len
        CHECK (document_footer IS NULL OR char_length(document_footer) <= 300)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_document_footer_len`)
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_document_signature_len`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS document_footer`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS document_signature`)
  }
}
