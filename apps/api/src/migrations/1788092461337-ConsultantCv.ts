import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Réécriture du CV selon la mission (annexe méthodo p22).
 *
 * Deux ajouts :
 *   - `consultants.cv_text` : le CV source. C'est la MATIÈRE de la réécriture, et
 *     surtout la référence contre laquelle chaque citation produite est vérifiée
 *     (`cv-rewrite-guard.ts`). Sans lui, il n'y a rien à réécrire honnêtement ;
 *   - `consultant_cv_rewrites` : le CV réécrit, par (consultant, besoin). Un
 *     appel Claude coûte — on ne le rejoue pas à chaque ouverture d'écran — et
 *     surtout le commercial doit pouvoir relire EXACTEMENT le document qu'il a
 *     envoyé au client, pas une nouvelle génération qui aurait dérivé.
 *
 * RLS = défense en profondeur (l'API tourne en service role) : une ligne est
 * visible aux membres de son workspace, repli sur `user_id` comme les tables
 * voisines tant que le roll-out workspace n'est pas terminé.
 */
export class ConsultantCv1788092461337 implements MigrationInterface {
  public name = 'ConsultantCv1788092461337'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS cv_text text`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultant_cv_rewrites (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   uuid,
        user_id        uuid NOT NULL,
        consultant_id  uuid NOT NULL,
        opportunity_id uuid NOT NULL,
        content        jsonb NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Un seul CV courant par (consultant, besoin) : régénérer remplace, sinon
    // l'écran devrait choisir entre plusieurs versions sans savoir laquelle a
    // été envoyée.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS consultant_cv_rewrites_pair_idx
         ON consultant_cv_rewrites (consultant_id, opportunity_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS consultant_cv_rewrites_workspace_idx ON consultant_cv_rewrites (workspace_id)`,
    )
    await queryRunner.query(`ALTER TABLE consultant_cv_rewrites ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'consultant_cv_rewrites'
            AND policyname = 'Members read their workspace cv rewrites'
        ) THEN
          CREATE POLICY "Members read their workspace cv rewrites"
            ON consultant_cv_rewrites
            FOR SELECT
            USING (
              user_id = auth.uid()
              OR workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
            );
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS consultant_cv_rewrites`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS cv_text`)
  }
}
