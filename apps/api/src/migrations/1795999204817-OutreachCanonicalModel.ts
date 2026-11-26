import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2366 — le modèle canonique de l'outreach (LAU-FINAL-081), tranché par Louis
 * le 22/09/2026 au soir (decisions-louis-22-09-soir.md §3 : lot de conception
 * qui ÉTEND l'existant sans rien casser — `outreach_sequences` et
 * `outbound_write_requests` ne bougent pas).
 *
 * - `outreach_messages` : MESSAGE_DRAFT, un destinataire, un canal, un
 *   objectif, une source, un owner. Son statut suit la machine à quinze états
 *   de `@bellum/contracts` (`outreach-canonical.ts`) — la contrainte CHECK
 *   ci-dessous en est la copie exacte, posée AVANT le code qui l'écrit (GA-11).
 * - `outreach_message_versions` : une modification de texte crée une version,
 *   jamais un écrasement (#2366.10). `kind` distingue le gabarit d'origine, la
 *   version personnalisée et chaque retouche humaine (#2382.3).
 * - `outreach_call_tasks` : CALL_TASK, sa propre machine à douze états (#2366.5).
 * - `outreach_transitions` : journal APPEND-ONLY, les dix champs de la spec
 *   (#2366.8). Jamais mis à jour, jamais supprimé à la main.
 *
 * Toutes portent `workspace_id` + `user_id` : ce sont des tables scopées au
 * sens de `table-scopes.ts`, rien à déclarer. FK contact ON DELETE CASCADE :
 * l'effacement RGPD d'une personne emporte ce qu'on lui avait préparé.
 */
export class OutreachCanonicalModel1795999204817 implements MigrationInterface {
  name = 'OutreachCanonicalModel1795999204817'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_messages (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id      uuid,
        user_id           uuid NOT NULL,
        contact_id        uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        channel           text NOT NULL DEFAULT 'email',
        intent            text NOT NULL,
        source            text NOT NULL,
        reason            text,
        status            text NOT NULL DEFAULT 'drafted',
        current_version   integer NOT NULL DEFAULT 1,
        sequence_id       uuid REFERENCES outreach_sequences(id) ON DELETE SET NULL,
        sequence_step_id  uuid REFERENCES outreach_sequence_steps(id) ON DELETE SET NULL,
        approval          jsonb,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outreach_messages_channel_check CHECK (channel IN ('email', 'linkedin', 'phone', 'manual')),
        CONSTRAINT outreach_messages_intent_check CHECK (intent IN (
          'open_relationship', 'qualify_context', 'ask_orientation', 'reactivate',
          'get_introduction', 'push_profile', 'follow_meeting', 'follow_up',
          'nurture', 'get_feedback', 'prepare_partnership', 'clarify_need')),
        CONSTRAINT outreach_messages_source_check CHECK (source IN (
          'laura', 'contacts', 'targets', 'accounts', 'opportunities', 'needs',
          'pool', 'actions', 'sequences', 'today')),
        CONSTRAINT outreach_messages_status_check CHECK (status IN (
          'idea', 'drafting', 'drafted', 'needs_review', 'approved', 'scheduled',
          'sending', 'sent', 'delivered', 'bounced', 'replied', 'failed',
          'cancelled', 'expired', 'copied_manual')),
        CONSTRAINT outreach_messages_current_version_positive CHECK (current_version > 0)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_outreach_messages_workspace_status ON outreach_messages (workspace_id, status)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_outreach_messages_contact ON outreach_messages (contact_id)`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_outreach_messages_step ON outreach_messages (sequence_step_id) WHERE sequence_step_id IS NOT NULL`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_message_versions (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id      uuid NOT NULL,
        message_id   uuid NOT NULL REFERENCES outreach_messages(id) ON DELETE CASCADE,
        version      integer NOT NULL,
        kind         text NOT NULL,
        subject      text,
        body         text NOT NULL,
        author       uuid,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outreach_message_versions_unique UNIQUE (message_id, version),
        CONSTRAINT outreach_message_versions_version_positive CHECK (version > 0),
        CONSTRAINT outreach_message_versions_kind_check CHECK (kind IN ('template', 'personalized', 'user_edit'))
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_call_tasks (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id     uuid,
        user_id          uuid NOT NULL,
        contact_id       uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        source           text NOT NULL,
        reason           text NOT NULL,
        objective        text NOT NULL,
        pitch            text,
        expected_outcome text,
        status           text NOT NULL DEFAULT 'proposed',
        scheduled_at     timestamptz,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outreach_call_tasks_source_check CHECK (source IN (
          'laura', 'contacts', 'targets', 'accounts', 'opportunities', 'needs',
          'pool', 'actions', 'sequences', 'today')),
        CONSTRAINT outreach_call_tasks_status_check CHECK (status IN (
          'proposed', 'ready', 'scheduled', 'due', 'started', 'completed',
          'no_answer', 'wrong_person', 'callback', 'qualified', 'refused', 'cancelled'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_outreach_call_tasks_workspace_status ON outreach_call_tasks (workspace_id, status)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_transitions (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id      uuid NOT NULL,
        subject_kind text NOT NULL,
        subject_id   uuid NOT NULL,
        from_state   text,
        to_state     text NOT NULL,
        occurred_at  timestamptz NOT NULL DEFAULT now(),
        actor        uuid,
        actor_kind   text NOT NULL,
        cause        text NOT NULL,
        proof        jsonb,
        tool         text,
        permission   text,
        result       text NOT NULL,
        error        text,
        CONSTRAINT outreach_transitions_subject_kind_check CHECK (subject_kind IN ('message', 'call_task')),
        CONSTRAINT outreach_transitions_actor_kind_check CHECK (actor_kind IN ('user', 'system', 'model')),
        CONSTRAINT outreach_transitions_result_check CHECK (result IN ('applied', 'refused'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_outreach_transitions_subject ON outreach_transitions (subject_kind, subject_id, occurred_at)`,
    )

    for (const table of [
      'outreach_messages',
      'outreach_message_versions',
      'outreach_call_tasks',
      'outreach_transitions',
    ]) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS outreach_transitions`)
    await queryRunner.query(`DROP TABLE IF EXISTS outreach_call_tasks`)
    await queryRunner.query(`DROP TABLE IF EXISTS outreach_message_versions`)
    await queryRunner.query(`DROP TABLE IF EXISTS outreach_messages`)
  }
}
