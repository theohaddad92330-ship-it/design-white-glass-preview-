import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2423 — LAU-FINAL-137 : les CHANGEMENTS d'une mission (TJM, société, site,
 * pause…) — la fondation. Vocabulaire complet dans
 * `packages/contracts/src/schemas/mission-amendment.ts` (GA-26).
 *
 * Un avenant PROPOSÉ est un enregistrement immuable : `event_type`,
 * `effective_from`, `proof`, `previous_term`, `new_term` ne sont JAMAIS
 * réécrits après création — seul `status` (et `approved_by`/`approved_at`,
 * `to` la même écriture) évolue. C'est cette immutabilité, pas une garde à
 * part, qui tient #2423.1 (« gérer les changements sans réécrire
 * rétroactivement la mission »).
 *
 * Même patron RLS que `mission_status_transitions` (workspace-scopé, lecture
 * par les membres de l'espace).
 */
export class MissionAmendments1795999931842 implements MigrationInterface {
  public name = 'MissionAmendments1795999931842'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_amendments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        status text NOT NULL DEFAULT 'proposed',
        effective_from date NOT NULL,
        proof text NOT NULL,
        previous_term jsonb NULL,
        new_term jsonb NULL,
        pause_cause text NULL,
        note text NULL,
        requested_by uuid NOT NULL,
        requested_at timestamptz NOT NULL DEFAULT now(),
        approved_by uuid NULL,
        approved_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_amendments_event_type_check CHECK (event_type IN (
          'daily_rate_change', 'legal_entity_change', 'work_site_change', 'remote_policy_change',
          'pause_start', 'pause_end', 'end_date_change', 'start_date_change', 'contract_kind_change',
          'role_title_change', 'billing_contact_change', 'po_terms_change', 'consultant_replacement',
          'scope_change', 'renewal_terms_change', 'termination_notice'
        )),
        CONSTRAINT mission_amendments_status_check CHECK (status IN ('proposed', 'accepted', 'active', 'rejected', 'cancelled')),
        CONSTRAINT mission_amendments_pause_cause_check CHECK (
          pause_cause IS NULL OR pause_cause IN ('mission_pause', 'consultant_absence', 'client_closure', 'non_billable_days')
        ),
        CONSTRAINT mission_amendments_proof_check CHECK (length(btrim(proof)) > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_mission_amendments_mission
        ON mission_amendments (mission_id, requested_at DESC);
      ALTER TABLE mission_amendments ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "mission_amendments_workspace_read" ON mission_amendments;
      CREATE POLICY "mission_amendments_workspace_read" ON mission_amendments FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_amendments`)
  }
}
