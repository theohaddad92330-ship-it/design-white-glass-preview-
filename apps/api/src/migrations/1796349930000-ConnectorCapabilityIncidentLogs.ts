import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `connector_capability_incident_logs` — #2445.12 (épopée #2766, lot SRC5
 * 28/09 soir) : LES ACTIONS ET LA COMMUNICATION D'UN INCIDENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `connector_capability_incidents` (migration `1796344355019`) journalise
 * QUAND une capacité a cessé, ou repris, de répondre — la chronologie SEULE,
 * comme son propre docblock le dit : « l'impact (combien d'espaces), les
 * actions prises et la communication restent absents ». Cette table tient les
 * DEUX derniers : ce qu'un opérateur a FAIT sur un incident, et ce qu'il a DIT
 * à un client à ce sujet. L'IMPACT (combien d'espaces touchés) ne se
 * PERSISTE pas — il se CALCULE à la lecture depuis les transitions déjà
 * journalisées (même table que la chronologie), donc aucune colonne ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE SEULE TABLE, DEUX NATURES (`kind`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Une action et une communication portent la MÊME forme (un texte daté,
 * rattaché à l'incident) — deux tables jumelles auraient dupliqué la requête
 * de lecture pour rien (GA-26). `workspace_id` reste NULLABLE : une action
 * opérateur (« redémarré le connecteur ») ne cible aucun client ; une
 * communication PEUT en cibler un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `incident_id` RÉFÉRENCE UNE TRANSITION `degraded`
 * ─────────────────────────────────────────────────────────────────────────────
 * L'incident est ANCRÉ sur la ligne `degraded` qui l'a ouvert
 * (`connector_capability_incidents.id`) — la plus petite tranche déjà
 * prouvable. `ON DELETE CASCADE` : le journal d'un incident ne doit jamais
 * survivre à la disparition de son ancre (la chronologie ne supprime jamais
 * en pratique, mais la contrainte tient si elle le faisait un jour).
 */
export class ConnectorCapabilityIncidentLogs1796349930000 implements MigrationInterface {
  public name = 'ConnectorCapabilityIncidentLogs1796349930000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS connector_capability_incident_logs (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id  uuid NOT NULL REFERENCES connector_capability_incidents(id) ON DELETE CASCADE,
        kind         text NOT NULL,
        workspace_id uuid,
        actor        text,
        note         text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(
      `ALTER TABLE connector_capability_incident_logs DROP CONSTRAINT IF EXISTS connector_capability_incident_logs_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE connector_capability_incident_logs
        ADD CONSTRAINT connector_capability_incident_logs_kind_check
        CHECK (kind IN ('action', 'communication'))
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_connector_capability_incident_logs_incident
        ON connector_capability_incident_logs (incident_id, created_at)
    `)

    await queryRunner.query(`
      COMMENT ON TABLE connector_capability_incident_logs IS
        'Actions prises et communication client sur un incident connecteur (#2445.12, epopee #2766). Append-only.'
    `)

    await queryRunner.query(`ALTER TABLE connector_capability_incident_logs ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS connector_capability_incident_logs`)
  }
}
