import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2075.29 / #2075.30 — LA CONVERSATION CONSERVE LA VERSION D'AUDIT, LA
 * STRATÉGIE, LES PREMIERS MOUVEMENTS, ET LES INCONNUES.
 *
 * Une conversation ouverte depuis l'audit commercial (« Demander à… ») doit
 * garder ce que l'audit disait AU MOMENT où elle a commencé — pas ce qu'il dit
 * maintenant. `commercial_audit_version`/`chosen_entry_strategy` (`profiles`)
 * bougent avec la PROCHAINE génération ou le PROCHAIN choix : les relire plus
 * tard depuis la conversation raconterait un audit qui a changé depuis,
 * jamais celui qui a ouvert le fil. D'où une COLONNE SUR LA CONVERSATION,
 * posée UNE FOIS, jamais réécrite par une régénération ultérieure — même
 * doctrine que `attached_account_id` (`1795999431572-ChatConversations`) :
 * la conversation ÉTEND le fil, elle ne relit jamais l'état courant d'ailleurs.
 *
 * Une seule colonne JSONB, pas quatre colonnes séparées : les quatre champs
 * naissent ENSEMBLE, au même geste (`attachAuditSnapshot`), et se lisent
 * ENSEMBLE (`ConversationDetailsPanel`) — les séparer inventerait un état
 * intermédiaire (version posée, stratégie pas encore) qui ne peut pas exister.
 *
 * Nullable : une conversation qui ne vient pas de l'audit garde `NULL`,
 * comportement d'avant au byte près (même doctrine que `legal_hold_reason`).
 */
export class ChatConversationAuditSnapshot1796322040100 implements MigrationInterface {
  public name = 'ChatConversationAuditSnapshot1796322040100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_conversations
      ADD COLUMN IF NOT EXISTS audit_snapshot jsonb
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_conversations
      DROP COLUMN IF EXISTS audit_snapshot
    `)
  }
}
