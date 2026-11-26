import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2404.7 — D'OÙ VIENT L'INFORMATION.
 *
 * Une notification ne portait que `title`/`body`/`link` : de QUOI il s'agit et
 * où cliquer, jamais D'OÙ vient l'information. `source` est un texte LIBRE,
 * jamais un de nos fournisseurs d'enrichissement (doctrine : « on nomme ce que
 * l'espace a BRANCHÉ, jamais ce qui NOUS sert ») — ce que le CLIENT a connecté
 * (sa messagerie Gmail/Outlook, son CRM) ou un registre public nommable
 * (BOAMP, DECP), jamais Pappers/Apollo/Brave.
 *
 * GA-11/GA-12 : la colonne précède le code qui l'écrit
 * (`NotificationsService.createNotification`). NULLABLE, sans défaut : une
 * notification déjà créée, ou dont l'émetteur ne sait pas nommer sa source,
 * n'en gagne pas une inventée (GA-18/GA-19).
 *
 * ⚠️ Horodatage repris à l'intégration (GA-372, vague 8) : l'original
 * (1789999589598) reculait sous le maximum déjà en service sur `origin/main`
 * (1795995017405, `WorkspaceSettingsFusion`) — TypeORM l'aurait exécuté AVANT
 * des migrations dont il dépend sur une base fraîche. Repris strictement
 * au-dessus, aucun changement de contenu.
 */
export class NotificationSource1795995841046 implements MigrationInterface {
  public name = 'NotificationSource1795995841046'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS source`)
  }
}
