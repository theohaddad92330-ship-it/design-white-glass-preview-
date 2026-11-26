import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3586 (lot W2) — le DIGEST du Drive interne : une synthèse (≤ 2 500 jetons) que le service IA préfixe
 * au system prompt des surfaces commerciales sans RAG.
 *
 * ADDITIF : une table neuve, rien d'existant ne bouge. Une ligne par génération ; la ligne COURANTE est
 * celle dont `archived_at` est NULL (au plus une, garantie par l'index unique partiel). Une régénération
 * archive l'ancienne — doctrine « on archive, on ne supprime pas ». `fingerprint` est l'empreinte des
 * fichiers indexés au moment de la génération : tant qu'elle ne change pas, aucun appel modèle.
 * Plomberie de l'éditeur, comme `internal_knowledge_files` : aucun espace ne la lit (RLS activée, aucune
 * politique ; l'API et l'IA passent par le rôle de service).
 */
export class InternalKnowledgeDigest1796432116109 implements MigrationInterface {
  public name = 'InternalKnowledgeDigest1796432116109'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS internal_knowledge_digests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        content text NOT NULL,
        fingerprint text NOT NULL,
        size_chars integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS internal_knowledge_digests_current_idx ON internal_knowledge_digests ((archived_at IS NULL)) WHERE archived_at IS NULL`,
    )
    await queryRunner.query(`ALTER TABLE internal_knowledge_digests ENABLE ROW LEVEL SECURITY`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
