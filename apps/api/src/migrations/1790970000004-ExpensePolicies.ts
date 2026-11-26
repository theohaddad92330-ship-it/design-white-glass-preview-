import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_policies` — la politique de remboursement, PARAMÉTRABLE PAR CLIENT
 * (31/08/2026). La quatrième pièce du refus levé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `account_id` NULLABLE — et l'index partiel qui va avec
 * ─────────────────────────────────────────────────────────────────────────────
 * `account_id IS NULL` désigne la politique par DÉFAUT de l'espace — le
 * « barème interne » de la maquette. Non nulle, c'est la politique NÉGOCIÉE
 * avec ce client-là, qui l'emporte.
 *
 * Deux index uniques, et pas un seul : dans Postgres, `UNIQUE (workspace_id,
 * account_id)` ne dédoublonne PAS les lignes où `account_id` est nul — deux
 * politiques par défaut coexisteraient, et le service en choisirait une au
 * hasard selon l'ordre de lecture. L'index PARTIEL sur `WHERE account_id IS
 * NULL` est ce qui rend la politique par défaut réellement unique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `reimbursement_basis` — au RÉEL ou au BARÈME
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux bases, parce qu'elles ne se remboursent pas pareil : « au réel » paie le
 * ticket (et le plafond sert d'alerte), « au barème » paie le forfait quel que
 * soit le ticket. Le produit AFFICHE la base et le dépassement ; il ne décide
 * pas à la place du valideur — la décision de rembourser un dépassement est un
 * geste de gestion, pas une règle qu'on peut coder.
 */
export class ExpensePolicies1790970000004 implements MigrationInterface {
  public name = 'ExpensePolicies1790970000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expense_policies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid,
        label text NOT NULL,
        reimbursement_basis text NOT NULL DEFAULT 'actual',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT expense_policies_basis_check CHECK (reimbursement_basis IN ('actual', 'scale'))
      )
    `)
    // La politique NÉGOCIÉE d'un client : une seule par (espace, client).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS expense_policies_workspace_account_key
        ON expense_policies (workspace_id, account_id)
        WHERE account_id IS NOT NULL
    `)
    // La politique PAR DÉFAUT : une seule par espace. Sans cet index PARTIEL,
    // `UNIQUE (workspace_id, account_id)` laisserait passer deux lignes nulles.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS expense_policies_workspace_default_key
        ON expense_policies (workspace_id)
        WHERE account_id IS NULL
    `)
    await queryRunner.query(`
      COMMENT ON TABLE expense_policies IS
        'Politique de remboursement des frais (31/08/2026). account_id NULL = la politique par DEFAUT de l''espace (le bareme interne) ; non nulle = celle negociee avec ce client, qui l''emporte. Les deux index uniques sont PARTIELS : sans cela, deux politiques par defaut coexisteraient.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS expense_policies`)
  }
}
