import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2403.12 — LA SOURCE « APPEL EN COURS », PAR UTILISATEUR, AVEC EXPIRATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2403.13 a déjà livré « aucune intervention pendant une réunion CONNUE » en
 * lisant l'agenda déjà synchronisé — la variante conforme d'alors, parce que ce
 * dépôt n'avait aucune source d'état LIVE (téléphonie, capteur de réunion). Ce
 * lot AJOUTE la source manquante (décision Louis 28/09/2026, `SOURCES-28-09.md`
 * : un point classé A — donnée absente — n'est plus un reste, on ajoute la
 * source) : un webhook de téléphonie entrant, signé PAR ESPACE, qui pose un
 * état en cours/terminé par utilisateur.
 *
 * `telephony_connections.webhook_secret_enc` — chiffré comme `credentials_enc`
 * (même colonne, même crypto AES-256-GCM), NULLABLE : une connexion existante
 * n'a pas encore de secret tant que l'espace n'a pas fait tourner
 * `POST /telephony/webhook-secret/rotate` — aucune migration de données à
 * inventer, le webhook reste simplement inactif jusque-là (503, jamais un
 * webhook non vérifiable accepté par défaut).
 *
 * `telephony_call_states` — une ligne PAR MEMBRE avec un état posé et son
 * EXPIRATION (jamais un état qui ne périme pas, voir l'entité). RLS alignée
 * sur `reverse_market_dismissals` (#2968, migration
 * `1796321341823-ReverseMarketDismissals.ts`) : lecture par soi-même, ou par
 * un owner/admin de l'espace.
 */
export class TelephonyCallState1796349700419 implements MigrationInterface {
  name = 'TelephonyCallState1796349700419'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE telephony_connections
        ADD COLUMN IF NOT EXISTS webhook_secret_enc text
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS telephony_call_states (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
        state text NOT NULL,
        call_id text NOT NULL,
        expires_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (workspace_id, user_id),
        -- GA-177: named rather than inline, to stay visible to GA-12
        -- (check-constraints-cover-enums.spec.ts) -- see its MAPPING entry to
        -- callInProgressStateSchema (@bellum/contracts, telephony.ts).
        CONSTRAINT telephony_call_states_state_check CHECK (state IN ('in_progress', 'terminated'))
      )
    `)
    // Sert la lecture de Laura : « CE membre est-il en appel MAINTENANT ? ».
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_telephony_call_states_lookup
        ON telephony_call_states (workspace_id, user_id, expires_at)
    `)

    await queryRunner.query(`ALTER TABLE telephony_call_states ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "telephony_call_states_own_read" ON telephony_call_states`)
    await queryRunner.query(`
      CREATE POLICY "telephony_call_states_own_read" ON telephony_call_states FOR SELECT
        USING (user_id = auth.uid())
    `)
    await queryRunner.query(`DROP POLICY IF EXISTS "telephony_call_states_admin_read" ON telephony_call_states`)
    await queryRunner.query(`
      CREATE POLICY "telephony_call_states_admin_read" ON telephony_call_states FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS telephony_call_states`)
    await queryRunner.query(`ALTER TABLE telephony_connections DROP COLUMN IF EXISTS webhook_secret_enc`)
  }
}
