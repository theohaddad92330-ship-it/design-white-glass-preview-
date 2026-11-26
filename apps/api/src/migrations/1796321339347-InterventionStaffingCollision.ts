import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Élargit la file d'intervention à #2206.12 — « collision équipe ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION PART AVANT LE CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit** (gardes GA-11 et GA-12) — même discipline que
 * `1790741205001-InterventionMissionWithoutEndDate.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA NATURE AJOUTE, ET CE QU'ELLE NE DÉPLACE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `detectStaffingCollisions` (`@bellum/contracts/staffing-collision.ts`)
 * existait déjà, pur et testé, et alimentait le diagnostic de pipe
 * (`ProjectPipelineService.health`) et le contexte de Laura — sans jamais
 * ouvrir de ligne d'intervention. Cette migration élargit seulement la
 * contrainte ; `intervention-rules.ts` (`detectStaffingCollisionInterventions`)
 * et `InterventionsSweeper` posent le calcul.
 *
 * `subject_type` n'a PAS besoin d'être élargi : la ligne se pose sur
 * `submission`, admis depuis `1789503118742`.
 */
export class InterventionStaffingCollision1796321339347 implements MigrationInterface {
  name = 'InterventionStaffingCollision1796321339347'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_kind_check`)
    // Les douze existantes DANS LEUR ORDRE, la treizième en fin — même
    // discipline que GA-08 côté TypeScript.
    await queryRunner.query(`
      ALTER TABLE interventions ADD CONSTRAINT interventions_kind_check CHECK (
        kind IN (
          'submission_stalled',
          'renewal_at_risk',
          'invoicing_blocked',
          'account_untouched',
          'rep_inactive',
          'credits_exhausted',
          'account_no_next_action',
          'project_no_decision',
          'need_without_shortlist',
          'timesheet_missing',
          'payment_overdue',
          'mission_without_end_date',
          'staffing_collision'
        )
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On PURGE les lignes de la nouvelle nature avant de resserrer : une
    // contrainte qu'on remet sans nettoyer échoue sur les données existantes.
    await queryRunner.query(`DELETE FROM interventions WHERE kind = 'staffing_collision'`)

    await queryRunner.query(`ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_kind_check`)
    await queryRunner.query(`
      ALTER TABLE interventions ADD CONSTRAINT interventions_kind_check CHECK (
        kind IN (
          'submission_stalled',
          'renewal_at_risk',
          'invoicing_blocked',
          'account_untouched',
          'rep_inactive',
          'credits_exhausted',
          'account_no_next_action',
          'project_no_decision',
          'need_without_shortlist',
          'timesheet_missing',
          'payment_overdue',
          'mission_without_end_date'
        )
      )
    `)
  }
}
