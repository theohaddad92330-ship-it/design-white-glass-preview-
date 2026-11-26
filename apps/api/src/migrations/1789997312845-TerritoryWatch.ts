import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Suivre un territoire (tome 4 §21.3, tome 7 §21.1 `territory_snapshot`).
 *
 * Deux tables, deux rôles qu'il ne faut pas confondre :
 *
 * - `territory_subscriptions` : QUI suit QUOI. Scopée à l'espace — un
 *   territoire suivi est une intention commerciale, pas un fait de marché.
 * - `territory_snapshots` : l'état d'un département à une date. **Sans
 *   `workspace_id`** : le nombre d'offres IT en Haute-Garonne est le même pour
 *   tout le monde, et le stocker par espace multiplierait la donnée par le
 *   nombre de clients pour un résultat identique. C'est la troisième table
 *   partagée du dépôt, et GA-16 exige qu'elle soit déclarée avec cette raison.
 *
 * Pourquoi les photos comptent plus que l'écran : sans historique, l'axe
 * « Volume » du score de débordement n'est **jamais** mesurable — il compare un
 * volume d'offres à une moyenne qui n'existe pas. Chaque photo hebdomadaire
 * construit cette moyenne. La première semaine ne dit rien, la treizième dit
 * tout.
 */
export class TerritoryWatch1789997312845 implements MigrationInterface {
  name = 'TerritoryWatch1789997312845'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS territory_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        department text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Un territoire suivi une seule fois par espace : deux abonnements
    // produiraient deux notifications pour la même variation.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS territory_subscriptions_unique
         ON territory_subscriptions (workspace_id, department)`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS territory_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        department text NOT NULL,
        taken_on date NOT NULL,
        offers integer,
        esn_present integer,
        open_tenders integer,
        awarded_contracts integer,
        buyers_with_incumbent integer,
        top_technologies jsonb NOT NULL DEFAULT '[]'::jsonb,
        esn_hiring jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Une photo par département et par JOUR : deux balayages le même jour ne
    // doivent pas compter double dans une moyenne.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS territory_snapshots_unique
         ON territory_snapshots (department, taken_on)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS territory_snapshots`)
    await queryRunner.query(`DROP TABLE IF EXISTS territory_subscriptions`)
  }
}
