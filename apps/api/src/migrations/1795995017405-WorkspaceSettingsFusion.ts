import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2035.10 / #2035.11 — fusionné le 21/09/2026, deux implémentations concurrentes.
 *
 * ── CE QUI S'EST PASSÉ ────────────────────────────────────────────────────────
 * Deux vagues d'intégration lancées en parallèle le 21/09/2026 ont construit les
 * mêmes deux réglages d'espace sans se voir. La vague 2 est partie EN PRODUCTION
 * à 11 h 18 (`1795725441307-WorkspaceReverseMarketSettings`,
 * `1795725445531-WorkspaceCommercialLoadSettings`) ; la vague 3 portait les
 * mêmes sujets sur une SECONDE paire de tables `..._capacity_settings`
 * (`1789720229628-WorkspaceCapacitySettings`), renommée par un intégrateur pour
 * qu'elles coexistent — ce qui laissait `max_open_needs` défini des DEUX côtés,
 * exactement ce que GA-26 interdit.
 *
 * Décision de Louis du 21/09/2026 : **on fusionne en une seule paire**.
 *
 * ── POURQUOI UN `ADD COLUMN`, ET RIEN D'AUTRE ─────────────────────────────────
 * Les tables qui SURVIVENT sont celles de la production : elles portent déjà des
 * données réelles. Cette migration ne recrée rien, ne renomme rien, ne déplace
 * rien — elle AJOUTE aux tables existantes les colonnes que la vague 3 avait
 * mises ailleurs. Aucune donnée existante n'est touchée : les deux colonnes
 * ajoutées sur `workspace_reverse_market_settings` prennent leur défaut
 * (`enabled = false`, capacité NULL) sur les lignes déjà écrites, ce qui est
 * exactement l'état « jamais réglé » qu'elles décrivent.
 *
 * `max_open_needs` NE BOUGE PAS : il est déjà sur
 * `workspace_commercial_load_settings` avec son défaut de 15, et il y reste.
 * Il ne se duplique pas, il ne se déplace pas.
 *
 * La paire `..._capacity_settings` n'a JAMAIS existé en production (sa branche
 * n'était pas fusionnée — vérifié par `git merge-base --is-ancestor
 * f2e0e5634217a4228826a42e376d0f79f1a9e2d6 origin/main`, qui répond NON) : sa
 * migration est donc SUPPRIMÉE, pas annulée. Rien à détruire.
 *
 * ── LA CONTRAINTE SQL AVANT LE CODE QUI ÉCRIT (GA-11/GA-12) ───────────────────
 * Chaque colonne neuve naît avec son CHECK, et le contrat TypeScript
 * (`packages/contracts/src/schemas/workspace-capacity.ts`) dit la même borne :
 * capacité de réponse 1-500, dossiers suivis 1-500. `NULL` reste permis des deux
 * côtés — « non renseigné » n'est pas zéro (GA-18/GA-19).
 *
 * ── HORODATAGE ────────────────────────────────────────────────────────────────
 * Instant réel de l'écriture : **1789995017405** (21/09/2026 14:50:17.405).
 * Reporté de +6 000 000 000 ms sur la série du dépôt, dont les migrations les
 * plus récentes portent 1795725507899 : une migration qui ALTÈRE une table DOIT
 * s'exécuter après celle qui la CRÉE, et l'horloge de la série court devant
 * celle de cette machine. Les millisecondes réelles sont conservées telles
 * quelles — le nombre n'est pas rond, aucune collision possible.
 */
export class WorkspaceSettingsFusion1795995017405 implements MigrationInterface {
  name = 'WorkspaceSettingsFusion1795995017405'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // #2035.10 — le marché inversé rejoint sa table de production.
    await queryRunner.query(`
      ALTER TABLE workspace_reverse_market_settings
        ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_reverse_market_settings
        ADD COLUMN IF NOT EXISTS response_capacity_per_week integer
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_reverse_market_settings
        DROP CONSTRAINT IF EXISTS workspace_reverse_market_settings_response_capacity_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_reverse_market_settings
        ADD CONSTRAINT workspace_reverse_market_settings_response_capacity_check CHECK (
          response_capacity_per_week IS NULL
          OR (response_capacity_per_week >= 1 AND response_capacity_per_week <= 500)
        )
    `)

    // #2035.11 — le plafond de dossiers suivis rejoint celui des besoins ouverts.
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        ADD COLUMN IF NOT EXISTS max_tracked_accounts integer
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        DROP CONSTRAINT IF EXISTS workspace_commercial_load_settings_max_tracked_accounts_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        ADD CONSTRAINT workspace_commercial_load_settings_max_tracked_accounts_check CHECK (
          max_tracked_accounts IS NULL OR (max_tracked_accounts >= 1 AND max_tracked_accounts <= 500)
        )
    `)
  }

  /**
   * Le retour en arrière retire UNIQUEMENT ce que cette migration a ajouté —
   * jamais les tables ni `max_recruiters_shown` / `max_open_needs`, qui
   * existaient avant elle et portent des données de production.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        DROP CONSTRAINT IF EXISTS workspace_commercial_load_settings_max_tracked_accounts_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings DROP COLUMN IF EXISTS max_tracked_accounts
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_reverse_market_settings
        DROP CONSTRAINT IF EXISTS workspace_reverse_market_settings_response_capacity_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_reverse_market_settings DROP COLUMN IF EXISTS response_capacity_per_week
    `)
    await queryRunner.query(`ALTER TABLE workspace_reverse_market_settings DROP COLUMN IF EXISTS enabled`)
  }
}
