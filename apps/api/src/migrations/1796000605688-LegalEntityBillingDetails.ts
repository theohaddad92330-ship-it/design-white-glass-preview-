import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2422.3 — la société du workspace porte aussi TVA, adresse et devise.
 *
 * Additive : trois colonnes nullables sur une table déjà là (`legal_entities`,
 * migration `LegalEntities1789523841096`). Une société existante sans TVA
 * saisie n'a pas de facture qui en dépend — le champ se lit « non renseigné »,
 * jamais une chaîne vide qui aurait l'air d'un choix.
 */
export class LegalEntityBillingDetails1796000605688 implements MigrationInterface {
  name = 'LegalEntityBillingDetails1796000605688'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE legal_entities
        ADD COLUMN IF NOT EXISTS vat_number text,
        ADD COLUMN IF NOT EXISTS address text,
        ADD COLUMN IF NOT EXISTS currency text
    `)
    // Même garde que `country` : une devise mal saisie (2 lettres, un code
    // libre) se découvrirait sur une facture plutôt qu'à la saisie.
    await queryRunner.query(`
      ALTER TABLE legal_entities
        ADD CONSTRAINT legal_entities_currency_check CHECK (currency IS NULL OR char_length(currency) = 3)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE legal_entities DROP CONSTRAINT IF EXISTS legal_entities_currency_check`)
    await queryRunner.query(`
      ALTER TABLE legal_entities
        DROP COLUMN IF EXISTS vat_number,
        DROP COLUMN IF EXISTS address,
        DROP COLUMN IF EXISTS currency
    `)
  }
}
