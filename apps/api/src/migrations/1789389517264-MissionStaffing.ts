import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le STAFFING et les conditions commerciales (T7).
 *
 * `mission_assignments` existait depuis le Delivery OS et n'était câblée à rien.
 * Cette migration ne la recrée pas — elle lui ajoute ce qui lui manquait pour
 * servir, et pose la table des conditions commerciales.
 *
 * `mission_assignments_workspace_idx` : la table ne portait pas d'espace, donc
 * toute lecture passait par une jointure sur `missions`. C'est tenable pour lire
 * UNE mission, pas pour répondre à « qui est libre en septembre ? », qui balaye
 * tout le vivier. La colonne est dénormalisée comme sur `project_needs`.
 *
 * `mission_commercial_terms` est une table À PART et non des colonnes de plus sur
 * `missions` : son contenu est réservé à `finance:read`, et une donnée dont
 * l'accès diffère du reste de la ligne se protège mal quand elle vit dans la
 * même ligne. Séparée, la requête qui la lit est celle qu'on garde.
 */
export class MissionStaffing1789389517264 implements MigrationInterface {
  public name = 'MissionStaffing1789389517264'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mission_assignments ADD COLUMN IF NOT EXISTS workspace_id uuid`)
    // Reprise : les affectations existantes héritent de l'espace de leur mission.
    await queryRunner.query(`
      UPDATE mission_assignments a
         SET workspace_id = m.workspace_id
        FROM missions m
       WHERE m.id = a.mission_id AND a.workspace_id IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS mission_assignments_workspace_idx
        ON mission_assignments (workspace_id, consultant_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS mission_assignments_consultant_idx
        ON mission_assignments (consultant_id, starts_on)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_commercial_terms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        workspace_id uuid,
        -- Coût CHARGÉ journalier, en CENTIMES et saisi à la main (arbitrage
        -- Louis). Aucune formule ne le devine : il dépend du statut, de la
        -- convention collective et de la politique de l'ESN. Un coût moyen
        -- appliqué à tout le monde produirait une marge fausse, plus dangereuse
        -- qu'une marge absente.
        loaded_daily_cost_cents bigint,
        po_number text,
        billing_cadence text,
        -- Préavis contractuel : ce qui décide QUAND il faut agir sur un
        -- renouvellement, indépendamment des fenêtres J-60 / J-30 génériques.
        notice_days integer,
        notes text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_terms_cadence_check CHECK (
          billing_cadence IS NULL OR billing_cadence IN ('monthly', 'milestone', 'fixed_price')
        )
      )
    `)
    // Une seule ligne de conditions par mission : deux jeux de conditions sur la
    // même mission rendraient la marge non déterministe.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mission_commercial_terms_unique ON mission_commercial_terms (mission_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_commercial_terms`)
    await queryRunner.query(`DROP INDEX IF EXISTS mission_assignments_consultant_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS mission_assignments_workspace_idx`)
    await queryRunner.query(`ALTER TABLE mission_assignments DROP COLUMN IF EXISTS workspace_id`)
  }
}
