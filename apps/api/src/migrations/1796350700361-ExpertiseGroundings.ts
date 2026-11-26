import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2880 (lot V33, 28/09, décision Louis) — LE CROISEMENT RELATIONNEL
 * expertise ↔ fondement/preuve. Une ligne = (espace, clé d'expertise, type de
 * fondement, objet source optionnel, état à 3 valeurs, source de l'état,
 * dates). Vocabulaire dans `packages/contracts/src/schemas/expertise-grounding.ts`
 * (GA-26) ; chaque CHECK ci-dessous est la copie d'une de ses énumérations,
 * élargie AVANT le code qui l'écrit (GA-11/GA-12).
 *
 * ADDITIVE : les cinq colonnes plates de `esn_profiles`
 * (`expertise_client_reference`, …) restent intactes et sont LUES telles
 * quelles par le service (projection) — aucune donnée n'est déplacée ni
 * supprimée. `archived_at` : on archive, on ne supprime pas.
 *
 * `source_id` n'a pas de clé étrangère : il désigne, selon `source_type`, un
 * compte, un consultant, une mission ou un document (`rag_documents`). Le
 * service vérifie à l'écriture que l'objet appartient au MÊME espace.
 *
 * Même patron RLS que `legal_contracts` (lecture par les membres de l'espace).
 */
export class ExpertiseGroundings1796350700361 implements MigrationInterface {
  public name = 'ExpertiseGroundings1796350700361'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expertise_groundings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        expertise_key text NOT NULL,
        kind text NOT NULL,
        state text NOT NULL DEFAULT 'declared',
        state_source text NOT NULL DEFAULT 'user',
        source_type text NULL,
        source_id uuid NULL,
        label text NULL,
        confidentiality text NULL,
        created_by uuid NULL,
        archived_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT expertise_groundings_kind_check CHECK (kind IN (
          'client_reference', 'personal_experience', 'partner', 'talent_pool', 'development_intent'
        )),
        CONSTRAINT expertise_groundings_state_check CHECK (state IN ('proven', 'declared', 'to_prove')),
        CONSTRAINT expertise_groundings_state_source_check CHECK (state_source IN ('onboarding_answer', 'user')),
        CONSTRAINT expertise_groundings_source_type_check CHECK (
          source_type IS NULL OR source_type IN ('account', 'consultant', 'mission', 'document')
        ),
        CONSTRAINT expertise_groundings_confidentiality_check CHECK (
          confidentiality IS NULL OR confidentiality IN ('citable', 'anonymizable', 'confidential')
        ),
        CONSTRAINT expertise_groundings_source_pair_check CHECK ((source_type IS NULL) = (source_id IS NULL)),
        CONSTRAINT expertise_groundings_proven_requires_source CHECK (state <> 'proven' OR source_id IS NOT NULL),
        CONSTRAINT expertise_groundings_confidentiality_on_reference CHECK (
          confidentiality IS NULL OR kind = 'client_reference'
        ),
        CONSTRAINT expertise_groundings_expertise_key_check CHECK (length(btrim(expertise_key)) > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_expertise_groundings_workspace
        ON expertise_groundings (workspace_id, expertise_key);
      ALTER TABLE expertise_groundings ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "expertise_groundings_workspace_read" ON expertise_groundings;
      CREATE POLICY "expertise_groundings_workspace_read" ON expertise_groundings FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS expertise_groundings`)
  }
}
