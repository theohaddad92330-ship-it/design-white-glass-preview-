import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La RELATION avec une ESN — privée à l'espace (tome 4, D61).
 *
 * Distincte de `esn_directory` (l'entité, partagée) et de `account_partners`
 * (qui est en place chez un compte client). Trois objets, trois questions ; les
 * fondre obligerait chaque lecture à filtrer ce qui ne la concerne pas, et
 * ferait remonter la relation d'un espace dans le référentiel de tous.
 *
 * Le lien se fait par le SIREN et non par une clé étrangère : une ESN peut
 * entrer dans un pipeline partenaire AVANT d'être résolue au registre — c'est
 * même le cas normal quand un commercial rencontre quelqu'un en rendez-vous.
 */
export class PartnerRelations1789995612094 implements MigrationInterface {
  name = 'PartnerRelations1789995612094'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS partner_relations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        siren text,
        name text NOT NULL,
        stage text NOT NULL DEFAULT 'identifie'
          CONSTRAINT partner_relations_stage_check CHECK (stage IN (
            'identifie', 'qualifie', 'contacte', 'en_discussion',
            'cadre_signe', 'flux_actif', 'dormant', 'retire'
          )),
        roles text[] NOT NULL DEFAULT '{}',
        contact_name text,
        contact_email text,
        notes text,
        needs_received_90d integer NOT NULL DEFAULT 0,
        needs_given_90d integer NOT NULL DEFAULT 0,
        placements_active integer NOT NULL DEFAULT 0,
        placements_total integer NOT NULL DEFAULT 0,
        last_activity_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Une ESN une seule fois par espace : deux lignes pour la même maison
    // produiraient deux historiques, et l'un des deux serait faux.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS partner_relations_unique_name
         ON partner_relations (workspace_id, lower(name))`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS partner_relations_workspace_stage
         ON partner_relations (workspace_id, stage)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS partner_relations`)
  }
}
