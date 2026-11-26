import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3806 — LA SALLE DE DÉMO SERVIE EN SECOURS.
 *
 * Le 07/10/2026, le déploiement de #3801 a changé l'empreinte du semis : toutes
 * les salles sont devenues périmées d'un coup, le pool ne servait que des salles
 * à jour et `/demo/acces` a répondu 503 pendant 26 minutes. Désormais, tant
 * qu'aucune salle à jour n'est prête, une salle LIBRE à l'ancienne empreinte
 * (semis fini, intacte) est servie — et cette colonne le dit : tant que ce
 * bail-là court, la salle n'est jamais re-semée sous son visiteur (ni au
 * battement, ni par un autre réplica dont le balayage aurait décidé avant).
 *
 * Une colonne NULLABLE, sans défaut ni contrainte : additive, NULL sur tout
 * workspace réel et sur toute salle servie normalement.
 */
export class DemoStaleServedAt1796437500001 implements MigrationInterface {
  public name = 'DemoStaleServedAt1796437500001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS demo_stale_served_at timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS demo_stale_served_at`)
  }
}
