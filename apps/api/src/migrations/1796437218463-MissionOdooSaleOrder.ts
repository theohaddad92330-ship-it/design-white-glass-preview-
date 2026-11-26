import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2561/#2562 — LE LIEN MISSION → VENTE ODOO (`missions.odoo_sale_order_id`).
 *
 * François Thomas (call bêta du 17/09/2026, redit avant la démo du 08/10) :
 * « pour Odoo, les ventes représentent les missions/contrats ; proposer de
 * synchroniser ces missions depuis l'outil ». La reprise crée une mission
 * Bellum À PARTIR d'une commande de vente confirmée (`sale.order`) — et il
 * faut savoir, au passage suivant, qu'elle l'a déjà été.
 *
 * POURQUOI PAS `crm_deal_id` : celui-là référence `crm_deal_facts`, le cache
 * des quatre CRM à contrat vérifié. Une vente Odoo n'y est pas : elle se LIT
 * en direct (lecture seule) et n'est stockée nulle part chez nous. On garde
 * donc son identifiant Odoo — un entier — et rien d'autre.
 *
 * L'INDEX UNIQUE PARTIEL est la vraie garantie d'idempotence : deux clics
 * « Reprendre toutes » simultanés ne peuvent pas créer deux missions pour la
 * même vente. Le service vérifie avant d'écrire ; la base tranche la course.
 *
 * Une RÉFÉRENCE, pas une énumération : aucun CHECK, donc rien au `MAPPING` de
 * `check-constraints-cover-enums.spec.ts`. `NULL` = mission saisie à la main
 * ou venue d'ailleurs — le cas ordinaire.
 */
export class MissionOdooSaleOrder1796437218463 implements MigrationInterface {
  public name = 'MissionOdooSaleOrder1796437218463'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS odoo_sale_order_id bigint NULL`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS missions_workspace_odoo_sale_order_uidx
        ON missions (workspace_id, odoo_sale_order_id)
        WHERE odoo_sale_order_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS missions_workspace_odoo_sale_order_uidx`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS odoo_sale_order_id`)
  }
}
