import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2864 — DÉLÉGUER une demande d'approbation à un collègue (`assigned_to`).
 * #2856 — REPORTER une demande d'approbation (`snoozed_until`).
 *
 * ADDITIVE et NULLABLE : une demande existante lit « non déléguée, non
 * reportée », exactement son comportement d'avant.
 *
 * La contrainte est posée AVANT le code qui écrit (GA-11/12) : un report ne
 * peut pas dépasser l'expiration de la demande — elle périrait endormie, sans
 * que personne ne l'ait vue passer. `assigned_to` n'a pas de clé étrangère :
 * l'appartenance à l'ESPACE de la demande (et non la simple existence d'un
 * compte) est la vraie règle, et elle se vérifie dans `canAssign` au moment de
 * la délégation. Un membre parti ne doit pas faire échouer une lecture.
 */
export class ApprovalRequestAssignAndSnooze1796001543887 implements MigrationInterface {
  name = 'ApprovalRequestAssignAndSnooze1796001543887'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS assigned_to uuid`)
    await queryRunner.query(`ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS snoozed_until timestamptz`)
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_requests_snooze_before_expiry') THEN
          ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_snooze_before_expiry
            CHECK (snoozed_until IS NULL OR snoozed_until <= expires_at);
        END IF;
      END $$;
    `)
    // « Ce qu'on m'a confié » : la lecture chaude de l'assigné, bornée aux
    // demandes encore en attente.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS approval_requests_workspace_assignee_idx
      ON approval_requests (workspace_id, assigned_to)
      WHERE state = 'pending' AND assigned_to IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS approval_requests_workspace_assignee_idx`)
    await queryRunner.query(
      `ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_snooze_before_expiry`,
    )
    await queryRunner.query(`ALTER TABLE approval_requests DROP COLUMN IF EXISTS snoozed_until`)
    await queryRunner.query(`ALTER TABLE approval_requests DROP COLUMN IF EXISTS assigned_to`)
  }
}
