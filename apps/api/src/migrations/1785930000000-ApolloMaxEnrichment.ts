import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Apollo enrichissement max (photos contacts + logos/firmographie comptes) :
 *   - `contacts.photo_url`         — la photo de profil réelle renvoyée par Apollo
 *     (People Search / People Match, champ gratuit du même appel). NULL = pas de
 *     photo connue → le front garde le fallback initiales. JAMAIS de placeholder
 *     inventé côté back.
 *   - `accounts.logo_url`          — le logo renvoyé par Apollo Organizations
 *     Enrich (1 crédit Apollo / domaine, mis en cache 30 j côté IA). NULL = pas
 *     de logo Apollo → le front peut retomber sur le favicon réel du site
 *     (calculé à l'affichage, jamais persisté).
 *   - `accounts.apollo_enrichment` — le bloc firmographique FACTUEL du même
 *     appel (employés estimés, industrie, année de fondation, LinkedIn/Twitter,
 *     funding, technologies). Champ absent chez Apollo = absent ici, rien
 *     d'inventé.
 *
 * Additif + idempotent (`ADD COLUMN IF NOT EXISTS`), colonnes nullable, aucune
 * donnée existante touchée, RLS inchangée. Migration possédée par NestJS.
 */
export class ApolloMaxEnrichment1785930000000 implements MigrationInterface {
  public name = 'ApolloMaxEnrichment1785930000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS photo_url text`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS logo_url text`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS apollo_enrichment jsonb`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
