import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2879 (#2442.14) — le PREMIER compteur de sécurité du dépôt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE TABLE, ET POURQUOI UNE SEULE ESPÈCE POUR L'INSTANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `LAU-FINAL-156` (#2442) demande quatre compteurs de sécurité (accès refusé,
 * cross-tenant, injection, export massif) : zéro n'existait. Ce lot livre le
 * premier, le seul dont le producteur est mécanique et unique — TOUTE requête
 * refusée pour authentification ou permission traverse `GlobalExceptionFilter`
 * (`APP_FILTER`, un seul filtre pour toute l'API) — les trois autres espèces
 * n'ont PAS ce chokepoint (une tentative cross-tenant, une injection ou un
 * export massif se détectent chacune à un endroit métier différent) : ce sont
 * des sous-chantiers séparés, pas une ligne de plus ici.
 *
 * `kind` est un CHECK fermé à UNE valeur aujourd'hui, posé pour grandir : une
 * prochaine espèce s'AJOUTE par une migration qui élargit ce CHECK (GA-08 — un
 * enum ne perd jamais de valeur, n'en insère jamais au milieu), jamais une
 * seconde table.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUNE DONNÉE PERSONNELLE, AUCUNE RLS
 * ─────────────────────────────────────────────────────────────────────────────
 * `workspace_id` est NULLABLE et SANS clé étrangère : la plupart des 401/403
 * surviennent AVANT toute résolution d'espace (jeton absent ou invalide). Ce
 * n'est ni une donnée de compte ni une donnée de personne — même statut que
 * `provider_costs` (aucune RLS, lu par le seul service-role du back-office,
 * jamais par un utilisateur). `path` est la ROUTE seule, jamais la requête
 * complète (aucun paramètre, aucun corps).
 *
 * AJOUT SEULEMENT — aucune colonne existante n'est touchée, aucun code déjà en
 * production ne lit cette table avant ce lot.
 */
export class SecurityEvents1796322009123 implements MigrationInterface {
  public name = 'SecurityEvents1796322009123'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS security_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind text NOT NULL,
        status_code smallint NOT NULL,
        workspace_id uuid,
        path text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT security_events_kind_check CHECK (kind IN ('authorization_denied')),
        CONSTRAINT security_events_status_code_check CHECK (status_code IN (401, 403))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS security_events_kind_created_at_idx ON security_events (kind, created_at)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS security_events`)
  }
}
