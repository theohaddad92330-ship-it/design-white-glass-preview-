import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le bon de commande d'une mission — sa DATE, son MONTANT, son VOLUME de jours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_commercial_terms.po_number` existait seul, et il était recopié en
 * lecture seule (`MissionDetailTabs.tsx`) — un chargé d'affaires savait QU'UN
 * bon de commande existait, jamais CE QU'IL RESTE. Cette migration ajoute les
 * trois termes qui manquaient pour répondre à la question. Trois colonnes,
 * toutes NULLABLES : un bon de commande peut n'être connu que partiellement,
 * et c'est l'état normal en début de mission — le rendre obligatoire aurait
 * transformé « je ne sais pas encore » en une erreur de saisie.
 *
 * `po_amount_cents` est en CENTIMES et `bigint`, jamais un flottant — même
 * raison que `loaded_daily_cost_cents` juste à côté : un flottant approxime,
 * un centime facturé ne se négocie pas.
 *
 * `po_volume_days` est `numeric` et non `integer` : les demi-journées existent
 * déjà sur `mission_timesheets.days`, et un bon de commande de 49,5 jours n'a
 * aucune raison de ne pas exister.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION N'AJOUTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les jours CONSOMMÉS. Ils se DÉRIVENT de `mission_timesheets` — le même filtre
 * de statuts déjà en place dans `revenue.service.ts#produced` et
 * `propagation.service.ts#marginsOf` (`status NOT IN ('expected', 'missing',
 * 'not_required')`) — et ne se stockent nulle part : une dérivation vit à un
 * seul endroit (GA-26), et une colonne recopiée divergerait du jour où un
 * relevé est corrigé sans repasser par elle.
 */
export class MissionPurchaseOrderVolume1790900000009 implements MigrationInterface {
  public name = 'MissionPurchaseOrderVolume1790900000009'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD COLUMN IF NOT EXISTS po_issued_on date,
        ADD COLUMN IF NOT EXISTS po_amount_cents bigint,
        ADD COLUMN IF NOT EXISTS po_volume_days numeric
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP COLUMN IF EXISTS po_volume_days,
        DROP COLUMN IF EXISTS po_amount_cents,
        DROP COLUMN IF EXISTS po_issued_on
    `)
  }
}
