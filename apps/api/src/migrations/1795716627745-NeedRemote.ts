import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2173.29 — LE TÉLÉTRAVAIL D'UN BESOIN.
 *
 * Le registre du 16/09 (`OpenNeedRow.remote` cherché, absent) constatait
 * qu'aucun champ `remote`/`teletravail` n'existait ni sur `project_needs` ni
 * dans le contrat — reconfirmé le 18/09 (lot G3) : `match.ts` porte bien un
 * `remote` mais c'est le moteur de MATCHING consultant, jamais alimenté
 * depuis une colonne du besoin lui-même.
 *
 * La contrainte s'élargit AVANT le code qui écrit (GA-11 / GA-12) : cette
 * migration part en premier, le formulaire et la colonne d'écran suivent.
 *
 * Quatre valeurs, RÉUTILISÉES (GA-26) — pas une cinquième énumération pour la
 * même idée : ce sont exactement celles de `talent_preferences.remote`
 * (`consultants.remote_preference`, migration `1789xxx-Talent…`) et de
 * `talent.workMode`. `NULL` = personne ne l'a dit, jamais un défaut
 * `'sur_site'` — c'est pourquoi la colonne naît SANS `DEFAULT`.
 */
export class NeedRemote1795716627745 implements MigrationInterface {
  name = 'NeedRemote1795716627745'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs ADD COLUMN IF NOT EXISTS remote text`)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_remote_check CHECK (
        remote IS NULL OR remote IN ('sur_site','hybride','full_remote','indifferent')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_remote_check`)
    await queryRunner.query(`ALTER TABLE project_needs DROP COLUMN IF EXISTS remote`)
  }
}
