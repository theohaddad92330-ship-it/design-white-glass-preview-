import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La période par canal — #2048.13 (lot L19).
 *
 * `1794020000000-CanauxEntreeMesures.ts` a posé quatre facettes des canaux
 * d'entrée (utilisé / mesuré / derniers démarrages / temps consacré) mais pas
 * la cinquième que l'issue demandait aussi : **pour quel canal la PÉRIODE des
 * chiffres est-elle connue**. Sans elle, un volume déclaré reste un ordre de
 * grandeur — « vingt appels » ne se compare à rien tant qu'on ignore si c'est
 * par semaine ou par trimestre (même principe que `activity_reference_period`
 * côté #2049, mais ICI par canal : un canal peut avoir des chiffres frais
 * quand un autre ne les tient plus que « depuis toujours »).
 *
 * Une colonne ADDITIVE, `NOT NULL DEFAULT '{}'` comme ses quatre sœurs — le
 * tableau VIDE veut dire « pas de réponse », jamais « aucune période connue »
 * (`channelAuditBuckets`, `packages/contracts/src/schemas/onboarding/answers-canaux.ts`).
 */
export class EntryChannelsPeriod1794110000000 implements MigrationInterface {
  name = 'EntryChannelsPeriod1794110000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_period text[] NOT NULL DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_period;
    `)
  }
}
