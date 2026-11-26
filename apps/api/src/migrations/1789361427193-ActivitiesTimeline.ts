import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les ACTIVITÉS (T2) — la mémoire des échanges.
 *
 * Le produit lisait déjà messagerie, agenda et téléphonie. Il n'en gardait rien :
 * chaque écran interrogeait le fournisseur, affichait, oubliait. Deux tables
 * seulement, et une contrainte qui porte tout le reste.
 *
 * `activities_external_unique` est LA ligne importante. Elle est PARTIELLE
 * (`WHERE external_id IS NOT NULL`) pour une raison qui n'est pas un détail :
 * une saisie manuelle n'a pas d'identifiant externe, et deux appels notés à la
 * main le même jour sont deux appels — un index total les fondrait en un seul,
 * ou refuserait le second. Un doublon dans une timeline se lit comme deux
 * échanges, donc comme une relation plus avancée qu'elle ne l'est ; l'inverse
 * efface le travail de quelqu'un.
 *
 * `activity_participants` est une table à part et non un `jsonb` : on cherche
 * « toutes les activités où Marie apparaît », et cette question ne se pose pas
 * à un tableau JSON sans index dédié.
 */
export class ActivitiesTimeline1789361427193 implements MigrationInterface {
  public name = 'ActivitiesTimeline1789361427193'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id uuid,
        kind text NOT NULL,
        source text NOT NULL,
        direction text NOT NULL,
        subject text,
        body text,
        body_truncated boolean NOT NULL DEFAULT false,
        occurred_at timestamptz NOT NULL,
        duration_seconds integer,
        account_id uuid,
        contact_id uuid,
        project_id uuid,
        link_reason text,
        external_id text,
        external_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT activities_kind_check CHECK (
          kind IN ('email', 'call', 'meeting', 'note', 'task', 'stage_change', 'crm_export', 'linkedin', 'analysis', 'workflow')
        ),
        CONSTRAINT activities_source_check CHECK (
          source IN ('mailbox', 'agenda', 'telephony', 'manual', 'crm', 'system')
        ),
        CONSTRAINT activities_direction_check CHECK (direction IN ('inbound', 'outbound', 'internal')),
        CONSTRAINT activities_link_reason_check CHECK (
          link_reason IS NULL OR link_reason IN ('contact_email', 'contact_phone', 'account_domain', 'manual', 'project_explicit')
        )
      )
    `)

    // Idempotence de la capture. Partielle À DESSEIN : voir l'en-tête.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS activities_external_unique
        ON activities (workspace_id, source, external_id)
        WHERE external_id IS NOT NULL
    `)
    // Les trois lectures de la timeline. `occurred_at DESC` est dans l'index
    // parce que la vue est toujours antéchronologique : sans lui, chaque
    // ouverture de fiche trie l'historique complet du compte.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS activities_account_idx ON activities (account_id, occurred_at DESC)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS activities_contact_idx ON activities (contact_id, occurred_at DESC)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS activities_project_idx ON activities (project_id, occurred_at DESC)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS activities_workspace_idx ON activities (workspace_id, occurred_at DESC)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS activity_participants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        handle text NOT NULL,
        display_name text,
        contact_id uuid,
        is_self boolean NOT NULL DEFAULT false
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS activity_participants_activity_idx ON activity_participants (activity_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS activity_participants_contact_idx ON activity_participants (contact_id)
    `)
    // « Tous les échanges avec cette adresse », y compris quand elle n'est
    // rattachée à aucun contact — c'est le cas au moment précis où l'on cherche
    // qui c'est.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS activity_participants_handle_idx ON activity_participants (lower(handle))
    `)

    // Ce que la table remplace : la dernière capture réussie par source et par
    // utilisateur, pour ne pas relire six mois d'historique à chaque
    // synchronisation. Une seule ligne par couple, écrasée.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS activity_sync_state (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        source text NOT NULL,
        last_synced_at timestamptz,
        last_outcome text,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS activity_sync_state_unique
        ON activity_sync_state (workspace_id, user_id, source)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS activity_sync_state`)
    await queryRunner.query(`DROP TABLE IF EXISTS activity_participants`)
    await queryRunner.query(`DROP TABLE IF EXISTS activities`)
  }
}
