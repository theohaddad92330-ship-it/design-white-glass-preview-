import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Delivery OS — missions, affectations, relevés d'activité (addendum final p71).
 *
 * Deux tables et une jointure, pas un ERP. Le rapport place ce bloc en LATER et
 * pose sa condition : il arrive quand les missions générées par Bellum le
 * justifient. Arbitrage produit du 02/08 : on installe les objets et les
 * workflows — ce qui alimente le commerce — sans la facture à valeur légale.
 *
 * La frontière tient à une asymétrie de risque. Un renouvellement raté coûte une
 * mission ; une facture fausse est un problème juridique. Mentions obligatoires,
 * TVA, numérotation séquentielle sans trou, archivage fiscal, facturation
 * électronique : autant d'obligations qui ne se rattrapent pas par un correctif.
 * Bellum suit donc la marge et les échéances, et laisse l'émission à l'outil
 * comptable.
 *
 * `missions.opportunity_id` est la colonne la plus importante du lot : c'est le
 * seul lien qui permette de dire « ce besoin détecté en mars est devenu cette
 * mission en juin » — donc la seule façon pour le produit de prouver qu'il a
 * servi à quelque chose.
 */
export class DeliveryOs1788290000000 implements MigrationInterface {
  public name = 'DeliveryOs1788290000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS missions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        account_id uuid NOT NULL,
        opportunity_id uuid,
        label text NOT NULL,
        status text NOT NULL,
        started_on date,
        ends_on date,
        daily_rate numeric,
        daily_cost numeric,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // La requête chaude est « qu'est-ce qui finit bientôt dans mon espace ? » :
    // c'est elle qui alimente les alertes J-60 / J-30.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS missions_workspace_ends_idx
      ON missions (workspace_id, status, ends_on NULLS LAST)
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS missions_account_idx ON missions (account_id)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        consultant_id uuid NOT NULL,
        load_percent integer NOT NULL CHECK (load_percent BETWEEN 1 AND 100),
        starts_on date NOT NULL,
        ends_on date,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS mission_assignments_mission_idx ON mission_assignments (mission_id)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_timesheets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        period_month date NOT NULL,
        days numeric NOT NULL CHECK (days >= 0 AND days <= 31),
        status text NOT NULL,
        anomalies jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Un seul relevé par mission et par mois : c'est cette contrainte — et non
    // une vérification applicative — qui empêche deux saisies concurrentes de
    // doubler les jours facturables.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mission_timesheets_period_uniq
      ON mission_timesheets (mission_id, period_month)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
