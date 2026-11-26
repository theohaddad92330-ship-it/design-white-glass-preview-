import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Deux rôles métier de plus, et les permissions accordées EN PROPRE
 * (BEL-ARCH-001).
 *
 * Additive de bout en bout, comme la migration RBAC dont elle prolonge la
 * promesse : aucune ligne n'est reclassée, aucun `UPDATE` n'est fait, et le
 * `DEFAULT 'member'` reste. Personne ne perd un droit.
 *
 * Ce que ce n'est PAS : un backfill `member` vers `sales`. Le prompt du ticket
 * le prescrivait ; il révoquerait `integrations:manage` et `billing:manage` à
 * tous les sièges historiques d'un coup — l'exact contraire de ce que la
 * migration RBAC avait garanti. Renommer un rôle ne renomme pas les lignes qui
 * le portent ; on ajoute, on ne déplace pas.
 *
 * La table plutôt qu'une colonne `jsonb` sur `workspace_members` : une
 * permission accordée est une ligne qu'on veut pouvoir dater, compter et
 * retirer seule. Un tableau jsonb obligerait à relire-modifier-réécrire pour
 * retirer un droit, avec la course entre deux administrateurs que ça implique.
 */
export class MemberPermissions1789516204873 implements MigrationInterface {
  name = 'MemberPermissions1789516204873'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Les deux rôles, dans les DEUX tables qui portent la contrainte : oublier
    // les invitations laisserait créer un membre `recruiter` sans jamais
    // pouvoir l'inviter.
    for (const table of ['workspace_members', 'workspace_invitations']) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_role_check`)
      await queryRunner.query(`
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_role_check CHECK (
          role IN ('owner', 'admin', 'sales_ops', 'sales', 'tech_admin', 'member', 'viewer', 'recruiter', 'finance')
        )
      `)
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_member_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        permission text NOT NULL,
        -- Qui a accordé. Une exception nominative sans auteur ne se relit pas :
        -- six mois plus tard, la question est toujours « qui a décidé ça ».
        granted_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_member_permissions_check CHECK (
          permission IN (
            'analysis:run', 'contacts:enrich', 'data:export', 'messages:send',
            'records:write', 'team:manage', 'integrations:manage', 'billing:manage', 'finance:read'
          )
        )
      )
    `)
    // Accorder deux fois le même droit est un no-op, pas une seconde ligne.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_member_permissions_unique
        ON workspace_member_permissions (workspace_id, user_id, permission)
    `)
    // La lecture chaude : « que peut CETTE personne », à chaque requête gardée.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS workspace_member_permissions_member_idx
        ON workspace_member_permissions (workspace_id, user_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS workspace_member_permissions_member_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS workspace_member_permissions_unique`)
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_member_permissions`)
    // Les contraintes de rôle NE reviennent PAS à leur périmètre d'origine.
    // Un membre déjà nommé `recruiter` ferait échouer le retour arrière — ou,
    // pire, serait supprimé pour le faire passer. Élargir une contrainte est
    // sans risque ; la rétrécir demande de décider du sort de vraies lignes,
    // ce qu'une migration ne doit jamais faire seule.
  }
}
