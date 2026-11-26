import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_policy_caps` — le BARÈME : un plafond par catégorie, et le droit à
 * déduction de TVA de cette catégorie (31/08/2026). La première pièce du refus
 * levé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `cap_cents` NULLABLE — la distinction qui tient tout le reste
 * ─────────────────────────────────────────────────────────────────────────────
 * `NULL` = la politique ne PLAFONNE PAS cette catégorie. Ce n'est pas « plafond
 * zéro », et ce n'est pas non plus « conforme » : une ligne sans plafond est
 * NON VÉRIFIÉE. `lineCapOverageCents` rend alors `null` et
 * `expensePolicyCompliance` bascule le verdict sur `unknown` en NOMMANT combien
 * de lignes n'ont pas pu être comparées.
 *
 * C'est le défaut que ce nullable empêche : un barème incomplet affichait
 * « Conforme » sur une note dont la moitié n'avait été comparée à rien — et
 * « Conforme » est précisément ce qu'un valideur lit pour NE PAS ouvrir les
 * justificatifs. Un verdict ne se conclut pas d'un silence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `vat_recoverable` — un PARAMÈTRE, pas une table de règles fiscales
 * ─────────────────────────────────────────────────────────────────────────────
 * « L'hôtel n'ouvre pas droit à déduction, le restaurant si, le transport de
 * personnes non » est une règle FRANÇAISE, datée, et qui bouge. Codée en dur
 * dans une fonction, elle serait fausse au premier client étranger et périmée à
 * la première réforme — exactement la faute du calendrier de jours fériés en
 * dur qu'on a refusée au relevé d'activité. Elle vit donc dans la donnée, par
 * politique, là où un opérateur peut la corriger sans déploiement.
 *
 * `DEFAULT true` : le cas le plus fréquent est le droit à déduction, et un
 * défaut `false` ferait afficher « 0 € récupérable » sur un barème à peine
 * commencé — un zéro qui se lit comme un fait fiscal.
 */
export class ExpensePolicyCaps1790970000005 implements MigrationInterface {
  public name = 'ExpensePolicyCaps1790970000005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expense_policy_caps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        policy_id uuid NOT NULL REFERENCES expense_policies(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        category text NOT NULL,
        cap_cents bigint CHECK (cap_cents IS NULL OR cap_cents > 0),
        vat_recoverable boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT expense_policy_caps_category_check CHECK (category IN (
          'meal', 'hotel', 'train', 'plane', 'taxi', 'car_rental',
          'fuel', 'toll', 'parking', 'mileage', 'supplies', 'other'
        ))
      )
    `)
    // Une catégorie ne se plafonne qu'une fois par politique : deux lignes
    // « repas » rendraient le plafond appliqué dépendant de l'ordre de lecture.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS expense_policy_caps_policy_category_key
        ON expense_policy_caps (policy_id, category)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS expense_policy_caps_workspace_idx ON expense_policy_caps (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE expense_policy_caps IS
        'Bareme d''une politique de frais (31/08/2026) : un plafond par categorie. cap_cents NULL = categorie NON PLAFONNEE, ce qui rend la ligne NON VERIFIEE (verdict unknown) et jamais conforme. vat_recoverable est une DONNEE et non une regle codee : le droit a deduction est national et date.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS expense_policy_caps`)
  }
}
