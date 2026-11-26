import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3547 (02/10/2026, décision Louis) — LE « FORFAIT ENCADRÉ ».
 *
 * Une mission peut être créée sans consultants : l'ESN trouve la mission, contacte
 * la DSI, puis CADRE ou SUPERVISE un forfait réalisé par les salariés du client.
 * Quatre colonnes, sur la mission ET sur le besoin dont elle est la conversion :
 *
 *  - `delivery_mode` — `staffed` (défaut = comportement historique à l'octet près)
 *    | `supervised`. Un axe distinct de `contract_kind`, qui reste `forfait` ;
 *  - `supervision_role` — le rôle tenu : `framing` | `supervision` | `both`.
 *    NULLABLE : absent n'est pas « cadrage », c'est « non dit » ;
 *  - `client_team_size` / `client_team_names` — l'équipe côté client, par un
 *    nombre OU des noms, facultatifs. `NULL` / `'{}'` = non renseignée, jamais 0.
 *
 * ⚠️ LA CONTRAINTE EST POSÉE AVANT LE CODE QUI ÉCRIT LA VALEUR (GA-11 / GA-12) :
 * cette migration précède tout écrivain de ces colonnes. Le mode encadré n'existe
 * qu'au forfait (CHECK croisé), et un rôle ou une équipe sans le mode sont
 * refusés — des champs orphelins que rien ne lirait.
 */
export class MissionSupervisedForfait1796424913577 implements MigrationInterface {
  public name = 'MissionSupervisedForfait1796424913577'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['missions', 'project_needs']) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'staffed',
          ADD COLUMN IF NOT EXISTS supervision_role text,
          ADD COLUMN IF NOT EXISTS client_team_size integer,
          ADD COLUMN IF NOT EXISTS client_team_names text[] NOT NULL DEFAULT '{}'
      `)
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_delivery_mode_check`)
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD CONSTRAINT ${table}_delivery_mode_check
          CHECK (delivery_mode IN ('staffed', 'supervised'))
      `)
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_supervision_role_check`)
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD CONSTRAINT ${table}_supervision_role_check
          CHECK (supervision_role IS NULL OR supervision_role IN ('framing', 'supervision', 'both'))
      `)
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_client_team_size_check`)
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD CONSTRAINT ${table}_client_team_size_check
          CHECK (client_team_size IS NULL OR client_team_size >= 1)
      `)
      // Le mode encadré n'existe qu'au forfait ; rôle et équipe n'existent qu'avec lui.
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_supervised_coherent_check`)
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD CONSTRAINT ${table}_supervised_coherent_check
          CHECK (
            (delivery_mode = 'supervised' AND contract_kind = 'forfait')
            OR (delivery_mode = 'staffed' AND supervision_role IS NULL
                AND client_team_size IS NULL AND client_team_names = '{}')
          )
      `)
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
