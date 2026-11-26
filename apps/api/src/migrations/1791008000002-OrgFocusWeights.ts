import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `org_focus_weights` — le focus du plan d'action, réglé PAR ESPACE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * La charge utile du plan est plafonnée axe par axe, et ce qui n'entre pas dans
 * le plafond n'entre pas dans le plan. `itChallenges` valait 6 pour TOUT LE
 * MONDE — y compris une ESN d'ingénierie industrielle, de conseil RH ou de
 * finance. C'est un prisme IT par défaut, appliqué à des métiers qui n'en sont
 * pas. L'exigence dit l'inverse : « jamais un prisme IT par défaut ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE LIGNE PAR ESPACE, ET SEULEMENT SI L'ESPACE A RÉGLÉ QUELQUE CHOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas de ligne = les valeurs EN VIGUEUR, celles du contrat
 * (`packages/contracts/src/schemas/org-focus-weights.ts`). Semer une ligne par
 * espace avec les défauts recopiés créerait 200 copies d'un réglage, et le jour
 * où le défaut bouge, aucune ne suivrait. **Un réglage vit à un seul endroit**
 * (GA-26) : ici on ne stocke que l'ÉCART au défaut.
 *
 * `weights` est un jsonb PARTIEL — un espace règle les deux axes qui le
 * concernent et hérite du reste. Les valeurs sont validées par le contrat
 * (0 à 20, axes fermés) AVANT d'arriver ici ; la contrainte SQL ne porte donc
 * que sur la forme (un objet), pas sur les clés — une CHECK sur les clés d'un
 * jsonb serait à réécrire à chaque axe ajouté, et se périmerait en silence.
 */
export class OrgFocusWeights1791008000002 implements MigrationInterface {
  public name = 'OrgFocusWeights1791008000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS org_focus_weights (
        workspace_id uuid PRIMARY KEY,
        weights jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT org_focus_weights_shape_check CHECK (jsonb_typeof(weights) = 'object')
      )
    `)
    await queryRunner.query(`
      COMMENT ON TABLE org_focus_weights IS
        'Le focus du plan d action, regle par espace - l ECART au defaut, jamais une copie du defaut. Absence de ligne = les valeurs en vigueur du contrat org-focus-weights.ts. « Jamais un prisme IT par defaut. »'
    `)

    await queryRunner.query(`ALTER TABLE org_focus_weights ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'org_focus_weights' AND policyname = 'org_focus_weights_own_workspace'
        ) THEN
          CREATE POLICY org_focus_weights_own_workspace ON org_focus_weights
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      EXCEPTION
        WHEN undefined_function OR undefined_table OR undefined_object THEN NULL;
      END
      $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS org_focus_weights`)
  }
}
