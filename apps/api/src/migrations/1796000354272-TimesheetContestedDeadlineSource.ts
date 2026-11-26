import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2415.5 / #2415.7 — la quantité CONTESTÉE, la DEADLINE de correction, et QUI
 * a déclaré un relevé d'activité (CRA).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT (#2415.7)
 * ─────────────────────────────────────────────────────────────────────────────
 * `TimesheetRejection1790290000001` a donné au rejet un MOTIF obligatoire —
 * POURQUOI. Elle n'a jamais dit COMBIEN de jours posent problème, ni PAR QUAND
 * la correction est attendue. Un relevé rejeté pouvait porter vingt jours
 * déclarés pour une seule ligne fautive, et rien ne le distinguait d'un relevé
 * entièrement à refaire — le consultant redépose tout, ou rien, à l'aveugle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE : LA CONTRAINTE D'ABORD, LE CODE ENSUITE (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_timesheets_contested_days_check` reprend la forme exacte de
 * `mission_timesheets_rejection_reason_check` : dès qu'une date de rejet
 * existe, la quantité contestée ET la deadline sont non nulles.
 *
 * ⚠️ CORRIGÉ le 23/09/2026 (hotfix, déploiement de la vague 24 refusé) : la
 * première version affirmait qu'« aucune ligne rejetée ne porte encore ces
 * colonnes, la contrainte se valide donc sur une table où elle est vraie
 * partout ». C'était FAUX : la production porte des relevés rejetés AVANT que
 * ces colonnes n'existent, et `ADD CONSTRAINT` a échoué sur eux — transaction
 * annulée, migration jamais appliquée, l'API est restée sur l'ancien code.
 * La règle vaut donc pour tout rejet posé à partir du 24/09/2026 ; un rejet
 * ANTÉRIEUR garde des jours contestés inconnus (« non mesuré », jamais 0 — on
 * n'invente pas après coup combien de jours posaient problème), et rien n'est
 * réécrit. Pas `NOT VALID` : il ferait échouer toute mise à jour ultérieure
 * d'un relevé rejeté ancien (la contrainte se revérifie à chaque UPDATE).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT (#2415.5) — LA SOURCE, PAS UN FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * `submitTimesheet` accepte un `consultantId` DISTINCT de l'appelant : un ops
 * peut déclarer un mois POUR un consultant. Rien ne tracait alors QUI avait
 * réellement cliqué — seulement DE QUI le mois était. `submitted_by` comble ce
 * trou. Bellum ne stocke aucun fichier de preuve sur un relevé d'activité
 * (décision documentée dans `TimesheetReviewDrawer.tsx` — un bouton de dépôt
 * serait une affordance fictive) : la SOURCE d'un CRA, dans ce produit, est QUI
 * l'a déclaré, jamais une pièce jointe. Additive, nullable : les lignes déjà en
 * base n'ont pas cette trace, et ne l'inventent pas rétroactivement.
 */
export class TimesheetContestedDeadlineSource1796000354272 implements MigrationInterface {
  public name = 'TimesheetContestedDeadlineSource1796000354272'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_timesheets
        ADD COLUMN IF NOT EXISTS contested_days numeric,
        ADD COLUMN IF NOT EXISTS correction_deadline date,
        ADD COLUMN IF NOT EXISTS submitted_by uuid
    `)

    await queryRunner.query(`
      ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_contested_days_check
    `)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets ADD CONSTRAINT mission_timesheets_contested_days_check
        CHECK (
          rejected_at IS NULL
          OR rejected_at < TIMESTAMPTZ '2026-09-24 00:00:00+00'
          OR (contested_days IS NOT NULL AND contested_days > 0 AND correction_deadline IS NOT NULL)
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_contested_days_check
    `)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets
        DROP COLUMN IF EXISTS contested_days,
        DROP COLUMN IF EXISTS correction_deadline,
        DROP COLUMN IF EXISTS submitted_by
    `)
  }
}
