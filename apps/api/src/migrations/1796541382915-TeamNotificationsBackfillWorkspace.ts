import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4158.56 — les anciennes notifications d'équipe (`chat_mention`, `chat_action_assigned`,
 * `approval_assigned`) sont nées SANS `workspace_id` et se lisaient donc dans TOUS les espaces
 * de la personne. Quand l'objet qu'elles citent permet de DÉDUIRE leur espace, on le pose :
 *
 *  - un lien `…accountId=<uuid>` : l'espace du compte ;
 *  - sinon un lien `…conversationId=<uuid>` : l'espace du fil de chat.
 *
 * AJOUT SEULEMENT : on ne renseigne que des lignes dont `workspace_id` est NULL, on n'en supprime
 * aucune, on n'en réécrit aucune autre. Ce qu'on ne sait pas déduire (`approval_assigned` pointe sur
 * `/actions`, un lien sans objet) reste à NULL — et ne se lit plus que dans l'espace personnel
 * (voir `NotificationsService.inboxWhere`). Rejouable : une seconde passe ne trouve plus de NULL
 * déductible.
 */
export class TeamNotificationsBackfillWorkspace1796541382915 implements MigrationInterface {
  name = 'TeamNotificationsBackfillWorkspace1796541382915'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE notifications n
         SET workspace_id = a.workspace_id
        FROM accounts a
       WHERE n.workspace_id IS NULL
         AND n.type IN ('chat_mention', 'chat_action_assigned', 'approval_assigned')
         AND n.link ~ 'accountId=[0-9a-fA-F-]{36}'
         AND a.id::text = lower(substring(n.link from 'accountId=([0-9a-fA-F-]{36})'))
         AND a.workspace_id IS NOT NULL
    `)
    await queryRunner.query(`
      UPDATE notifications n
         SET workspace_id = c.workspace_id
        FROM (
          SELECT conversation_id::text AS conversation_id, min(workspace_id::text)::uuid AS workspace_id
            FROM chat_messages
           WHERE conversation_id IS NOT NULL AND workspace_id IS NOT NULL
           GROUP BY conversation_id
          HAVING count(DISTINCT workspace_id) = 1
        ) c
       WHERE n.workspace_id IS NULL
         AND n.type IN ('chat_mention', 'chat_action_assigned', 'approval_assigned')
         AND n.link ~ 'conversationId=[0-9a-fA-F-]{36}'
         AND c.conversation_id = lower(substring(n.link from 'conversationId=([0-9a-fA-F-]{36})'))
    `)
  }

  public async down(): Promise<void> {
    // Une valeur déduite ne se distingue pas d'une valeur posée à la naissance : rien à défaire.
  }
}
