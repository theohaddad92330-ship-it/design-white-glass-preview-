import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Objectif commercial chiffré par membre (cockpit manager §10).
 *
 * Table `member_objectives` : un membre déclare, pour un MOIS, une cible sur trois
 * axes indépendants et nullables — rendez-vous, comptes, chiffre d'affaires. Le
 * cockpit rapporte ces cibles au réalisé (données réelles déjà calculées) et
 * dessine une barre d'atteinte. Aucune cible n'est inventée : un axe non déclaré
 * reste `NULL` et n'a pas de barre.
 *
 * RLS (défense en profondeur, l'API tourne en service role qui bypass) :
 *  - un membre gère SON objectif (`auth.uid() = user_id`, FOR ALL) ;
 *  - un manager LIT ceux de son équipe (SELECT sur le workspace).
 *
 * Additive + idempotente (`IF NOT EXISTS` partout, garde `pg_policies`).
 */
export class MemberObjectives1788230462911 implements MigrationInterface {
  public name = 'MemberObjectives1788230462911'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS member_objectives (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         uuid NOT NULL,
        workspace_id    uuid NOT NULL,
        period_month    date NOT NULL,
        target_meetings integer,
        target_accounts integer,
        target_revenue  numeric,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `)

    // Un seul objectif par (membre, workspace, mois) — l'upsert s'y appuie.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS member_objectives_user_ws_month_uniq
        ON member_objectives (user_id, workspace_id, period_month)
    `)
    // Lecture manager : toutes les cibles d'un workspace pour un mois donné.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS member_objectives_workspace_month_idx
        ON member_objectives (workspace_id, period_month)
    `)

    await queryRunner.query(`ALTER TABLE member_objectives ENABLE ROW LEVEL SECURITY`)

    // Un membre gère (lecture + écriture) SON propre objectif.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'member_objectives'
            AND policyname = 'Members manage their own objective'
        ) THEN
          CREATE POLICY "Members manage their own objective"
            ON member_objectives
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)

    // Un manager (tout membre du workspace) LIT les objectifs de son équipe.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'member_objectives'
            AND policyname = 'Members can read their workspace objectives'
        ) THEN
          CREATE POLICY "Members can read their workspace objectives"
            ON member_objectives
            FOR SELECT
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
