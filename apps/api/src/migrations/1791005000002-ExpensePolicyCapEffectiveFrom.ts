import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_policy_caps.effective_from` — la DATE D'EFFET d'un plafond
 * (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN BARÈME SANS DATE EST FAUX DÈS LA PREMIÈRE RÉVISION
 * ─────────────────────────────────────────────────────────────────────────────
 * Le barème est désormais ÉDITABLE (l'écran de réglage de ce lot). Sans date
 * d'effet, relever le plafond repas de 25 € à 28 € en septembre rendrait
 * rétroactivement conformes des notes de mars qui ne l'étaient pas — et
 * inversement, l'abaisser transformerait en dépassement des lignes remboursées
 * il y a six mois. Un verdict déjà rendu ne se réécrit pas parce qu'une règle a
 * changé depuis ; ce qui s'oppose à un contrôle, c'est la règle en vigueur AU
 * MOMENT de la dépense. C'est exactement le raisonnement déjà tenu par
 * `expense_report_attachments.retention_until`, qui est STOCKÉE et non
 * recalculée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NULLABLE, ET C'EST LA DÉCISION DE CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * `NULL` = « en vigueur depuis toujours », et c'est ce que portent les lignes
 * déjà en base. Un `DEFAULT CURRENT_DATE` aurait été le piège : il aurait daté
 * d'aujourd'hui des plafonds en vigueur depuis des mois, et TOUTES les notes
 * antérieures seraient passées de « conforme » à « non vérifiée » du seul fait
 * de la migration. Inventer une date d'effet qu'on n'a pas est une donnée
 * fictive, au même titre qu'inventer un montant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX INDEX UNIQUES, ET NON UN — LE MÊME PIÈGE QUE `expense_policies`
 * ─────────────────────────────────────────────────────────────────────────────
 * Dans PostgreSQL, `UNIQUE (policy_id, category, effective_from)` ne dédoublonne
 * PAS les lignes où `effective_from` est nul : deux plafonds « de tout temps »
 * pour la même catégorie coexisteraient, et le barème appliqué dépendrait de
 * l'ordre physique de lecture. `1790970000004-ExpensePolicies` a déjà payé cette
 * leçon sur `account_id` ; on la rejoue ici, deux index PARTIELS.
 */
export class ExpensePolicyCapEffectiveFrom1791005000002 implements MigrationInterface {
  public name = 'ExpensePolicyCapEffectiveFrom1791005000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE expense_policy_caps ADD COLUMN IF NOT EXISTS effective_from date`)

    // L'ancien index interdisait DEUX plafonds sur la même catégorie ; c'est
    // précisément ce que la date d'effet doit permettre (25 € jusqu'en août,
    // 28 € ensuite). Il tombe, remplacé par les deux partiels.
    await queryRunner.query(`DROP INDEX IF EXISTS expense_policy_caps_policy_category_key`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS expense_policy_caps_policy_category_from_key
        ON expense_policy_caps (policy_id, category, effective_from)
        WHERE effective_from IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS expense_policy_caps_policy_category_always_key
        ON expense_policy_caps (policy_id, category)
        WHERE effective_from IS NULL
    `)

    await queryRunner.query(`
      COMMENT ON COLUMN expense_policy_caps.effective_from IS
        'Date d''effet du plafond. NULL = en vigueur depuis toujours (les lignes anterieures au 31/08/2026). La resolution prend, pour une ligne de frais, le plafond dont la date d''effet est la plus RECENTE parmi celles qui precedent la depense - jamais celui d''apres, qui reecrirait un verdict deja rendu.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS expense_policy_caps_policy_category_from_key`)
    await queryRunner.query(`DROP INDEX IF EXISTS expense_policy_caps_policy_category_always_key`)
    // ⚠️ La colonne n'est PAS retirée : plusieurs plafonds datés peuvent
    // coexister sur une catégorie, et la reprise de l'index unique d'origine
    // échouerait. On archive, on ne supprime pas.
  }
}
