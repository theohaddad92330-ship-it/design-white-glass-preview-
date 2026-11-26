import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2035.10 — LE RÉGLAGE D'ESPACE DU REVERSE MARKET.
 *
 * ── POURQUOI CETTE TABLE, PAS UNE COLONNE SUR `workspaces` ────────────────────
 * Même forme que `workspace_rules` (migration `1789808789203`) : une ligne
 * PAR ESPACE, créée seulement au premier changement — un espace qui n'a jamais
 * touché ce réglage n'a AUCUNE ligne, et lit le défaut de code
 * (`DEFAULT_MAX_RECRUITERS_SHOWN = 10`, l'ancien `REVERSE_MARKET_RECRUITERS_MAX`
 * en dur dans `reverse-market.ts`) — comportement inchangé pour tout le monde
 * tant que personne n'a réglé quoi que ce soit.
 *
 * ── UNE CAPACITÉ, JAMAIS UNE PROBABILITÉ ───────────────────────────────────────
 * `max_recruiters_shown` borne le NOMBRE de recruteurs affichés par consultant
 * (§6.2, `rankRecruiters`) — jamais une chance de réponse. Le CHECK (1-50)
 * tient la même borne que l'écran : zéro n'a pas de sens (ce serait masquer
 * l'écran), et au-delà de 50 la liste cesse d'être lisible.
 *
 * ── RLS : UN FILET, PAS LA SERRURE ─────────────────────────────────────────────
 * L'API se connecte en superuser ; l'autorisation réelle (`team:manage`) vit
 * dans le service. La politique protège l'autre porte, un accès direct avec un
 * JWT Supabase : un membre LIT le réglage de son espace, aucune politique
 * d'écriture.
 */
export class WorkspaceReverseMarketSettings1795725441307 implements MigrationInterface {
  name = 'WorkspaceReverseMarketSettings1795725441307'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_reverse_market_settings (
        workspace_id uuid PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
        max_recruiters_shown integer NOT NULL DEFAULT 10,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_reverse_market_settings_max_recruiters_shown_check
          CHECK (max_recruiters_shown BETWEEN 1 AND 50)
      )
    `)

    await queryRunner.query(`ALTER TABLE workspace_reverse_market_settings ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "workspace_reverse_market_settings_member_read" ON workspace_reverse_market_settings`,
    )
    await queryRunner.query(`
      CREATE POLICY "workspace_reverse_market_settings_member_read" ON workspace_reverse_market_settings FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_reverse_market_settings`)
  }
}
