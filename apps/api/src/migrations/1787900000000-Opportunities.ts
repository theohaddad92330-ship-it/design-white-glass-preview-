import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Opportunity Graph — base propriétaire des besoins (restitution V2 §6-7).
 *
 * Jusqu'ici « Besoins » est une projection à la volée du blob `raw_analysis`
 * (aucune matérialisation) : impossible de dater une opportunité, de la sourcer,
 * ou de suivre son cycle de vie (nouveau → confirmé → obsolète → transformé →
 * converti). Cette migration crée la table `opportunities` qui devient le
 * substrat de cette capitalisation, puis la **backfille de façon déterministe**
 * depuis les analyses existantes — aucune donnée inventée, tout dérive de ce que
 * l'IA a déjà produit (pains / it_challenges / program_names / it_implications).
 *
 * Ce qui reste (slice 2, fait à part avec soin) : le hook de matérialisation à
 * la complétion d'analyse (garder la table fraîche pour les NOUVELLES analyses),
 * l'endpoint de lecture et l'UI cycle-de-vie/confiance/cross-comptes.
 *
 * RLS = défense en profondeur (l'API tourne en service role qui bypass) : une
 * ligne est visible aux membres de son workspace, avec repli via le compte parent
 * tant que `workspace_id` peut être transitoirement NULL (même schéma que les
 * autres tables métier).
 */
export class Opportunities1787900000000 implements MigrationInterface {
  public name = 'Opportunities1787900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id      uuid,
        account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        kind              text NOT NULL,
        label             text NOT NULL,
        detail            text,
        offer             text,
        source            text,
        confidence        text,
        urgency           text,
        lifecycle_status  text NOT NULL DEFAULT 'nouveau'
          CHECK (lifecycle_status IN ('nouveau', 'confirme', 'obsolete', 'transforme', 'converti')),
        first_detected_at timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS opportunities_workspace_lifecycle_idx
        ON opportunities (workspace_id, lifecycle_status)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS opportunities_account_idx ON opportunities (account_id)
    `)
    // Idempotence de la (re)matérialisation : une opportunité est identifiée par
    // (compte, nature, libellé). ON CONFLICT préserve alors lifecycle_status +
    // first_detected_at — la qualification manuelle et la date de 1re détection
    // survivent aux re-analyses (c'est tout l'intérêt du cycle de vie).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS opportunities_account_kind_label_uniq
        ON opportunities (account_id, kind, md5(label))
    `)

    await queryRunner.query(`ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'opportunities'
            AND policyname = 'Members can read their workspace opportunities'
        ) THEN
          CREATE POLICY "Members can read their workspace opportunities"
            ON opportunities
            FOR SELECT
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1 FROM accounts a
                WHERE a.id = opportunities.account_id
                  AND a.workspace_id IN (
                    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
                  )
              )
            );
        END IF;
      END $$;
    `)

    // ── Backfill déterministe depuis les analyses existantes ──────────────────
    // Une ligne par besoin, projetée du blob JSONB (mêmes clés que
    // `AccountsService.listAccountNeeds`). `source` = la nature (d'où vient le
    // besoin) ; `confidence` = échelle par force de preuve (pain > chantier /
    // projet > implication déduite). Libellé vide → ligne ignorée. ON CONFLICT
    // DO NOTHING → re-run sûr, jamais de doublon.

    // 1) Douleurs exprimées (raw_analysis.pains[]) — la preuve la plus forte.
    await queryRunner.query(`
      INSERT INTO opportunities (workspace_id, account_id, kind, label, detail, offer, urgency, source, confidence)
      SELECT a.workspace_id, a.id, 'pain',
             NULLIF(btrim(p->>'pain'), ''), NULLIF(p->>'business_impact', ''), NULLIF(p->>'esn_offer', ''),
             NULLIF(p->>'urgency', ''), 'pain', 'high'
      FROM accounts a
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.raw_analysis -> 'pains', '[]'::jsonb)) AS p
      WHERE a.status <> 'deleted'
        AND jsonb_typeof(a.raw_analysis -> 'pains') = 'array'
        AND NULLIF(btrim(p->>'pain'), '') IS NOT NULL
      ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
    `)

    // 2) Chantiers IT (accounts.it_challenges[]).
    await queryRunner.query(`
      INSERT INTO opportunities (workspace_id, account_id, kind, label, detail, offer, source, confidence)
      SELECT a.workspace_id, a.id, 'challenge',
             NULLIF(btrim(c->>'title'), ''), NULLIF(c->>'description', ''), NULLIF(c->>'esn_offer_match', ''),
             'challenge', 'medium'
      FROM accounts a
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.it_challenges, '[]'::jsonb)) AS c
      WHERE a.status <> 'deleted'
        AND jsonb_typeof(a.it_challenges) = 'array'
        AND NULLIF(btrim(c->>'title'), '') IS NOT NULL
      ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
    `)

    // 3) Projets nommés (raw_analysis.program_names[]) — chaîne OU objet {name,…}.
    await queryRunner.query(`
      INSERT INTO opportunities (workspace_id, account_id, kind, label, detail, source, confidence)
      SELECT a.workspace_id, a.id, 'program',
             NULLIF(btrim(COALESCE(pr->>'name', pr#>>'{}')), ''), NULLIF(pr->>'description', ''),
             'program', 'medium'
      FROM accounts a
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.raw_analysis -> 'program_names', '[]'::jsonb)) AS pr
      WHERE a.status <> 'deleted'
        AND jsonb_typeof(a.raw_analysis -> 'program_names') = 'array'
        AND NULLIF(btrim(COALESCE(pr->>'name', pr#>>'{}')), '') IS NOT NULL
      ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
    `)

    // 4) Implication ESN (raw_analysis.it_implications_for_esn) — déduction, pas
    //    un fait sourcé → confiance faible.
    await queryRunner.query(`
      INSERT INTO opportunities (workspace_id, account_id, kind, label, source, confidence)
      SELECT a.workspace_id, a.id, 'implication',
             NULLIF(btrim(a.raw_analysis ->> 'it_implications_for_esn'), ''), 'implication', 'low'
      FROM accounts a
      WHERE a.status <> 'deleted'
        AND NULLIF(btrim(a.raw_analysis ->> 'it_implications_for_esn'), '') IS NOT NULL
      ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
