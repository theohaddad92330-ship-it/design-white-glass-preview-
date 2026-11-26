import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2968 — « MASQUER » UN ENVIRONNEMENT DU REVERSE MARKET, PAR PERSONNE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MÊME PATRON QUE `similar_account_dismissals` (#2127.37, QCM de Louis du
 * 15/09/2026), APPLIQUÉ ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * PERSISTANT, PAR PERSONNE, archive jamais suppression — la même décision,
 * reprise pour la même NATURE de geste (masquer une suggestion qu'on ne veut
 * plus voir, sans l'effacer pour les autres membres de l'espace).
 * `dismissed_at` NULLABLE plutôt qu'une ligne par événement : un second
 * masquage de la même entreprise ne crée pas une seconde ligne, il rafraîchit
 * la même. Une correction humaine (démasquer) gagne toujours, quelle que soit
 * sa date.
 *
 * `company_key` — jamais un `companyId` — parce qu'une entreprise de
 * « Environnements compatibles » N'EST PAS une ligne de la base : c'est un nom
 * rendu par la mémoire marché (`MarketContextMatch.companyName`), qui ne porte
 * aucun identifiant commun avec `accounts` (GA-43 / doctrine « aucun
 * identifiant commun (SIREN) »). `marketVerificationKey` (même normalisation
 * que `market_verification_receipts`) est la clé stable : casse et espaces de
 * bord ignorés. `company_name` voyage à côté, tel qu'envoyé, pour que la
 * lecture n'ait pas besoin d'un second aller-retour à la mémoire marché pour
 * réafficher le libellé d'une ligne masquée.
 *
 * `consultant_id` borne le masquage à LA FICHE où le geste a été fait — masquer
 * Thales depuis la fiche de Camille ne masque rien depuis celle de Léo : ce
 * n'est pas la même question (« où positionner CE consultant »).
 */
export class ReverseMarketDismissals1796321341823 implements MigrationInterface {
  name = 'ReverseMarketDismissals1796321341823'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reverse_market_dismissals (
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
        consultant_id uuid NOT NULL,
        company_key text NOT NULL,
        company_name text NOT NULL,
        dismissed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, user_id, consultant_id, company_key)
      )
    `)
    // Sert la lecture des états d'une fiche : « les entreprises masquées par
    // CETTE personne sur CE consultant » — index PARTIEL, une ligne démasquée
    // (`dismissed_at IS NULL`) n'a pas à y figurer.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reverse_market_dismissals_active
        ON reverse_market_dismissals (workspace_id, user_id, consultant_id)
        WHERE dismissed_at IS NOT NULL
    `)

    await queryRunner.query(`ALTER TABLE reverse_market_dismissals ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "reverse_market_dismissals_own_read" ON reverse_market_dismissals`)
    await queryRunner.query(`
      CREATE POLICY "reverse_market_dismissals_own_read" ON reverse_market_dismissals FOR SELECT
        USING (user_id = auth.uid())
    `)
    await queryRunner.query(`DROP POLICY IF EXISTS "reverse_market_dismissals_admin_read" ON reverse_market_dismissals`)
    await queryRunner.query(`
      CREATE POLICY "reverse_market_dismissals_admin_read" ON reverse_market_dismissals FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reverse_market_dismissals`)
  }
}
