import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le plafond du copilote ne compte plus les réponses aux questions de Laura.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION PART AVANT LE CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit** (GA-11 / GA-12). Ici ce sont deux colonnes, pas
 * une valeur d'enum : elles n'existent nulle part, et le code qui les écrit
 * (`ChatMessagesService`) ne peut pas être déployé avant elles sous peine de
 * mettre `POST /ia/chat/messages` en 500.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE COLONNE DIT, ET POURQUOI ELLES SONT DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Un aller-retour a deux moments, et ils n'arrivent ni dans la même requête ni
 * dans le même sens :
 *
 *  · `precision_request_at` se pose sur le message de l'UTILISATEUR auquel
 *    Laura a répondu par une question de précision. C'est le marquage à la
 *    SOURCE : il est écrit à la fin de `POST /ia/chat`, quand l'enveloppe du
 *    service IA porte `context.clarification` — c'est-à-dire quand le modèle a
 *    appelé `ask_clarification`, seul endroit du produit où « Laura demande »
 *    est un fait machine et non une tournure de phrase.
 *
 *  · `quota_exempt_at` se pose sur le message SUIVANT de l'utilisateur, celui
 *    qui répond à cette question. C'est lui que le plafond ne compte pas.
 *
 * Deux colonnes plutôt qu'une parce que les deux faits sont distincts : « cette
 * demande a provoqué une question » et « ce message était la réponse ». Les
 * confondre rendrait impossible de dire lequel des deux a été payé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES DATES, ET POURQUOI NULLABLES SANS DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un booléen `false` par défaut dirait « ce message a été compté », ce qui est
 * vrai — mais un `NULL` dit « rien ne s'est passé ici », qui est le fait. La
 * date, elle, permet de répondre plus tard à « depuis quand des sauts sont-ils
 * accordés, et à quel rythme » sans rejouer les journaux. Aucun `DEFAULT` :
 * l'existant est correctement décrit par `NULL` — tous les messages déjà en
 * base ont été comptés, et aucun n'a été exonéré.
 *
 * Un index partiel accompagne la lecture : le plafond compte, par utilisateur
 * et sur 24 h glissantes, les seuls messages `role = 'user'` NON exonérés.
 * L'index existant (`chat_messages_thread_idx`) porte `account_id` au milieu,
 * donc il ne sert pas cette question.
 */
export class ChatQuotaPrecisionHop1790860000001 implements MigrationInterface {
  name = 'ChatQuotaPrecisionHop1790860000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Laura a répondu à CE message par une question de précision. NULL = elle
    // n'a rien demandé, ce qui est le cas de tout l'existant.
    await queryRunner.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS precision_request_at timestamptz`)
    // CE message répondait à une question de précision : il ne compte pas
    // contre le plafond quotidien. NULL = il compte.
    await queryRunner.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS quota_exempt_at timestamptz`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_messages_quota_idx
        ON chat_messages (user_id, created_at)
        WHERE role = 'user'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS chat_messages_quota_idx`)
    await queryRunner.query(`ALTER TABLE chat_messages DROP COLUMN IF EXISTS quota_exempt_at`)
    await queryRunner.query(`ALTER TABLE chat_messages DROP COLUMN IF EXISTS precision_request_at`)
  }
}
