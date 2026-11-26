import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le POSITIONNEMENT (T6) — ce qui part réellement chez le client.
 *
 * Le produit savait classer un vivier contre un besoin et réécrire un CV. Il ne
 * gardait aucune trace de ce que le client avait reçu, ni de ce qu'il en avait
 * dit : impossible de préparer une soutenance, impossible de ne pas repousser un
 * profil déjà refusé, impossible de répondre à « combien de profils pour une
 * signature ? ».
 *
 * Trois colonnes portent l'essentiel :
 *
 *  - `submitted_at` — quand le CV est PARTI. C'est le point de départ de toute
 *    mesure de latence ; le déduire de `created_at` compterait le temps de la
 *    sélection interne comme du temps client.
 *  - `first_feedback_at` — le premier retour, quel qu'il soit. `NULL` veut dire
 *    « toujours rien », et c'est une information, pas un trou.
 *  - `cv_snapshot` — la version du CV envoyée, FIGÉE. Le CV du vivier continue
 *    d'évoluer ; sans copie, on ne saurait plus ce que le client a lu.
 *
 * `submissions_unique` empêche de positionner deux fois la même personne sur le
 * même rôle : le doublon se lit comme deux candidatures, et le client le voit.
 */
export class Submissions1789382641057 implements MigrationInterface {
  public name = 'Submissions1789382641057'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        project_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        need_id uuid REFERENCES project_needs(id) ON DELETE SET NULL,
        consultant_id uuid NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
        stage text NOT NULL DEFAULT 'shortlisted',
        stage_entered_at timestamptz NOT NULL DEFAULT now(),
        submitted_at timestamptz,
        first_feedback_at timestamptz,
        closed_at timestamptz,
        outcome_reason text,
        outcome_detail text,
        proposed_rate_cents bigint,
        cv_snapshot text,
        owner_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT submissions_stage_check CHECK (
          stage IN ('shortlisted', 'submitted', 'interview', 'accepted', 'rejected', 'withdrawn')
        ),
        CONSTRAINT submissions_reason_check CHECK (
          outcome_reason IS NULL OR outcome_reason IN (
            'price', 'skills', 'seniority', 'availability', 'other_supplier',
            'need_cancelled', 'candidate_declined', 'no_feedback', 'other'
          )
        )
      )
    `)
    // Une personne, un rôle, un positionnement. `coalesce` parce qu'un projet
    // sans rôle nommé reste un couple valide — et que `NULL` ne s'égale pas
    // lui-même dans un index unique.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS submissions_unique
        ON submissions (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid))
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS submissions_workspace_idx ON submissions (workspace_id, stage, updated_at DESC)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS submissions_consultant_idx ON submissions (consultant_id)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS interviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
        workspace_id uuid,
        scheduled_at timestamptz NOT NULL,
        mode text NOT NULL DEFAULT 'remote',
        client_attendees text[] NOT NULL DEFAULT '{}',
        -- « pending » par défaut : l'absence de verdict n'est pas un échec, et
        -- ranger un entretien à venir dans « négatif » fausserait tout.
        outcome text NOT NULL DEFAULT 'pending',
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT interviews_mode_check CHECK (mode IN ('onsite', 'remote', 'phone')),
        CONSTRAINT interviews_outcome_check CHECK (outcome IN ('pending', 'positive', 'negative', 'no_show'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS interviews_submission_idx ON interviews (submission_id, scheduled_at DESC)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS submission_feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
        workspace_id uuid,
        technical text NOT NULL DEFAULT 'unknown',
        experience text NOT NULL DEFAULT 'unknown',
        communication text NOT NULL DEFAULT 'unknown',
        price text NOT NULL DEFAULT 'unknown',
        -- Ce que le client a dit, TEL QUEL. Reformuler un retour client, c'est
        -- perdre la seule phrase qui servira en soutenance.
        verbatim text,
        recorded_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT submission_feedback_verdicts_check CHECK (
          technical IN ('unknown', 'below', 'meets', 'above')
          AND experience IN ('unknown', 'below', 'meets', 'above')
          AND communication IN ('unknown', 'below', 'meets', 'above')
          AND price IN ('unknown', 'below', 'meets', 'above')
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS submission_feedback_submission_idx ON submission_feedback (submission_id, created_at DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS submission_feedback`)
    await queryRunner.query(`DROP TABLE IF EXISTS interviews`)
    await queryRunner.query(`DROP TABLE IF EXISTS submissions`)
  }
}
