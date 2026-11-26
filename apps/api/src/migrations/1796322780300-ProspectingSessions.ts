import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2386.9 — LA SESSION DE PROSPECTION, PERSISTÉE.
 *
 * `ProspectingSessionDialog` (#2375) construit sa session en mémoire, sans
 * jamais l'écrire : « doublons évités » (#2386.9/#3010.8) se comptait déjà,
 * mais rien ne survivait à la fermeture du dialogue — impossible d'agréger
 * PAR PARCOURS (GA-240/241/264/266/267) ce que personne ne garde. Cette table
 * n'est PAS la session elle-même (le pitch, les contacts restent en mémoire
 * web, doctrine « on n'invente pas un moteur ») : elle porte uniquement les
 * FAITS de télémétrie que #2386 nomme — temps jusqu'au premier message, taux
 * de messages modifiés, succès connecteur, doublons évités.
 *
 * `journey` est TEXT libre, même raison que `commercial_audit_feedback.target_key`
 * (migration `1796322160100`) : les modes de session (`PROSPECTING_SESSION_MODES`,
 * apps/web) vivent dans le code de l'écran, pas en base — en ajouter un ne doit
 * jamais demander une migration.
 *
 * AUCUNE colonne `user_id` : l'agrégat lu par l'API groupe PAR `journey`
 * seul (`aggregateProspectingSessionMetrics`, `@bellum/contracts`) — une
 * session ne peut donc jamais se relire par personne, la contrainte est
 * posée AU SCHÉMA, pas seulement dans la requête (GA-11/GA-12).
 */
export class ProspectingSessions1796322780300 implements MigrationInterface {
  public name = 'ProspectingSessions1796322780300'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS prospecting_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        journey text NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        first_message_at timestamptz,
        messages_total integer NOT NULL DEFAULT 0,
        messages_modified integer NOT NULL DEFAULT 0,
        connector_attempts integer NOT NULL DEFAULT 0,
        connector_successes integer NOT NULL DEFAULT 0,
        duplicates_avoided integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT prospecting_sessions_journey_check CHECK (btrim(journey) <> '')
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_prospecting_sessions_journey
        ON prospecting_sessions (journey)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS prospecting_sessions`)
  }
}
