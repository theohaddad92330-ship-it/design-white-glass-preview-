import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3586 — la réconciliation nocturne complète du Drive interne date sa dernière réussite
 * (`last_reconciled_at`), affichée par le panneau du back-office. ADDITIF : colonne nullable posée
 * AVANT le code qui l'écrit (GA-11/GA-12) ; les lignes existantes gardent NULL (« jamais réconcilié »).
 */
export class InternalKnowledgeReconciledAt1796431275281 implements MigrationInterface {
  public name = 'InternalKnowledgeReconciledAt1796431275281'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE internal_knowledge_sync_state ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
