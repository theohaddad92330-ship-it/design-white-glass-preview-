import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2980 — le job réel derrière la première synchronisation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION, ET RIEN D'AUTRE ENCORE
 * ─────────────────────────────────────────────────────────────────────────────
 * `1796321337841-IntegrationSyncRuns` (#3014) posait trois états
 * (`running`/`completed`/`failed`) pour un travail qui, à l'époque, tenait en
 * un seul appel attendu par le contrôleur. #2980 en fait un job BullMQ réel,
 * qui traverse les phases nommées par #2110 — la contrainte SQL et
 * l'énumération TypeScript (`SYNC_RUN_STATUSES`, `@bellum/contracts`) sont
 * élargies ICI, AVANT le worker qui les écrit (GA-11 / GA-12).
 *
 * Le `CHECK` est RE-DÉCLARÉ EN ENTIER à partir de la DERNIÈRE liste en
 * vigueur (jamais une plus ancienne) : `running` reste, aucune ligne
 * existante ne devient illisible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `job_key` ET L'INDEX UNIQUE PARTIEL — L'IDEMPOTENCE VIT EN BASE, PAS
 * SEULEMENT DANS LE CONTRÔLEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * #2110.81 : « aucune double synchronisation ». Le contrôleur refuse déjà un
 * second lancement en LISANT le dernier run avant d'écrire (409) — mais deux
 * requêtes concurrentes peuvent lire toutes les deux « aucun run actif » avant
 * que l'une n'écrive. Un index UNIQUE PARTIEL sur (workspace_id, provider),
 * restreint aux statuts NON terminaux, referme cette fenêtre : PostgreSQL
 * refuse la seconde ligne, quel que soit l'ordre d'arrivée des requêtes.
 *
 * `job_key` porte l'identifiant du job BullMQ (`integration-sync-{ws}-{provider}`)
 * — utile au diagnostic (retrouver un run depuis Redis) sans dupliquer la
 * clé d'idempotence BullMQ elle-même, qui reste le jobId.
 *
 * `canceled_at` distingue un `canceled` décidé par l'utilisateur (#2110.39,
 * bouton annuler) d'un `failed` technique — les deux ferment le run, mais
 * jamais pour la même raison, et l'écran ne doit jamais les confondre.
 */
export class IntegrationSyncJobStates1796321364100 implements MigrationInterface {
  name = 'IntegrationSyncJobStates1796321364100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE integration_sync_runs DROP CONSTRAINT IF EXISTS integration_sync_runs_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE integration_sync_runs
        ADD CONSTRAINT integration_sync_runs_status_check
        CHECK (status IN (
          'running', 'completed', 'failed',
          'pending', 'reading_sources', 'matching_accounts', 'matching_contacts',
          'detecting_events', 'preparing_summary', 'partial', 'canceled'
        ))
    `)

    await queryRunner.query(`ALTER TABLE integration_sync_runs ADD COLUMN IF NOT EXISTS job_key text NULL`)
    await queryRunner.query(`ALTER TABLE integration_sync_runs ADD COLUMN IF NOT EXISTS canceled_at timestamptz NULL`)

    // La garde anti-double-lancement EN BASE (voir docblock) — un statut
    // terminal ne bloque jamais un nouveau départ, seul un job encore vivant le fait.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS integration_sync_runs_active_job_idx
        ON integration_sync_runs (workspace_id, provider)
        WHERE status NOT IN ('completed', 'partial', 'failed', 'canceled')
    `)

    await queryRunner.query(`
      COMMENT ON COLUMN integration_sync_runs.job_key IS
        'Identifiant du job BullMQ (integration-sync-{workspace}-{provider}), pour le diagnostic. La cle d''idempotence reelle reste le jobId BullMQ + l''index unique partiel ci-dessus.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN integration_sync_runs.canceled_at IS
        'NULL sauf status = canceled. Distinct de finished_at : un canceled est un geste utilisateur (#2110.39), jamais confondu avec la fin technique d''un job.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS integration_sync_runs_active_job_idx`)
    await queryRunner.query(`ALTER TABLE integration_sync_runs DROP COLUMN IF EXISTS canceled_at`)
    await queryRunner.query(`ALTER TABLE integration_sync_runs DROP COLUMN IF EXISTS job_key`)
    // ⚠️ Le `CHECK` n'est PAS remis à trois valeurs : un run peut déjà porter
    // un état intermédiaire, et une contrainte qui rétrécit le rendrait
    // illisible. Un `down` restaure ce qu'il peut, jamais ce qui casse des lignes.
  }
}
