import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les demandes d'ÉCRITURE dans l'ERP, en attente d'un responsable.
 *
 * Arbitrage Louis du 03/08 : l'écriture dans l'ERP est autorisée, mais
 * « après approbation explicite ». Elle ne passe donc jamais en direct — elle
 * passe par cette table.
 *
 * Pourquoi une table et pas un simple appel : écrire dans l'ERP d'une ESN engage
 * sa facturation et sa paie. Un TJM mal saisi se retrouve sur une facture, et
 * une mission créée en double se retrouve dans un reporting de direction. Ce qui
 * protège n'est pas le clic, c'est la trace : qui a demandé quoi, qui l'a
 * validé, ce qui a été montré au moment de la validation, et ce que l'ERP a
 * répondu.
 *
 * `preview` fige ce qui a été MONTRÉ. Le recalculer à l'affichage ferait
 * approuver autre chose que ce qui a été présenté — même règle que
 * `approval_requests`.
 *
 * `result` garde la réponse de l'ERP telle quelle. Une écriture qui échoue reste
 * visible comme échouée : « on a essayé et ça n'est pas passé » est une
 * information, « rien ne s'est passé » n'en est pas une.
 */
export class AtsWriteRequests1788900000004 implements MigrationInterface {
  public name = 'AtsWriteRequests1788900000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ats_write_requests (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        requested_by uuid NOT NULL,
        kind         text NOT NULL,
        payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
        preview      text NOT NULL,
        state        text NOT NULL DEFAULT 'pending',
        decided_by   uuid,
        decided_at   timestamptz,
        expires_at   timestamptz NOT NULL,
        result       text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ats_write_requests_kind_check CHECK (
          kind IN ('create_mission', 'update_tjm', 'update_need_status')
        ),
        CONSTRAINT ats_write_requests_state_check CHECK (
          state IN ('pending', 'approved', 'rejected', 'expired', 'failed')
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ats_write_requests_workspace_state_idx ON ats_write_requests (workspace_id, state)`,
    )
    await queryRunner.query(`ALTER TABLE ats_write_requests ENABLE ROW LEVEL SECURITY`)
    // Aucune politique permissive : seule l'API (clé de service) lit et écrit.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ats_write_requests`)
  }
}
