import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #balayage-weekly-digest — 15/09/2026, Louis (« un balayage avec simulation
 * et compte affiché AVANT d'écrire, même forme que le balayage de
 * régénération des contextes »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE BALAYAGE ASSUME (pour la relecture juridique du consentement aux
 * notifications, en cours cette semaine)
 * ─────────────────────────────────────────────────────────────────────────────
 * `1785890000000-WeeklyDigestPreference` a ajouté `weekly_digest` en
 * `NOT NULL DEFAULT true` : additive, elle n'a RIEN réécrit — Postgres a
 * backfillé `true` sur toutes les lignes déjà là. Un `true` backfillé n'est
 * PAS un consentement : personne n'a coché quoi que ce soit. Ce fichier ajoute
 * la seule colonne dont un futur balayage a besoin pour être RÉVERSIBLE et
 * TRACÉ (doctrine « on archive, on ne supprime pas ») : la date à laquelle une
 * ligne donnée a été repassée à `false` par ce mécanisme, distincte d'un
 * opt-out réel de l'utilisateur (qui ne pose jamais cette date).
 *
 * Additive, idempotente (`ADD COLUMN IF NOT EXISTS`), nullable — aucune
 * contrainte rétrécie (GA-11 / GA-12). Ne touche AUCUNE ligne existante : le
 * balayage lui-même (service `AdminWeeklyDigestSweepService`) écrit avec un
 * compte confirmé, jamais cette migration.
 */
export class WeeklyDigestSweptAt1794100650321 implements MigrationInterface {
  public name = 'WeeklyDigestSweptAt1794100650321'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS weekly_digest_swept_at TIMESTAMPTZ`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
