import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Canaux d'entrée (#2048) et unités comparables (#2049) — lot L19.
 *
 * Le questionnaire savait poser trois volumes hebdomadaires et un circuit de
 * commercialisation. Il ne savait pas dire **par quelle porte l'affaire entre**,
 * ni **ce que l'ESN compte réellement, sur quelle période** — si bien qu'aucun
 * taux d'activité n'avait de dénominateur fiable (#2049.14).
 *
 * Six colonnes ADDITIVES, et rien d'autre :
 *  - quatre tableaux de texte pour les quatre facettes des canaux. Ils sont
 *    `NOT NULL DEFAULT '{}'` comme `go_to_market_channels` — la forme déjà en
 *    place pour tous les multi-choix du profil. ⚠️ Le tableau VIDE veut dire
 *    « pas de réponse », jamais « aucun canal » : c'est `channelAuditBuckets`
 *    (`packages/contracts/src/schemas/onboarding/answers-canaux.ts`) qui tient
 *    cette lecture, et ses quatre seaux s'additionnent jusqu'au catalogue ;
 *  - une colonne de texte pour les unités comptées ;
 *  - une colonne de texte NULLABLE pour la période de référence. `NULL` n'est
 *    pas « zéro période » : c'est une question sans réponse, et aucun taux ne
 *    se calcule dessus.
 *
 * Aucune contrainte de valeur : le catalogue vit au contrat (`ESN_ANSWER_OPTIONS`),
 * et une contrainte SQL sur du texte libre empêcherait un ajout de canal de
 * partir avant le code qui l'écrit (GA-11/GA-12) sans rien garder de plus.
 */
export class CanauxEntreeMesures1794020000000 implements MigrationInterface {
  name = 'CanauxEntreeMesures1794020000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_used text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_measured text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_last_starts text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_time_split text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS activity_measures_tracked text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS activity_reference_period text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_used;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_measured;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_last_starts;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_time_split;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS activity_measures_tracked;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS activity_reference_period;
    `)
  }
}
