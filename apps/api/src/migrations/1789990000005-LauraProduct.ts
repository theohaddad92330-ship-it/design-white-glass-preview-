import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LAURA PRODUIT — l'état d'interruption et la trace des interventions (PDF 10 §5).
 *
 * Deux objets, et seulement deux.
 *
 * `laura_interventions` est la TRACE : ce qui a été proposé, sur quel écran, et
 * ce que la personne en a fait. Sans elle, les deux mécaniques de retrait du
 * §5.3 n'ont rien à compter — « deux interventions ignorées d'affilée » suppose
 * de savoir lesquelles sont parties et lesquelles ont été traitées.
 *
 * Les colonnes ajoutées à `notification_preferences` portent l'état
 * d'interruption de l'utilisateur, parce que c'est là que vit déjà son plafond
 * de proactivité — un second endroit obligerait chaque lecture à joindre deux
 * tables pour répondre à « peut-on parler maintenant ? ».
 *
 * ⚠️ `laura_enabled` vaut TRUE par défaut (D49 : « oui, et c'est important. Une
 * Laura qu'on ne peut pas couper est une Laura qu'on subit »). Le défaut est
 * l'activation, mais l'interrupteur existe et il est à l'utilisateur.
 *
 * Le catalogue des trente interventions, lui, N'EST PAS en base : il vit dans
 * `packages/contracts/src/schemas/laura-interventions.ts`, comme les workflows
 * et les routines. Une intervention éditable sans revue serait un chemin
 * d'écriture non gouverné vers l'attention de quelqu'un.
 */
export class LauraProduct1789990000005 implements MigrationInterface {
  name = 'LauraProduct1789990000005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS laura_interventions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        workspace_id uuid,
        intervention_key text NOT NULL,
        screen text NOT NULL,
        format text NOT NULL,
        priority integer NOT NULL DEFAULT 0,
        reaction text,
        reacted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `ALTER TABLE laura_interventions DROP CONSTRAINT IF EXISTS laura_interventions_reaction_check`,
    )
    await queryRunner.query(`
      ALTER TABLE laura_interventions ADD CONSTRAINT laura_interventions_reaction_check CHECK (
        reaction IS NULL OR reaction IN ('acted', 'ignored', 'closed_unread', 'refused')
      )
    `)
    await queryRunner.query(
      `ALTER TABLE laura_interventions DROP CONSTRAINT IF EXISTS laura_interventions_format_check`,
    )
    await queryRunner.query(`
      ALTER TABLE laura_interventions ADD CONSTRAINT laura_interventions_format_check CHECK (
        format IN ('bubble', 'card', 'panel', 'launcher_dot', 'none')
      )
    `)
    // La clé d'idempotence du §5.7 : « tu ne reproposes pas avant 30 jours, et
    // jamais dans les mêmes termes ». Sans index, la relecture qui vérifie ça
    // balaierait toute la table à chaque intervention candidate.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS laura_interventions_user_key_idx ON laura_interventions (user_id, intervention_key, created_at DESC)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS laura_interventions_user_day_idx ON laura_interventions (user_id, created_at DESC)`,
    )

    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS laura_enabled boolean NOT NULL DEFAULT true`,
    )
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS laura_retreat_until timestamptz`,
    )
    await queryRunner.query(
      `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS laura_throttle_until timestamptz`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notification_preferences DROP COLUMN IF EXISTS laura_throttle_until`)
    await queryRunner.query(`ALTER TABLE notification_preferences DROP COLUMN IF EXISTS laura_retreat_until`)
    await queryRunner.query(`ALTER TABLE notification_preferences DROP COLUMN IF EXISTS laura_enabled`)
    await queryRunner.query(`DROP TABLE IF EXISTS laura_interventions`)
  }
}
