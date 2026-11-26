import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Élargit la file d'intervention aux CINQ natures du cockpit du commercial.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, ET POURQUOI CE N'ÉTAIT PAS CINQ CHANTIERS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bloc « Ce qui m'attend » (§2.4 de la source du cockpit) demande six
 * natures. La file en portait six, mais c'étaient celles du tableau de bord du
 * RESPONSABLE — une seule des six demandées y répondait, sous un autre nom
 * (`renewal_at_risk` = « mission non sécurisée »).
 *
 * Quatre des cinq manquantes étaient DÉJÀ détectées et mesurées ailleurs :
 * `laura-probe.service.ts` compte les comptes sans prochaine action, les
 * besoins ouverts sans profil positionné, les relevés manquants après relances
 * et les encaissements en retard. Elles produisaient des bulles de Laura ou des
 * notifications de routine — jamais une ligne OUVRABLE, CLASSABLE et
 * ATTRIBUABLE. C'est le motif que ce dépôt connaît par cœur : du code juste,
 * calculé, testé, que personne n'appelle.
 *
 * La cinquième, « projet sans décision », n'existait sous aucune forme dans la
 * file. Son seuil n'est pas inventé : la source demande « la durée type de
 * l'étape », et cette durée type existe déjà, par étape, dans
 * `MISSION_BOARD_STALE_DAYS` — c'est elle qui pose déjà l'alerte `stale` sur les
 * cartes de PROJET du board Missions (`mission-board.service.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION PART AVANT LE CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit** (gardes GA-11 et GA-12). Le contraire ne casse
 * pas au déploiement : il casse au premier balayage nocturne, en silence, et le
 * seul symptôme est une file qui reste vide — indistinguable d'une équipe qui
 * n'a aucun problème. C'est exactement ce que `account_vocabulary.kind` a coûté
 * le 21/07, et ce que `accounts.status = 'prospect'` a coûté le 22/08.
 *
 * `subject_type` n'a PAS besoin d'être élargi : les cinq natures se posent sur
 * `account`, `project` et `mission`, qui sont déjà admis depuis
 * `1789503118742`. Un relevé, un besoin et un mois de facturation ne sont pas
 * des objets de premier plan du produit — ils se lisent depuis leur MISSION ou
 * leur PROJET, et c'est déjà la convention de `invoicing_blocked`, qui porte
 * l'identifiant d'une ligne `invoice_readiness` sous `subject_type = 'mission'`.
 * Le sujet dit quel écran ouvrir, pas de quelle table sort l'identifiant.
 */
export class InterventionCommercialKinds1790700000001 implements MigrationInterface {
  name = 'InterventionCommercialKinds1790700000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_kind_check`)
    // Les six existantes en tête, DANS LEUR ORDRE, puis les cinq neuves en fin :
    // même discipline que GA-08 côté TypeScript. Une liste recopiée depuis une
    // migration périmée est ce qui a abandonné un déploiement le 21/08.
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On PURGE les lignes des nouvelles natures avant de resserrer : une
    // contrainte qu'on remet sans nettoyer échoue sur les données existantes, et
    // la migration inverse devient impossible à jouer au moment précis où l'on
    // en a besoin.
    await queryRunner.query(
      `DELETE FROM interventions
        WHERE kind IN (
          'account_no_next_action',
          'project_no_decision',
          'need_without_shortlist',
          'timesheet_missing',
          'payment_overdue'
        )`,
    )

    await queryRunner.query(`ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_kind_check`)
    await queryRunner.query(`
      ALTER TABLE interventions ADD CONSTRAINT interventions_kind_check CHECK (
        kind IN (
          'submission_stalled',
          'renewal_at_risk',
          'invoicing_blocked',
          'account_untouched',
          'rep_inactive',
          'credits_exhausted'
        )
      )
    `)
  }
}
