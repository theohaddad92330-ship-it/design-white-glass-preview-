import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Facturation en plusieurs devises.
 *
 * Trois colonnes, et la première est celle qui évite l'erreur silencieuse :
 *
 * - `workspaces.billing_country` — le pays qui PAIE. Il faut une colonne à part
 *   parce que `workspaces.country` décrit le MARCHÉ prospecté (il pilote les
 *   sources et les packs pays) : réutiliser cette colonne facturerait en dollars
 *   une ESN française qui prospecte les États-Unis.
 *
 * - `workspaces.billing_currency` — la devise réellement facturée, écrite au
 *   premier paiement. Stripe n'autorise PAS de changer la devise d'un abonnement
 *   existant (il faut l'annuler et en recréer un), donc cette colonne est un
 *   VERROU : une fois posée, l'écran cesse de proposer un choix qui échouerait.
 *   NULL = rien n'a encore été facturé.
 *
 * - `plan_definitions.prices` — les prix DÉCLARÉS dans les autres devises, posés
 *   par l'opérateur dans le backoffice. Volontairement vide au départ : Bellum ne
 *   convertit pas, et un prix converti à la volée change entre l'affichage et le
 *   prélèvement. Tant qu'une devise n'a pas de prix déclaré, le client est
 *   facturé en euros et l'écran le dit AVANT le paiement.
 *
 * `price_cents` reste la référence euro : aucune donnée existante ne bouge.
 */
export class BillingCurrency1789004871253 implements MigrationInterface {
  name = 'BillingCurrency1789004871253'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "billing_country" TEXT`)
    await queryRunner.query(`ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "billing_currency" TEXT`)
    // La contrainte porte la liste vendable : une devise à zéro décimale (JPY)
    // ferait prélever cent fois le prix affiché, et c'est le genre d'erreur
    // qu'on veut voir refusée par la base, pas seulement par le code.
    await queryRunner.query(`
      ALTER TABLE "workspaces"
      ADD CONSTRAINT "workspaces_billing_currency_check"
      CHECK ("billing_currency" IS NULL OR "billing_currency" IN ('eur','usd','gbp','chf','cad'))
    `)
    await queryRunner.query(
      `ALTER TABLE "plan_definitions" ADD COLUMN IF NOT EXISTS "prices" JSONB NOT NULL DEFAULT '{}'::jsonb`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plan_definitions" DROP COLUMN IF EXISTS "prices"`)
    await queryRunner.query(`ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_billing_currency_check"`)
    await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "billing_currency"`)
    await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "billing_country"`)
  }
}
