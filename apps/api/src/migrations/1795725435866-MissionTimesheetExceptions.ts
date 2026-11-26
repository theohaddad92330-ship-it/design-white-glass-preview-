import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2196.31 (décision Louis du 19/09/2026) — L'EXCEPTION « NON APPLICABLE »
 * d'un relevé d'activité, TRACÉE et RÉVERSIBLE.
 *
 * `not_required` est DÉRIVÉ de la nature du contrat à chaque lecture
 * (`timesheet-view.ts`, `expectsTimesheet`) : l'écrire sur `mission_timesheets`
 * aurait été écrasé par la lecture suivante, et aurait effacé le statut d'avant
 * sans moyen de le rendre. L'exception vit donc dans SA table :
 *
 *  - la maille est celle de l'écran — mission × consultant × mois — parce qu'un
 *    mois SANS dépôt n'a pas de ligne de relevé, et c'est celui qu'on marque ;
 *  - QUI (`created_by`), QUAND (`created_at`), POURQUOI (`reason`, obligatoire,
 *    tenu ici par `mission_timesheet_exceptions_reason_check`) ;
 *  - « Annuler » RÉVOQUE (`revoked_at`, `revoked_by`) — la ligne reste, la
 *    déduction du contrat reprend. On archive, on ne supprime pas ;
 *  - une seule exception ACTIVE par maille (index unique partiel) : marquer
 *    deux fois le même mois ne double rien, et l'historique garde toutes les
 *    révoquées.
 *
 * `kind` est une liste FERMÉE à une valeur, posée AVANT le code qui l'écrit
 * (GA-11/GA-12) : la prochaine nature d'exception élargira la contrainte, elle
 * ne se glissera pas.
 *
 * RLS : même portée que la mission — les membres de l'espace la lisent. L'API
 * écrit avec la clé de service, bornée par `workspace_id` dans chaque requête.
 *
 * Horodatage : l'heure réelle, décalée APRÈS le maximum de la branche
 * (`1795725274971`) pour rester croissant.
 */
export class MissionTimesheetExceptions1795725435866 implements MigrationInterface {
  name = 'MissionTimesheetExceptions1795725435866'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_timesheet_exceptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        consultant_id uuid,
        period_month date NOT NULL,
        kind text NOT NULL DEFAULT 'not_applicable',
        reason text NOT NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz,
        revoked_by uuid,
        CONSTRAINT mission_timesheet_exceptions_kind_check CHECK (kind IN ('not_applicable')),
        CONSTRAINT mission_timesheet_exceptions_reason_check CHECK (length(btrim(reason)) > 0),
        CONSTRAINT mission_timesheet_exceptions_month_check CHECK (EXTRACT(DAY FROM period_month) = 1),
        CONSTRAINT mission_timesheet_exceptions_revoked_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_timesheet_exceptions_active
        ON mission_timesheet_exceptions (
          mission_id,
          COALESCE(consultant_id, '00000000-0000-0000-0000-000000000000'::uuid),
          period_month
        )
        WHERE revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_mission_timesheet_exceptions_workspace_month
        ON mission_timesheet_exceptions (workspace_id, period_month);
      ALTER TABLE mission_timesheet_exceptions ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "mission_timesheet_exceptions_workspace_read" ON mission_timesheet_exceptions;
      CREATE POLICY "mission_timesheet_exceptions_workspace_read" ON mission_timesheet_exceptions FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_timesheet_exceptions`)
  }
}
