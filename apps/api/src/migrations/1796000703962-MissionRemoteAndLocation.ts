import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2191.17 / #2191.18 — LE TÉLÉTRAVAIL ET LE LIEU DE LA MISSION, REPRIS DU BESOIN.
 *
 * Le registre du 16/09 (`registre-2026-09-16-missions.md`, #2191.17/#2191.18)
 * confirme la source : `project_needs.remote` (#2173.29,
 * `1795716627745-NeedRemote.ts`) et `project_needs.location` existent déjà
 * côté BESOIN — rien d'équivalent sur `missions`. Le champ n'est ni un besoin
 * ni une mission distincte : c'est la MÊME information, qui doit pouvoir
 * survivre à la mission une fois le besoin refermé (`project_needs` n'est pas
 * relu par la fiche mission après le handoff).
 *
 * La contrainte s'élargit AVANT le code qui écrit (GA-11/GA-12). Quatre
 * valeurs RÉUTILISÉES (GA-26), pas une cinquième énumération pour la même
 * idée : exactement `REMOTE_PREFERENCES` (`talent-preferences.ts`), déjà
 * partagée par `consultants.remote_preference` et `project_needs.remote`.
 * `NULL` = non repris (besoin sans rôle certain, ou need sans valeur déclarée)
 * — jamais un défaut `'sur_site'`, colonne SANS `DEFAULT`.
 *
 * `location` reste du texte libre, comme `project_needs.location` : aucune
 * énumération à couvrir, donc aucune entrée `CHECK`.
 */
export class MissionRemoteAndLocation1796000703962 implements MigrationInterface {
  name = 'MissionRemoteAndLocation1796000703962'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS remote_preference text`)
    await queryRunner.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS location text`)
    await queryRunner.query(`
      ALTER TABLE missions ADD CONSTRAINT missions_remote_preference_check CHECK (
        remote_preference IS NULL OR remote_preference IN ('sur_site','hybride','full_remote','indifferent')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_remote_preference_check`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS remote_preference`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS location`)
  }
}
