import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2155.13 à .21 — « Mes cibles » (décision de Louis du 14/09/2026, D5 de #2150).
 *
 * Deux tables neuves, et rien d'autre : porte « ajout seulement ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN ÉLÉMENT RÉFÉRENCE ET NE COPIE PAS (#2155.14 / .15 / .28)
 * ─────────────────────────────────────────────────────────────────────────────
 * `target_list_items` porte `account_id` OU `contact_id` — la contrainte
 * `target_list_items_one_ref_check` refuse les deux et refuse aucun. Aucune
 * colonne de nom, de titre ou d'entreprise : une cible qui recopierait la fiche
 * divergerait d'elle à la première correction. Les clés étrangères sont
 * `ON DELETE CASCADE` DANS CE SENS-LÀ : supprimer la fiche retire l'élément,
 * retirer l'élément ne touche jamais la fiche.
 *
 * Les trois contraintes d'énumération naissent AVEC leurs colonnes et couvrent
 * exactement `TARGET_WORK_STATUSES`, `TARGET_PROVENANCES` et `TARGET_PRIORITIES`
 * (GA-12). `priority` est nullable : `null` = pas encore posée, jamais « basse ».
 */
export class TargetLists1793700400000 implements MigrationInterface {
  name = 'TargetLists1793700400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS target_lists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        created_by uuid NOT NULL,
        name text NOT NULL,
        objective text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS target_lists_workspace_idx ON target_lists (workspace_id)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS target_list_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        target_list_id uuid NOT NULL REFERENCES target_lists(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id uuid NULL REFERENCES accounts(id) ON DELETE CASCADE,
        contact_id uuid NULL REFERENCES contacts(id) ON DELETE CASCADE,
        priority text NULL,
        owner_user_id uuid NULL,
        work_status text NOT NULL DEFAULT 'to_review',
        provenance text NOT NULL DEFAULT 'manual',
        next_action text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT target_list_items_one_ref_check CHECK (num_nonnulls(account_id, contact_id) = 1),
        CONSTRAINT target_list_items_priority_check CHECK (priority IS NULL OR priority IN ('high', 'medium', 'low')),
        CONSTRAINT target_list_items_work_status_check CHECK (work_status IN ('to_review', 'in_progress', 'contacted', 'done', 'dropped')),
        CONSTRAINT target_list_items_provenance_check CHECK (provenance IN ('manual', 'discover', 'import', 'analysis'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS target_list_items_workspace_idx ON target_list_items (workspace_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS target_list_items_list_idx ON target_list_items (target_list_id)`,
    )
    // Un même compte (ou contact) n'entre qu'une fois dans une même liste.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS target_list_items_list_account_uniq ON target_list_items (target_list_id, account_id) WHERE account_id IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS target_list_items_list_contact_uniq ON target_list_items (target_list_id, contact_id) WHERE contact_id IS NOT NULL`,
    )

    await queryRunner.query(`ALTER TABLE target_lists ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`ALTER TABLE target_list_items ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS target_list_items`)
    await queryRunner.query(`DROP TABLE IF EXISTS target_lists`)
  }
}
