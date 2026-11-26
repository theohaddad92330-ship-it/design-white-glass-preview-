import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2172.37 — L'OBJECTIF SAISI À LA CONVERSION D'UNE PISTE DEVIENT UNE COLONNE.
 *
 * `leadConversionSchema` demande cinq champs à la conversion d'une piste en
 * opportunité. Quatre atterrissent déjà quelque part : l'étape et le porteur
 * sont des colonnes d'`opportunities`, la prochaine action est une ligne de
 * `tasks`, le besoin une ligne de `project_needs`. Le cinquième — « ce qu'on
 * cherche à obtenir » — n'avait AUCUNE colonne : l'écran ne pouvait donc pas le
 * demander sans le jeter, et c'est pour ça qu'il ne le demandait pas.
 *
 * EN AJOUT SEULEMENT, nullable et sans défaut (GA-11 / GA-12 : la colonne
 * existe avant le code qui l'écrit). Aucune ligne existante ne change de sens,
 * et `NULL` veut dire « aucun objectif écrit » — ce qui n'est pas une chaîne
 * vide, et surtout pas un objectif deviné depuis le libellé du besoin.
 */
export class OpportunityObjective1794120000000 implements MigrationInterface {
  public name = 'OpportunityObjective1794120000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS objective text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
