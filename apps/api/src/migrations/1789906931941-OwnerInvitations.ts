import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `owner_invitations` — l'e-mail d'activation du propriétaire d'un siège
 * provisionné à la main, persisté (#2643.2). Voir `owner-invitation.entity.ts`
 * pour la raison complète.
 *
 * Une ligne par espace (`workspace_id` unique) : la seconde préparation MET À
 * JOUR la première, elle n'en crée pas une deuxième.
 */
export class OwnerInvitations1789906931941 implements MigrationInterface {
  public name = 'OwnerInvitations1789906931941'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS owner_invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        email text NOT NULL,
        owner_first_name text,
        esn_name text NOT NULL,
        plan_label text NOT NULL,
        link text,
        expires_at timestamptz,
        error text,
        sent_at timestamptz,
        sent_by text,
        sends jsonb NOT NULL DEFAULT '[]'::jsonb,
        alerted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS owner_invitations_workspace_unique ON owner_invitations (workspace_id)`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE owner_invitations IS 'État persisté de l’e-mail d’activation du propriétaire (#2643.2) — une ligne par espace.'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS owner_invitations`)
  }
}
