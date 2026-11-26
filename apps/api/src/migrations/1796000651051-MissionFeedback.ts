import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `mission_feedback` — #2412, le double pouls de satisfaction d'une mission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_feedback` / `MissionFeedback` : zéro occurrence dans `apps/api/src`,
 * `apps/web/src` et `packages/contracts/src` avant ce lot. Le dépôt savait
 * recueillir un avis AVANT une mission (`submission_feedback`,
 * `submission_consultant_feedback` — le retour sur un POSITIONNEMENT) ; rien ne
 * recueillait d'avis PENDANT une mission active.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME
 * ─────────────────────────────────────────────────────────────────────────────
 * Table À PART, comme `mission_expenses` : une ligne de feedback n'est ni
 * corrigée ni fusionnée (`account-feedback` fait le même choix), donc pas de
 * `updated_at`. `rail` sépare CLIENT et CONSULTANT — deux faits qui ne se
 * moyennent jamais (doctrine « un score n'est jamais nu », #2412.1/.8).
 * `private` gouverne la visibilité (#2412.10) : `true` = visible du seul
 * auteur, jamais de l'équipe ni du client. `source` reprend le vocabulaire
 * DÉJÀ en place (`FIELD_SOURCES`) plutôt que d'inventer un second axe.
 */
export class MissionFeedback1796000651051 implements MigrationInterface {
  public name = 'MissionFeedback1796000651051'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        rail text NOT NULL,
        note text NOT NULL,
        private boolean NOT NULL DEFAULT false,
        source text NOT NULL DEFAULT 'human',
        recorded_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_feedback_rail_check CHECK (rail IN ('client', 'consultant')),
        CONSTRAINT mission_feedback_source_check CHECK (source IN ('human', 'connector', 'pipeline', 'model')),
        CONSTRAINT mission_feedback_note_not_blank CHECK (btrim(note) <> '')
      )
    `)
    // La lecture de la fiche : « le pouls de CETTE mission, du plus récent,
    // rail par rail » — l'index porte les deux clés de ce tri.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS mission_feedback_mission_idx
        ON mission_feedback (mission_id, rail, created_at DESC)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`, comme
    // `mission_expenses` — sans cet index, chaque reset de salle scannerait la
    // table entière.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS mission_feedback_workspace_idx ON mission_feedback (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE mission_feedback IS
        '#2412 - le double pouls de satisfaction (client/consultant) d une mission active. Deux rails jamais fusionnes en un score. private=true visible du seul auteur.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_feedback`)
  }
}
