import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Historique de signal (restitution V2 §11) — « première détection, changements,
 * fraîcheur, résolution ».
 *
 * Jusqu'ici un signal ne vit QUE dans le blob `accounts.recent_signals`, que
 * chaque analyse réécrit entièrement. Conséquence : on ne sait pas depuis quand
 * un signal est là (la Veille affiche la date DU SIGNAL — un article — pas la
 * date à laquelle Bellum l'a vu pour la première fois), on ne voit pas qu'il a
 * changé, et un signal qui disparaît disparaît sans laisser de trace. Cette
 * migration crée `signal_history`, le substrat qui garde ces quatre faits, puis
 * la backfille depuis les blobs existants.
 *
 * Identité d'un signal = (compte, libellé normalisé). Volontairement PAS la clé
 * (libellé|date|source) du diff de la veille quotidienne : ici, une date ou une
 * source qui bouge est un CHANGEMENT du même signal, pas un signal neuf.
 *
 * Backfill honnête : on ne connaît pas la vraie date de première détection des
 * signaux déjà en base — on sait seulement qu'ils étaient présents dans
 * l'analyse stockée. La ligne est donc datée de `accounts.updated_at` (un
 * timestamp RÉEL, jamais `now()`) et marquée `first_detection_exact = false` :
 * l'UI dira « suivi depuis le … », pas « détecté le … ». Aucune date inventée.
 *
 * RLS = défense en profondeur (l'API tourne en service role qui bypass) : même
 * politique que `opportunities` — membre du workspace, avec repli par le compte
 * parent tant que `workspace_id` peut être transitoirement NULL.
 */
export class SignalHistory1787952416309 implements MigrationInterface {
  public name = 'SignalHistory1787952416309'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS signal_history (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id          uuid,
        account_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        signal_key            text NOT NULL,
        label                 text NOT NULL,
        signal_type           text,
        source                text,
        signal_date           text,
        freshness             text,
        status                text NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'resolved')),
        first_detected_at     timestamptz NOT NULL DEFAULT now(),
        first_detection_exact boolean NOT NULL DEFAULT true,
        last_seen_at          timestamptz NOT NULL DEFAULT now(),
        last_changed_at       timestamptz,
        change_count          integer NOT NULL DEFAULT 0,
        resolved_at           timestamptz
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS signal_history_workspace_status_idx
        ON signal_history (workspace_id, status)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS signal_history_account_idx ON signal_history (account_id)
    `)
    // Idempotence de la (re)matérialisation : (compte, libellé normalisé) est
    // l'identité d'un signal. L'upsert fait alors DO UPDATE sur la fraîcheur et
    // le payload courant, jamais sur `first_detected_at` — une re-analyse ne peut
    // pas réécrire une première détection ancienne avec la date du jour.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS signal_history_account_key_uniq
        ON signal_history (account_id, md5(signal_key))
    `)

    await queryRunner.query(`ALTER TABLE signal_history ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'signal_history'
            AND policyname = 'Members can read their workspace signal history'
        ) THEN
          CREATE POLICY "Members can read their workspace signal history"
            ON signal_history
            FOR SELECT
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1 FROM accounts a
                WHERE a.id = signal_history.account_id
                  AND a.workspace_id IN (
                    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
                  )
              )
            );
        END IF;
      END $$;
    `)

    // ── Backfill déterministe depuis les blobs existants ──────────────────────
    // Un signal par élément labellisé de `recent_signals`. Le libellé se lit dans
    // le MÊME ordre de champs que le diff de la veille (`signalKeys`) : signal →
    // title → label → description → summary. Sans libellé, rien n'est affichable
    // donc rien n'est historisé. `ON CONFLICT DO NOTHING` : re-run sûr, et deux
    // libellés identiques dans le même blob ne font qu'une ligne.
    await queryRunner.query(`
      INSERT INTO signal_history (
        workspace_id, account_id, signal_key, label, signal_type, source, signal_date, freshness,
        status, first_detected_at, first_detection_exact, last_seen_at
      )
      SELECT
        a.workspace_id,
        a.id,
        lower(btrim(COALESCE(s->>'signal', s->>'title', s->>'label', s->>'description', s->>'summary'))),
        btrim(COALESCE(s->>'signal', s->>'title', s->>'label', s->>'description', s->>'summary')),
        NULLIF(btrim(COALESCE(s->>'type', '')), ''),
        NULLIF(btrim(COALESCE(s->>'source', '')), ''),
        NULLIF(btrim(COALESCE(s->>'date', '')), ''),
        NULLIF(btrim(COALESCE(s->>'freshness', '')), ''),
        'active',
        COALESCE(a.updated_at, a.created_at),
        false,
        COALESCE(a.updated_at, a.created_at)
      FROM accounts a
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.recent_signals, '[]'::jsonb)) AS s
      WHERE a.status <> 'deleted'
        AND jsonb_typeof(a.recent_signals) = 'array'
        AND jsonb_typeof(s) = 'object'
        AND NULLIF(btrim(COALESCE(s->>'signal', s->>'title', s->>'label', s->>'description', s->>'summary')), '')
            IS NOT NULL
      ON CONFLICT (account_id, md5(signal_key)) DO NOTHING
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
