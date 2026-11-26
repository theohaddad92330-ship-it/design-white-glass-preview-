import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le portefeuille d'offre STRUCTURÉ (addendum Stelya §5, D-ST-01).
 *
 * Ce que la colonne porte, et pourquoi elle n'est pas douze colonnes : le
 * portefeuille est une CONFIGURATION versionnée (type de société, secteurs
 * d'application, politique de site, géographie, familles d'interlocuteurs,
 * lexique, portée de réutilisation des retours). Douze colonnes obligeraient
 * une migration à chaque champ ajouté par un domaine métier ; le contrat zod
 * (`packages/contracts/src/schemas/offer-portfolio.ts`) fait foi sur la forme,
 * et il tolère champ par champ ce qu'un build plus ancien ne connaît pas.
 *
 * NULLABLE, sans backfill, et c'est le cœur de la non-régression : un profil
 * sans portefeuille lit exactement le chemin historique (`offer_domain` puis
 * `offer_domains`) et produit des prompts byte-identiques. La PRÉSENCE de
 * l'objet est l'interrupteur — pas un drapeau, donc pas un drapeau à oublier.
 *
 * Les domaines eux-mêmes ne sont PAS recopiés ici : ils restent dans
 * `offer_domains` (migration `1790001573428`). Deux copies du même réglage
 * divergent au premier écran qui n'écrit que l'une des deux.
 */
export class EsnProfileOfferPortfolioObject1790010284617 implements MigrationInterface {
  name = 'EsnProfileOfferPortfolioObject1790010284617'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS offer_portfolio jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS offer_portfolio`)
  }
}
