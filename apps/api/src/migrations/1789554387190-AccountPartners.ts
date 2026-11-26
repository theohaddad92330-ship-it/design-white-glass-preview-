import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les ESN présentes sur un compte (PDF 2 §4.1, décision D11).
 *
 * Le domaine Partenaire n'existait pas — le PDF 1 l'avait constaté (« ni
 * `partner`, ni `partner_placement` ») et laissé hors périmètre en attendant sa
 * spécification. Louis a tranché : un onglet dédié, parce que la stratégie
 * rang 1 se pilote au niveau compte.
 *
 * `relationship` n'est pas décoratif : un rang 1 avec qui on travaille est une
 * porte d'entrée, un rang 1 avec qui on ne travaille pas est un mur. Les ranger
 * tous les deux sous « présent » ferait rater la moitié des ouvertures.
 *
 * `source` distingue ce que QUELQU'UN a saisi de ce que le pipeline a détecté.
 * Un concurrent repéré par une analyse et jamais confirmé n'a pas la même
 * autorité qu'un partenaire déclaré par le commercial qui travaille avec lui,
 * et l'écran le dit.
 */
export class AccountPartners1789554387190 implements MigrationInterface {
  name = 'AccountPartners1789554387190'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_partners (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        entity_id uuid REFERENCES account_entities(id) ON DELETE SET NULL,
        name text NOT NULL,
        rank text NOT NULL DEFAULT 'unknown',
        relationship text NOT NULL DEFAULT 'unknown',
        note text,
        source text NOT NULL DEFAULT 'declared',
        placements integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT account_partners_rank_check CHECK (rank IN ('rank1','rank2','unknown')),
        CONSTRAINT account_partners_relationship_check CHECK (relationship IN ('partner','competitor','unknown')),
        CONSTRAINT account_partners_source_check CHECK (source IN ('declared','analysis')),
        CONSTRAINT account_partners_placements_check CHECK (placements >= 0)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS account_partners_account_idx ON account_partners (account_id)`)
    // Deux lignes pour la même ESN sur le même compte donneraient deux rangs
    // contradictoires, et la recommandation dépendrait de l'ordre de lecture.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_partners_unique
        ON account_partners (account_id, lower(name))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_partners`)
  }
}
