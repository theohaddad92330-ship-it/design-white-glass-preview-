import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les ROUTINES — abonnements et traces d'exécution.
 *
 * Les méta-analyses besoins (03/08/2026) exigent qu'une automatisation
 * programmée soit « visible, modifiable, désactivable et attribuée à un
 * utilisateur ». Le dépôt avait onze `@Cron` en dur : ils tournent, ils
 * envoient, et personne ne peut savoir lesquels sont actifs ni les arrêter.
 *
 * Deux tables, deux rôles distincts :
 *
 * - `routine_subscriptions` — l'abonnement. Une ligne ABSENTE veut dire « jamais
 *   touché » et non « désactivé » : le service applique alors le défaut du
 *   catalogue. Sans cette distinction, activer par défaut une nouvelle routine
 *   la rallumerait chez quelqu'un qui l'avait explicitement coupée.
 *
 * - `routine_runs` — la trace. `run_key` (`utilisateur:routine:jour-local`) porte
 *   l'unicité : le balayeur passe toutes les quinze minutes et un redémarrage —
 *   ou deux replicas — ne doivent pas produire deux envois. L'insertion échoue
 *   au second essai plutôt que de dupliquer.
 *
 * Le catalogue lui-même reste dans le CODE. `routine_key` est donc du TEXT libre
 * et non un enum : retirer une routine du catalogue laisse une ligne orpheline
 * que le service ignore, plutôt qu'une contrainte violée au déploiement.
 *
 * Scoping : par UTILISATEUR et non par espace. Une routine est une habitude
 * personnelle — deux commerciaux du même espace n'ont ni les mêmes horaires ni
 * les mêmes besoins d'alerte.
 */
export class Routines1788800000002 implements MigrationInterface {
  public name = 'Routines1788800000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS routine_subscriptions (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid NOT NULL,
        routine_key  text NOT NULL,
        enabled      boolean NOT NULL DEFAULT true,
        hour         int NOT NULL,
        weekday      int,
        channel      text NOT NULL DEFAULT 'in_app',
        time_zone    text NOT NULL DEFAULT 'Europe/Paris',
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT routine_subscriptions_user_key UNIQUE (user_id, routine_key),
        CONSTRAINT routine_subscriptions_hour_check CHECK (hour >= 0 AND hour <= 23),
        CONSTRAINT routine_subscriptions_weekday_check CHECK (weekday IS NULL OR (weekday >= 1 AND weekday <= 7)),
        CONSTRAINT routine_subscriptions_channel_check CHECK (channel IN ('in_app', 'email'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS routine_subscriptions_user_idx ON routine_subscriptions (user_id)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS routine_runs (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid NOT NULL,
        routine_key  text NOT NULL,
        run_key      text NOT NULL,
        notified     boolean NOT NULL DEFAULT false,
        outcome      text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT routine_runs_key UNIQUE (run_key)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS routine_runs_user_idx ON routine_runs (user_id)`)
    // Lecture la plus fréquente : « quand cette routine a-t-elle tourné pour la
    // dernière fois ? » — posée une fois par routine à chaque ouverture de l'écran.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS routine_runs_lookup_idx ON routine_runs (user_id, routine_key, created_at DESC)`,
    )

    // RLS : mêmes règles que le reste des données personnelles — chacun ne voit
    // que ses routines. Le balayeur passe par la clé de service, hors RLS.
    await queryRunner.query(`ALTER TABLE routine_subscriptions ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`ALTER TABLE routine_runs ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY routine_subscriptions_owner ON routine_subscriptions
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY routine_runs_owner ON routine_runs
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS routine_runs`)
    await queryRunner.query(`DROP TABLE IF EXISTS routine_subscriptions`)
  }
}
