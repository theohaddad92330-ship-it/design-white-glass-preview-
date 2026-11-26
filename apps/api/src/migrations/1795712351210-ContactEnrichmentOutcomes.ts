import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2120.61 / #2120.64 / #2120.68 / #2120.70 — un enrichissement qui ne trouve
 * rien de MIEUX doit le DIRE, pas écraser.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `last_enrichment_result` (migration 1786500000000) était `text` SANS
 * contrainte — 'matched' | 'no_new_data' n'étaient garantis que par le zod
 * (`@bellum/contracts`), jamais par la base. Deux résultats manquaient
 * complètement au vocabulaire :
 *
 *  - `ambiguous`      : deux fiches actives du même compte partagent le nom
 *    qu'on s'apprête à retenir. On ne sait pas laquelle Apollo a trouvée —
 *    choisir serait une fusion silencieuse (doctrine : « on PROPOSE une
 *    fusion de doublons, on ne fusionne JAMAIS »). Rien n'est écrit.
 *  - `newer_data_exists` : l'arbitre de provenance (`applyFieldUpdates`,
 *    `field_provenance`) a REFUSÉ au moins un champ facturable — une
 *    correction humaine ou un connecteur protège une valeur que le pipeline
 *    ne peut pas écraser (doctrine : « une correction humaine gagne toujours,
 *    quelle que soit sa date »). Rien n'a été perdu, mais ce n'est pas non
 *    plus un « rien trouvé » ordinaire : le résultat le distingue.
 *
 * Toute valeur qui voyage du code vers la base voit sa contrainte SQL
 * élargie AVANT le code qui l'écrit (GA-11/GA-12) — cette migration passe
 * donc dans un commit séparé, avant celui qui écrit 'ambiguous' et
 * 'newer_data_exists'. La contrainte n'existait pas : on ne l'élargit pas,
 * on la POSE déjà à la bonne taille, exactement comme `contacts_source_check`
 * (`1788800000005-AddOfficialEnricherSources.ts`) l'a fait pour `source`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `email_confidence` / `phone_confidence` (#2120.68) — la confiance PAR
 * CHAMP, jamais une probabilité (doctrine : aucune PROBABILITÉ). Vocabulaire
 * réemployé de `PROJECT_CONFIDENCE_LEVELS` (@bellum/contracts,
 * `schemas/project.ts`) : 'high' | 'medium' | 'low', déjà rendu en français
 * "Confiance élevée/moyenne/faible" sur les besoins commerciaux — un
 * deuxième vocabulaire aurait dit la même chose autrement. NULL = non
 * mesurée (GA-18/19 : « non mesuré » n'est jamais une valeur basse), jamais
 * devinée depuis une URL ou un mot-clé.
 *
 * `email_cost_credits` / `phone_cost_credits` (#2120.70) — le coût ENGAGÉ
 * pour CE champ, dans l'unique monnaie visible du produit (crédits,
 * `@bellum/contracts/billing/credit-weights`), jamais agrégé entre espaces
 * (GA-43). NULL = aucun appel payant n'a fourni ce champ (saisie manuelle,
 * import CRM, valeur héritée) — jamais 0.
 */
export class ContactEnrichmentOutcomes1795712351210 implements MigrationInterface {
  public name = 'ContactEnrichmentOutcomes1795712351210'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_last_enrichment_result_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_last_enrichment_result_check
      CHECK (last_enrichment_result IS NULL OR last_enrichment_result IN ('matched', 'no_new_data', 'ambiguous', 'newer_data_exists'))
    `)

    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_confidence text`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_confidence text`)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_confidence_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_email_confidence_check
      CHECK (email_confidence IS NULL OR email_confidence IN ('high', 'medium', 'low'))
    `)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_confidence_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_phone_confidence_check
      CHECK (phone_confidence IS NULL OR phone_confidence IN ('high', 'medium', 'low'))
    `)

    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_cost_credits integer`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_cost_credits integer`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
