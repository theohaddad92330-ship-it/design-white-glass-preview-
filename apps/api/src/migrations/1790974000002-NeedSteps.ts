import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `need_steps` — les « prochaines étapes » d'un besoin, COCHABLES (dossier du
 * 26/08, image 02).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA REMPLACE, ET CE QUE ÇA NE REMPLACE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `needNextAction` (`packages/contracts/src/schemas/need-next-action.ts`) rend
 * UNE étiquette DÉRIVÉE — « lancer le matching », « envoyer la shortlist » — et
 * elle n'est pas cochable : elle disparaît d'elle-même quand la donnée sous-
 * jacente change. C'est une dérivation, elle vit à un seul endroit, et cette
 * table ne la touche pas (garde GA-26).
 *
 * La maquette demande autre chose : une LISTE de tâches qu'un recruteur écrit
 * lui-même (« organiser les entretiens », « envoyer la proposition
 * commerciale ») et coche au fil de l'eau. Rien dans le dépôt ne portait cet
 * objet — `need_step` : zéro occurrence avant ce lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS STATUTS, PAS UN BOOLÉEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `todo` / `pending` / `done` — la maquette montre un badge « À faire » ET un
 * badge « En attente » sur deux étapes non cochées : un simple `done boolean`
 * aurait perdu cette distinction (une étape qui attend une réponse du client
 * n'est pas la même chose qu'une étape qu'on n'a pas encore commencée).
 */
export class NeedSteps1790974000002 implements MigrationInterface {
  public name = 'NeedSteps1790974000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS need_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        need_id uuid NOT NULL REFERENCES project_needs(id) ON DELETE CASCADE,
        label text NOT NULL,
        status text NOT NULL DEFAULT 'todo',
        position integer NOT NULL DEFAULT 0,
        done_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT need_steps_status_check CHECK (status IN ('todo', 'pending', 'done'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS need_steps_need_idx ON need_steps (need_id, position ASC)
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS need_steps_workspace_idx ON need_steps (workspace_id)`)
    await queryRunner.query(`
      COMMENT ON TABLE need_steps IS
        'Les prochaines etapes d''un besoin, cochables - fiche besoin, dossier du 26/08 image 02. Distinct de needNextAction (derivation non persistee, need-next-action.ts) : un objet ECRIT par le recruteur, pas calcule.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS need_steps`)
  }
}
