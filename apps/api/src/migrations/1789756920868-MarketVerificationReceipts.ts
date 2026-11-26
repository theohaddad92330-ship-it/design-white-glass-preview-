import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2288.2 — LA CONSERVATION : GARDER CE QUI A ÉTÉ VÉRIFIÉ POUR NE PAS LE
 * REPAYER.
 *
 * ── CE QU'UNE LIGNE EST ──────────────────────────────────────────────────────
 * Un REÇU : « cet espace a fait vérifier ce LIBELLÉ, ce jour-là, pour tant de
 * crédits annoncés ». C'est un fait sur NOTRE geste, pas une donnée sur
 * l'entreprise — la table ne porte donc rien qui ressemble à un jugement, un
 * score ou une probabilité, et aucun rapprochement avec `accounts` : le dépôt
 * refuse déjà de joindre la mémoire marché à un compte par le NOM SEUL (aucun
 * identifiant commun), et l'inventer ici fabriquerait la donnée devinée que la
 * doctrine interdit.
 *
 * ── LA CONTRAINTE D'ABORD, LE CODE ENSUITE (GA-11 / GA-12) ───────────────────
 * `outcome` porte le catalogue FERMÉ du contrat partagé
 * (`marketVerificationReceiptSchema`, `market-verification.ts`) : `verified` et
 * `unknown`. Il n'y a délibérément pas d'`failed` — un temps dépassé n'est pas
 * un échec, il rend « inconnu » et arrête la reprise. Élargir le catalogue se
 * fait ICI, dans une migration, AVANT la première ligne de code qui écrit la
 * nouvelle valeur.
 *
 * ── ON ARCHIVE, ON NE SUPPRIME PAS ───────────────────────────────────────────
 * Re-vérifier n'écrase aucune ligne : l'ancienne prend `archived_at`, la
 * nouvelle s'insère. L'index unique est donc PARTIEL — une seule vérification
 * VIVANTE par libellé et par espace, autant d'archives qu'on veut. Un fait
 * périmé redevient inconnu, il ne disparaît pas.
 *
 * ── UNE CORRECTION HUMAINE GAGNE ─────────────────────────────────────────────
 * `corrected_by_user_id` / `corrected_at` : quand ils sont posés, aucune
 * vérification automatique ne reprend la main sur cette ligne, quelle que soit
 * sa date.
 *
 * ── GA-43 — LE COÛT D'ACCÈS NE S'AGRÈGE JAMAIS ENTRE ESPACES ─────────────────
 * `credits_announced` est SCOPÉ par `workspace_id` et ne se lit que sous ce
 * filtre. Les espaces sont des ESN, donc des concurrents : croiser leurs coûts
 * serait un échange d'informations tarifaires. L'index le dit dans sa forme —
 * aucun index ne permet de balayer la colonne sans l'espace.
 *
 * ── RLS : UN FILET, PAS LA SERRURE ───────────────────────────────────────────
 * L'API se connecte en superuser et contourne RLS ; l'autorisation réelle vit
 * dans la route (`@RequirePermission('analysis:run')`). Les politiques
 * protègent l'autre porte, un accès direct avec un JWT Supabase : on lit SES
 * reçus, les administrateurs de l'espace lisent ceux de LEUR espace. Aucune
 * politique d'écriture — personne n'écrit ici en direct.
 */
export class MarketVerificationReceipts1789756920868 implements MigrationInterface {
  name = 'MarketVerificationReceipts1789756920868'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_verification_receipts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
        consultant_id uuid,
        company_name text NOT NULL,
        company_key text NOT NULL,
        verified_at timestamptz NOT NULL DEFAULT now(),
        outcome text NOT NULL,
        credits_announced integer,
        corrected_by_user_id uuid,
        corrected_at timestamptz,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT market_verification_receipts_outcome_check CHECK (outcome IN ('verified', 'unknown')),
        CONSTRAINT market_verification_receipts_credits_check CHECK (credits_announced IS NULL OR credits_announced >= 0)
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS market_verification_receipts_live_idx
        ON market_verification_receipts (workspace_id, company_key)
        WHERE archived_at IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS market_verification_receipts_workspace_idx
        ON market_verification_receipts (workspace_id, verified_at DESC)
    `)

    await queryRunner.query(`ALTER TABLE market_verification_receipts ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "market_verification_receipts_own_read" ON market_verification_receipts`,
    )
    await queryRunner.query(`
      CREATE POLICY "market_verification_receipts_own_read" ON market_verification_receipts FOR SELECT
        USING (user_id = auth.uid())
    `)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "market_verification_receipts_admin_read" ON market_verification_receipts`,
    )
    await queryRunner.query(`
      CREATE POLICY "market_verification_receipts_admin_read" ON market_verification_receipts FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_verification_receipts`)
  }
}
