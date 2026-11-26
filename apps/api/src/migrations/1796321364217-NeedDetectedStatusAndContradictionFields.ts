import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2323.1 / #2323.38-.42 — LE STATUT `detected` ET LES QUATRE CHAMPS DU MOTEUR
 * DE CONTRADICTIONS (LAU-FINAL-064). Tranchés le 25/09/2026 sans Louis, formes
 * ACTÉES (registre `#2323`, coordinateur) :
 *
 *  · `status` élargi à `detected` — AVANT `to_qualify` (packages/contracts/
 *    src/schemas/need-status.ts). La contrainte est élargie ICI, avant tout
 *    code qui l'écrit (GA-11/GA-12).
 *  · `interview_rounds` (0-10) — le nombre d'entretiens du processus,
 *    STRUCTURÉ plutôt que lu dans `presentation_process` (texte libre).
 *  · `onsite_days_per_week` (0-5) — jours de présence exigés par semaine.
 *  · `freelance_excluded` — le client exclut les freelances sur ce besoin.
 *  · `budget_validated` — le budget de la mission est-il validé côté client.
 *
 * Les quatre colonnes sont NULLABLES, sans défaut : `null` = non renseigné,
 * jamais deviné (doctrine « jamais de donnée fictive »). Voir
 * `packages/contracts/src/schemas/need-contradictions.ts` pour le moteur qui
 * les lit.
 */
export class NeedDetectedStatusAndContradictionFields1796321364217 implements MigrationInterface {
  name = 'NeedDetectedStatusAndContradictionFields1796321364217'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_status_check`)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_status_check CHECK (
        status IN (
          'open','staffed','lost','cancelled','detected',
          'to_qualify','qualified','to_match','matching','shortlist_ready',
          'submitted','client_review','won','on_hold','to_reactivate'
        )
      )
    `)

    await queryRunner.query(`
      ALTER TABLE project_needs
        ADD COLUMN IF NOT EXISTS interview_rounds integer,
        ADD COLUMN IF NOT EXISTS onsite_days_per_week integer,
        ADD COLUMN IF NOT EXISTS freelance_excluded boolean,
        ADD COLUMN IF NOT EXISTS budget_validated boolean
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_interview_rounds_check CHECK (
        interview_rounds IS NULL OR (interview_rounds >= 0 AND interview_rounds <= 10)
      )
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_onsite_days_per_week_check CHECK (
        onsite_days_per_week IS NULL OR (onsite_days_per_week >= 0 AND onsite_days_per_week <= 5)
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_onsite_days_per_week_check`,
    )
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_interview_rounds_check`)
    await queryRunner.query(`
      ALTER TABLE project_needs
        DROP COLUMN IF EXISTS interview_rounds,
        DROP COLUMN IF EXISTS onsite_days_per_week,
        DROP COLUMN IF EXISTS freelance_excluded,
        DROP COLUMN IF EXISTS budget_validated
    `)

    await queryRunner.query(`UPDATE project_needs SET status = 'to_qualify' WHERE status = 'detected'`)
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_status_check`)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_status_check CHECK (
        status IN (
          'open','staffed','lost','cancelled',
          'to_qualify','qualified','to_match','matching','shortlist_ready',
          'submitted','client_review','won','on_hold','to_reactivate'
        )
      )
    `)
  }
}
