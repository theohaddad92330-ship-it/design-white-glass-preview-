import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3754 — les postes cibles de l'ESN, chacun avec son niveau décideur
 * (1 signataire … 4 influenceur), importés dans Réglages › Profil ESN.
 *
 * La contrainte `decision_level` reprend `ESN_TARGET_LEVELS`
 * (`@bellum/contracts/schemas/esn-target-personas.ts`), posée dans la MÊME
 * migration que le code qui l'écrit (GA-11/GA-12). `workspace_id` porte
 * `ON DELETE CASCADE` : une FK sans suppression en cascade a déjà cassé le
 * reset de la démo en silence.
 *
 * Scopée par `workspace_id` : les postes cibles d'un espace ne sont jamais lus
 * par un autre (GA-43). Un réimport REMPLACE l'ensemble de l'espace (transaction
 * côté service), il ne s'accumule pas. RLS calquée sur `esn_profiles` : lecture
 * pour les membres de l'espace, écriture par leur auteur.
 */
export class EsnTargetPersonas1796436218731 implements MigrationInterface {
  name = 'EsnTargetPersonas1796436218731'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esn_target_personas (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id     uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        user_id          uuid NOT NULL,
        category         text,
        title            text NOT NULL,
        title_normalized text NOT NULL,
        decision_level   smallint NOT NULL,
        created_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT esn_target_personas_decision_level_check CHECK (decision_level BETWEEN 1 AND 4)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS esn_target_personas_workspace_idx ON esn_target_personas (workspace_id)`,
    )

    await queryRunner.query(`ALTER TABLE esn_target_personas ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "esn_target_personas_member_read" ON esn_target_personas`)
    await queryRunner.query(`
      CREATE POLICY "esn_target_personas_member_read" ON esn_target_personas FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
    await queryRunner.query(`DROP POLICY IF EXISTS "esn_target_personas_own_write" ON esn_target_personas`)
    await queryRunner.query(`
      CREATE POLICY "esn_target_personas_own_write" ON esn_target_personas FOR ALL
        USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS esn_target_personas`)
  }
}
