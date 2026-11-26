import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `provider_costs.environment` — distingue le développement de la production.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Dix colonnes sur `provider_costs`, aucune ne disait l'environnement : les
 * dépenses de développement et de production s'additionnaient dans le même
 * total, et l'alerte de coût quotidien (`COST_ALERT_DAILY_USD`) mesurait les
 * deux à la fois — incapable de dire laquelle avait monté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NULLABLE, SANS DEFAULT — ET C'EST LE POINT QUI COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les lignes déjà en base n'ont jamais connu cette colonne : `ALTER TABLE …
 * ADD COLUMN` sans `DEFAULT` les laisse à NULL, c'est-à-dire « environnement
 * inconnu ». Leur poser 'production' par défaut gonflerait rétroactivement le
 * coût de production de tout l'historique de développement — exactement le
 * zéro silencieux que le reste du registre refuse déjà pour `cost_usd`, version
 * environnement. `ProviderCostService.record()` (écriture NEUVE uniquement)
 * pose la valeur lue sur le process au moment de l'écriture ; rien ne
 * rétro-remplit l'historique.
 */
export class ProviderCostEnvironment1790900000002 implements MigrationInterface {
  public name = 'ProviderCostEnvironment1790900000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE provider_costs ADD COLUMN IF NOT EXISTS environment TEXT`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS provider_costs_environment_idx ON provider_costs (environment)`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
