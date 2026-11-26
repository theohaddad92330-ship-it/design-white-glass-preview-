import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2431.5 (reste, épopée #2886) — le LIEN DE VERSION entre un document RAG
 * remplacé et celui qui le remplace. Système différent de l'empreinte de
 * dédoublonnage (`content_hash`, migration 1796321385100) : celle-ci compare
 * un dépôt à ce qui existe déjà ; celle-ci relie deux dépôts VOLONTAIREMENT
 * distincts dans le temps (« Remplacer / actualiser » une source déjà
 * importée).
 *
 * Décision de forme tranchée sans Louis (26/09 nuit) : sur « Remplacer »,
 * l'ANCIEN document n'est jamais supprimé (doctrine « on archive, on ne
 * supprime pas ») — `archived_at` le date, `replaced_by_id` pointe vers le
 * NOUVEAU document qui l'a remplacé. `RagService.listForWorkspace` exclut
 * un document archivé de « Connaissances » (superseded, jamais montré comme
 * actif) sans jamais effacer la ligne — le contenu reste lisible par son
 * identifiant pour qui le retrouverait ailleurs (citation déjà rendue,
 * historique du copilote).
 *
 * GA-11/GA-12 — cette migration (le schéma) précède le code TypeScript qui
 * écrit ces deux colonnes (`RagService.replaceDocument`). ADDITIVE, nullable,
 * sans contrainte sur les lignes déjà en base : aucun document existant n'est
 * rétroactivement marqué remplacé.
 *
 * Idempotent. `down` non supporté (convention du dépôt).
 */
export class RagDocumentReplacedBy1796321507100 implements MigrationInterface {
  public name = 'RagDocumentReplacedBy1796321507100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS archived_at timestamptz`)
    await queryRunner.query(`ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS replaced_by_id uuid`)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_documents_replaced_by_id
        ON rag_documents (replaced_by_id)
        WHERE replaced_by_id IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
