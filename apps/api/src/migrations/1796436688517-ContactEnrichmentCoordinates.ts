import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * E1 (07/10/2026, #3698 — décision Louis ; écran #3822, lot C5) — l'état PAR
 * COORDONNÉE d'un enrichissement, et sa trace interne.
 *
 * - `contacts.enrichment_coordinates` (jsonb) : `{ email|phone|linkedin: {
 *   state, sources_queried, at } }` — ce que l'écran affiche (« recherché,
 *   introuvable chez N sources », « en attente »). Forme : `@bellum/contracts`
 *   `EnrichmentCoordinateStates`. Les sources n'y sont jamais NOMMÉES.
 * - `contacts.enrichment_trace` (jsonb) : la trace INTERNE — quelles sources
 *   ont répondu quoi (mesure de couverture), le nonce de la révélation du
 *   mobile attendue par webhook, l'identifiant d'une recherche asynchrone en
 *   cours. Jamais sélectionnée par défaut par l'entité (`select: false`).
 *
 * Aucune table neuve : deux colonnes sur `contacts`, déjà sous RLS.
 *
 * GA-11/12 — `contacts_source_check` s'élargit à `kaspr` et `fullenrich` AVANT
 * le code qui les écrit : `EnrichmentProviders` les estampillait déjà sur
 * `contacts.source` sans que la contrainte les admette (l'écriture entière
 * échouait sur un résultat FullEnrich). Liste réécrite en entier, comme
 * `1796321264660-MeetingContactSource`.
 */
export class ContactEnrichmentCoordinates1796436688517 implements MigrationInterface {
  public name = 'ContactEnrichmentCoordinates1796436688517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_coordinates jsonb`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_trace jsonb`)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual', 'dropcontact', 'demo', 'hunter', 'lusha', 'import', 'crm', 'meeting', 'kaspr', 'fullenrich'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
