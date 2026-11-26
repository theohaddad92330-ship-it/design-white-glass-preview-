import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Mobilité et préférences de mission (PDF 3 §8.2 et §8.3).
 *
 * Le vivier n'avait qu'un `zones[]` en texte libre, où « IDF », « Lyon » et
 * « remote » se mélangeaient. Le matching y cherchait la sous-chaîne
 * « remote » — ce qui marche jusqu'au jour où quelqu'un écrit « télétravail ».
 *
 * Trois décisions :
 *
 * 1. `zones[]` n'est PAS migré ni supprimé. Il porte des données réelles, et
 *    les réinterpréter automatiquement produirait des mobilités inventées. Les
 *    nouveaux champs s'ajoutent à côté et valent quand ils sont renseignés.
 * 2. Tout est NULLABLE, sans défaut. Le §8.2 est explicite : « rarement présent
 *    dans un CV, `null` par défaut, et l'écran propose de le DEMANDER plutôt
 *    que de deviner ». Un défaut à `indifferent` ferait proposer des missions
 *    sur site à quelqu'un qui n'a jamais dit qu'il acceptait.
 * 3. Les préférences filtrent en AVERTISSEMENT, jamais en exclusion (§8.3) —
 *    d'où des colonnes de PRÉFÉRENCE distinctes de `sectors`, qui est une
 *    preuve d'expérience et non un souhait.
 */
export class TalentMobilityPreferences1789579634812 implements MigrationInterface {
  public name = 'TalentMobilityPreferences1789579634812'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS mobility_zones text[]`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS remote_preference text`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_remote_check`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_remote_check
        CHECK (remote_preference IS NULL OR remote_preference IN ('sur_site', 'hybride', 'full_remote', 'indifferent'))
    `)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS travel_acceptance text`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_travel_check`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_travel_check
        CHECK (travel_acceptance IS NULL OR travel_acceptance IN ('aucun', 'ponctuel', 'frequent'))
    `)
    // Booléen NULLABLE, et c'est délibéré : `false` veut dire « a dit non »,
    // `null` veut dire « on n'a pas demandé ». Les confondre ferait écarter
    // quelqu'un sur une réponse qu'il n'a jamais donnée.
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS relocation boolean`)

    // Préférences de mission (§8.3). Distinctes de `sectors`, qui est une
    // PREUVE d'expérience et non un souhait.
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS wanted_sectors text[]`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS refused_sectors text[]`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS refused_technologies text[]`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS wanted_contract_kinds text[]`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'wanted_contract_kinds',
      'refused_technologies',
      'refused_sectors',
      'wanted_sectors',
      'relocation',
      'travel_acceptance',
      'remote_preference',
      'mobility_zones',
    ]) {
      await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS ${column}`)
    }
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_travel_check`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_remote_check`)
  }
}
