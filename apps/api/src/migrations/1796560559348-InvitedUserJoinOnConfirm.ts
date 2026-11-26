import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Inscription directe d'un invité — prod 19/10/2026 (client eXteam).
 *
 * Un owner a invité trois collègues (`workspace_invitations`, `pending`). Deux
 * se sont inscrits DIRECTEMENT, sans cliquer le lien : `handle_new_user_workspace`
 * leur a créé un « Mon espace » vide et l'invitation est restée `pending` à vie.
 * Le seul chemin qui rattachait était `WorkspaceTeamService.acceptInvitation`.
 *
 * Décision Louis 19/10 : à l'inscription, une invitation `pending` non expirée
 * dont l'e-mail (comparé en `lower()`) est celui du nouvel utilisateur est
 * ACCEPTÉE d'office, avec les effets de `acceptInvitation` — ligne
 * `workspace_members` au rôle invité, invitation `accepted`, espace actif posé
 * sur l'espace de l'invitation (la plus récente s'il y en a plusieurs).
 *
 * Sécurité : seulement sur e-mail CONFIRMÉ. Le trigger écoute l'INSERT et la
 * confirmation (`UPDATE OF email_confirmed_at`) ; il n'agit que si l'adresse est
 * prouvée (et, en UPDATE, à la transition NULL → non NULL). Une adresse non
 * prouvée n'entre jamais dans l'espace d'un tiers.
 *
 * L'espace perso « Mon espace » est conservé (comme après `acceptInvitation`) :
 * `handle_new_user_workspace` n'est PAS touché. Pas de contrôle de sièges
 * (`acceptInvitation` n'en fait pas). Pas de rattrapage de l'existant : les cas
 * en cours ont été traités à la main.
 *
 * Idempotent : `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, `ON CONFLICT`.
 */
export class InvitedUserJoinOnConfirm1796560559348 implements MigrationInterface {
  public name = 'InvitedUserJoinOnConfirm1796560559348'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_invited_user_join()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      DECLARE
        target_workspace_id UUID;
      BEGIN
        IF NEW.email IS NULL OR NEW.email_confirmed_at IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND OLD.email_confirmed_at IS NOT NULL THEN RETURN NEW; END IF;

        INSERT INTO workspace_members (workspace_id, user_id, role)
        SELECT i.workspace_id, NEW.id, i.role
        FROM workspace_invitations i
        WHERE i.status = 'pending'
          AND i.expires_at > now()
          AND lower(i.email) = lower(NEW.email)
        ON CONFLICT (workspace_id, user_id) DO NOTHING;

        SELECT i.workspace_id INTO target_workspace_id
        FROM workspace_invitations i
        WHERE i.status = 'pending'
          AND i.expires_at > now()
          AND lower(i.email) = lower(NEW.email)
        ORDER BY i.created_at DESC
        LIMIT 1;

        IF target_workspace_id IS NULL THEN RETURN NEW; END IF;

        UPDATE workspace_invitations i
        SET status = 'accepted', accepted_at = now()
        WHERE i.status = 'pending'
          AND i.expires_at > now()
          AND lower(i.email) = lower(NEW.email);

        INSERT INTO workspace_active_selections (user_id, workspace_id)
        VALUES (NEW.id, target_workspace_id)
        ON CONFLICT (user_id) DO UPDATE
          SET workspace_id = EXCLUDED.workspace_id, updated_at = now();

        RETURN NEW;
      -- Ce trigger vit sur auth.users : une erreur ici annulerait l'inscription
      -- elle-même. Le rattachement est un bonus — le bloc est défait, le lien
      -- d'invitation reste le recours, l'inscription passe toujours.
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_invited_user_join: rattachement ignoré pour % (%)', NEW.id, SQLERRM;
        RETURN NEW;
      END;
      $$
    `)
    await queryRunner.query(`DROP TRIGGER IF EXISTS on_auth_user_invited_join ON auth.users`)
    await queryRunner.query(`
      CREATE TRIGGER on_auth_user_invited_join
      AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_invited_user_join()
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS on_auth_user_invited_join ON auth.users`)
    await queryRunner.query(`DROP FUNCTION IF EXISTS handle_invited_user_join()`)
  }
}
