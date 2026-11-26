import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Élargit la file d'intervention aux alertes qui portent sur des PERSONNES.
 *
 * Deux natures s'ajoutent aux quatre existantes, et elles ne visent plus un
 * objet commercial mais quelqu'un :
 *  - `rep_inactive` — un commercial qui n'a rien fait depuis trop longtemps ;
 *  - `credits_exhausted` — un espace au bout de son enveloppe de crédits, donc
 *    une équipe qui va se retrouver bloquée sans l'avoir vu venir.
 *
 * D'où l'élargissement du SECOND verrou : `subject_type` acceptait quatre
 * objets métier, il accepte désormais `user` et `workspace`.
 *
 * **La contrainte est élargie AVANT le code qui écrit ces valeurs.** C'est la
 * règle que le dépôt s'est donnée après l'incident `account_vocabulary.kind` :
 * une valeur qui voyage du code vers la base sans que sa contrainte CHECK ait
 * bougé ne casse pas au déploiement — elle casse au premier balayage nocturne,
 * en silence, et le seul symptôme est une file qui reste vide.
 */
export class InterventionPeopleKinds1789503118742 implements MigrationInterface {
  name = 'InterventionPeopleKinds1789503118742'

  public async up(queryRunner: QueryRunner): Promise<void> {
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

    await queryRunner.query(`ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_subject_check`)
    await queryRunner.query(`
      ALTER TABLE interventions ADD CONSTRAINT interventions_subject_check CHECK (
        subject_type IN ('account', 'project', 'mission', 'submission', 'user', 'workspace')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On PURGE les lignes des nouvelles natures avant de resserrer : une
    // contrainte qu'on remet sans nettoyer échoue sur les données existantes, et
    // la migration inverse devient impossible à jouer au moment précis où l'on
    // en a besoin.
    await queryRunner.query(`DELETE FROM interventions WHERE kind IN ('rep_inactive', 'credits_exhausted')`)
    await queryRunner.query(`DELETE FROM interventions WHERE subject_type IN ('user', 'workspace')`)

    await queryRunner.query(`ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_kind_check`)
    await queryRunner.query(`
      ALTER TABLE interventions ADD CONSTRAINT interventions_kind_check CHECK (
        kind IN ('submission_stalled', 'renewal_at_risk', 'invoicing_blocked', 'account_untouched')
      )
    `)

    await queryRunner.query(`ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_subject_check`)
    await queryRunner.query(`
      ALTER TABLE interventions ADD CONSTRAINT interventions_subject_check CHECK (
        subject_type IN ('account', 'project', 'mission', 'submission')
      )
    `)
  }
}
