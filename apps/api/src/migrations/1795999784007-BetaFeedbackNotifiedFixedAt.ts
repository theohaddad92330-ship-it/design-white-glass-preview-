import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2444.10 — CORRECTION LIVRÉE, NOTIFIE UNE FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * `report-status.ts` calcule l'état d'un signalement (« corrigé » quand le
 * ticket GitHub ferme `COMPLETED`) à chaque LECTURE — un modèle PULL : rien ne
 * prévient l'auteur, il faut qu'il revienne consulter « Mes signalements ».
 *
 * Cette colonne marque le moment où une notification a déjà été envoyée pour
 * la résolution d'UN signalement donné, pour ne l'envoyer qu'une fois — un
 * ticket qui reste fermé ne doit pas renotifier à chaque passage du back-office.
 *
 * Additive seulement : aucune colonne existante n'est touchée, `NULL` par
 * défaut (jamais notifié). `feedback.service.ts` (`notifyResolvedReports`) est
 * le seul écrivain.
 */
export class BetaFeedbackNotifiedFixedAt1795999784007 implements MigrationInterface {
  public name = 'BetaFeedbackNotifiedFixedAt1795999784007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS notified_fixed_at timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE beta_feedback DROP COLUMN IF EXISTS notified_fixed_at`)
  }
}
