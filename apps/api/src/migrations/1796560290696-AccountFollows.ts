import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4267 (décisions Louis 18/10/2026) — LE SUIVI D'UN COMPTE DEVIENT UN GESTE EXPLICITE, PAR UTILISATEUR.
 *
 * « Par défaut on doit suivre personne […] on peut suivre 3 comptes max, et ça empêchera beaucoup de
 * coûts pour rien. » Jusqu'ici le suivi se DÉDUISAIT de `accounts.commercial_status` : la veille relisait
 * chaque jour tout compte classé `watching` / `opportunity` / `customer`.
 *
 * AJOUT SEULEMENT : une table neuve, aucune colonne existante touchée, `commercial_status` n'est PAS
 * modifié (4267.4). Une ligne = (utilisateur, compte) ; « Ne plus suivre » ARCHIVE la ligne
 * (`archived_at` + `archived_reason`), « Suivre » la réactive — on archive, on ne supprime pas.
 *
 * Contraintes NOMMÉES (GA-177), posées AVANT le code qui écrit (GA-11 / GA-12) :
 *  · `account_follows_archived_reason_check` ↔ `ACCOUNT_FOLLOW_ARCHIVE_REASONS` ;
 *  · `account_follows_archived_coherent` — une date d'archivage a toujours sa raison, et réciproquement ;
 *  · `account_follows_once` — une seule ligne par (utilisateur, compte), réactivée plutôt que dupliquée.
 * Le PLAFOND (3) n'est pas en SQL : il vit à un seul endroit, `ACCOUNT_FOLLOW_MAX_PER_USER` (GA-26).
 *
 * `ON DELETE CASCADE` explicite sur les trois FK : le reset démo (et l'effacement d'un compte ou d'un
 * utilisateur) emporte ses suivis au lieu d'échouer en silence sur une FK pendante.
 *
 * 4267.4 — REPRISE DE L'EXISTANT, idempotente : pour chaque utilisateur qui n'a ENCORE aucune ligne,
 * ses comptes à statut suivi sont classés par `updated_at` décroissant ; les 3 premiers restent suivis,
 * les autres sont archivés `migration_cap` (l'écran /mes-cibles le dit une fois, `notice_seen_at`).
 * Rejouée, la reprise ne touche plus personne (chacun a déjà ses lignes).
 */
export class AccountFollows1796560290696 implements MigrationInterface {
  public name = 'AccountFollows1796560290696'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_follows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        followed_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz,
        archived_reason text,
        notice_seen_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT account_follows_archived_reason_check CHECK (archived_reason IS NULL OR archived_reason IN ('unfollowed', 'migration_cap')),
        CONSTRAINT account_follows_archived_coherent CHECK ((archived_at IS NULL) = (archived_reason IS NULL)),
        CONSTRAINT account_follows_once UNIQUE (user_id, account_id)
      )
    `)
    // Les lecteurs de veille partent du COMPTE (« a-t-il un suivi actif ? ») ; l'écran part de l'UTILISATEUR.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_follows_active_account_idx
        ON account_follows (account_id) WHERE archived_at IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_follows_active_user_idx
        ON account_follows (user_id) WHERE archived_at IS NULL
    `)

    await queryRunner.query(`ALTER TABLE account_follows ENABLE ROW LEVEL SECURITY`)
    // Lecture/écriture directe (hors API, qui passe par le rôle de service) : ses propres suivis, dans un
    // espace dont on est membre.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY account_follows_own ON account_follows FOR ALL
          USING (
            user_id = auth.uid()
            AND (
              workspace_id IS NULL
              OR EXISTS (
                SELECT 1 FROM workspace_members m
                 WHERE m.workspace_id = account_follows.workspace_id
                   AND m.user_id = auth.uid()
              )
            )
          )
          WITH CHECK (
            user_id = auth.uid()
            AND (
              workspace_id IS NULL
              OR EXISTS (
                SELECT 1 FROM workspace_members m
                 WHERE m.workspace_id = account_follows.workspace_id
                   AND m.user_id = auth.uid()
              )
            )
          );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    // 4267.4 — la reprise. La liste des statuts est celle de `WATCHED_COMMERCIAL_STATUSES` au 18/10/2026,
    // figée ICI : une migration décrit ce qui était vrai le jour où elle a tourné.
    await queryRunner.query(`
      INSERT INTO account_follows (user_id, workspace_id, account_id, archived_at, archived_reason)
      SELECT ranked.user_id,
             ranked.workspace_id,
             ranked.account_id,
             CASE WHEN ranked.rank > 3 THEN now() END,
             CASE WHEN ranked.rank > 3 THEN 'migration_cap' END
        FROM (
          SELECT a.id AS account_id,
                 a.user_id,
                 a.workspace_id,
                 ROW_NUMBER() OVER (PARTITION BY a.user_id ORDER BY a.updated_at DESC, a.id) AS rank
            FROM accounts a
           WHERE a.commercial_status IN ('watching', 'opportunity', 'customer')
             AND a.status NOT IN ('deleted', 'archived')
             AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.user_id)
             AND (a.workspace_id IS NULL OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = a.workspace_id))
             AND NOT EXISTS (SELECT 1 FROM account_follows f WHERE f.user_id = a.user_id)
        ) ranked
      ON CONFLICT (user_id, account_id) DO NOTHING
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_follows`)
  }
}
