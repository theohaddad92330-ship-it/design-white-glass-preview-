import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Élargit la file d'intervention à `MIS-12` — « mission sans date de fin ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION PART AVANT LE CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit** (gardes GA-11 et GA-12). Le contraire ne casse
 * pas au déploiement : il casse au premier balayage nocturne, en silence, et le
 * seul symptôme est une file qui reste vide — indistinguable d'un parc de
 * missions dont toutes les dates de fin sont renseignées. C'est exactement ce
 * que `account_vocabulary.kind` a coûté le 21/07 et `accounts.status` le 22/08.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA NATURE AJOUTE, ET CE QU'ELLE NE DÉPLACE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le produit sait déjà COMPTER les missions sans date de fin — alerte
 * `no_end_date` sur la carte, `withoutEndDateCount` dans l'en-tête du board,
 * cible zéro au KPI du PDF 5. Ce qui manquait est le RAPPEL : personne n'était
 * prévenu, et le reste du module s'interdit d'agir sans cette date
 * (`detectRenewalsAtRisk` se tait, `mission_ending` se tait, le CA restant
 * l'exclut). Le silence est juste ; il n'était adressé à personne.
 *
 * `subject_type` n'a PAS besoin d'être élargi : la ligne se pose sur `mission`,
 * admis depuis `1789503118742`.
 *
 * Le garde-fou « 1 seul » de la source ne demande AUCUNE colonne neuve : il est
 * déjà porté par l'index unique `interventions_unique (workspace_id, kind,
 * subject_id)` posé par `1789419374625`, que `PlaybooksService.open` consomme
 * en `ON CONFLICT DO NOTHING`. La ligne survit à sa résolution, donc le rappel
 * ne repart jamais — un compteur de plus serait une seconde vérité.
 */
export class InterventionMissionWithoutEndDate1790741205001 implements MigrationInterface {
  name = 'InterventionMissionWithoutEndDate1790741205001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_kind_check`)
    // Les onze existantes DANS LEUR ORDRE, la neuve en fin — même discipline
    // que GA-08 côté TypeScript. Une liste recopiée depuis une migration
    // périmée est ce qui a abandonné un déploiement le 21/08.
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On PURGE les lignes de la nouvelle nature avant de resserrer : une
    // contrainte qu'on remet sans nettoyer échoue sur les données existantes, et
    // la migration inverse devient impossible à jouer au moment précis où l'on
    // en a besoin.
    await queryRunner.query(`DELETE FROM interventions WHERE kind = 'mission_without_end_date'`)

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
          'payment_overdue'
        )
      )
    `)
  }
}
