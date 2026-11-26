import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Re-purge des comptes coquilles VIDES en échec (suite du bug « 7× Decathlon »).
 *
 * POURQUOI UNE 2ᵉ MIGRATION — `PurgeEmptyDuplicateAccounts1786000000000` a laissé
 * du stock en prod (5 Decathlon `error` vides toujours visibles) pour DEUX raisons
 * distinctes, l'une temporelle, l'autre de politique :
 *
 *  1. TypeORM ne rejoue JAMAIS une migration déjà inscrite dans `_migrations`
 *     (la liste des migrations « pending » est calculée une seule fois, au boot,
 *     par nom de classe). La purge #1786000000000 a donc tourné UNE fois, au
 *     déploiement ; les coquilles créées APRÈS ce passage ne sont jamais
 *     ramassées. Une nouvelle classe (nouveau timestamp) est le seul moyen de
 *     rejouer un nettoyage — d'où ce fichier (on ne renomme surtout pas #1786000000000,
 *     ce qui le ferait re-tourner de façon incontrôlée).
 *  2. La purge #1786000000000 exigeait un DOUBLON (`group_size >= 2` + survivant
 *     `rn = 1`). Elle ne supprimait donc QUE les non-survivants d'un groupe ≥ 2 :
 *       - un compte errored vide SEUL (groupe de 1) n'était jamais touché ;
 *       - un groupe 100 % vide errored gardait toujours 1 « survivant » vide.
 *     Or une coquille errored vide n'a AUCUNE valeur pour l'utilisateur, doublon
 *     ou pas — le fix runtime #518 (`findReusableFailedByUserAndCompany` +
 *     `reuseForRelaunch`) réutilise proprement une ligne errored à la relance,
 *     donc rien n'est perdu à les supprimer toutes.
 *
 * POLITIQUE — ÉLARGIE mais garde-fou absolu conservé :
 *
 *  - CONDAMNÉE = toute COQUILLE VIDE, INDÉPENDAMMENT de tout doublon :
 *      · statut `error` OU `canceled` OU (`analyzing` bloqué depuis > 24 h — une
 *        vraie analyse dure 3-6 min, 24 h sans update = run mort ; un run encore
 *        vivant n'est jamais touché) ;
 *      · ET zéro contact, zéro attack_angle, zéro action_plan, zéro analysis_run
 *        `completed` (== `has_data` faux).
 *    Conséquence voulue : un groupe 100 % vide errored est supprimé EN ENTIER
 *    (aucun survivant vide gardé — le cas des 5 Decathlon) ; un compte errored
 *    vide seul est supprimé aussi.
 *  - GARDE-FOU ABSOLU (inchangé) : une ligne portant LA MOINDRE donnée — ≥ 1
 *    contact / attack_angle / action_plan, OU un analysis_run `completed` — n'est
 *    JAMAIS supprimée, quel que soit son statut. `completed`/`archived` ne sont
 *    jamais des candidats. `deleted` est déjà invisible (exclu du scope).
 *
 * SURVIVANT & RE-PARENT — le survivant n'est ici QUE le point d'ancrage de
 * l'historique, PAS un rescapé de la purge :
 *  - survivant = la meilleure ligne NON-CONDAMNÉE du même groupe (scope
 *    workspace — fallback user pour le legacy — × company_name normalisé) :
 *    `completed` d'abord, puis AVEC données, puis la plus récente (`id` en
 *    tie-breaker). Une coquille condamnée n'est jamais choisie comme survivant.
 *  - S'IL EXISTE un survivant (ex. un Decathlon `completed` cohabite avec des
 *    coquilles errored) :
 *      · `analysis_runs` (PAS de FK — cf. migration AnalysisRuns : `account_id`
 *        uuid nu pour survivre à une suppression) sont RE-PARENTÉS sur le
 *        survivant AVANT le delete (historique append-only P0 Théo préservé) ;
 *        les runs encore `analyzing` d'une coquille morte sont clos en `error`.
 *      · `account_feedback` (FK ON DELETE CASCADE) est RE-PARENTÉ sur le
 *        survivant AVANT le delete — même groupe = même `LOWER(company_name)`,
 *        donc la jointure mémoire #506 (`directivesFor` : workspace +
 *        `LOWER(a.company_name)`) reste valide.
 *  - S'IL N'EXISTE PAS de survivant (groupe 100 % vide → tout supprimé, cas des
 *    5 Decathlon) :
 *      · `analysis_runs` orphelins → SUPPRIMÉS. Ce sont par définition des runs
 *        d'une coquille SANS run `completed` (aucune valeur) ; sans FK ils
 *        deviendraient des orphelins invisibles — on les efface explicitement.
 *      · `account_feedback` → part en CASCADE avec la coquille. Aucune donnée
 *        détachable : la FK est ON DELETE CASCADE (pas de SET NULL possible), et
 *        une coquille errored vide n'a ni play, ni contact, ni section sur
 *        lesquels un feedback structuré aurait pu être posé — la perte est
 *        théorique et assumée (documentée).
 *  - Autres CASCADE (account_shares / account_vocabulary / chat_messages /
 *    long-memory / action_plan_items) : laissées à la cascade — dérivés d'une
 *    coquille sans dossier, rien à re-parenter. user_actions / beta_feedback
 *    (SET NULL) : audit conservé, référence détachée — aucun FK cassé.
 *
 * IDEMPOTENTE : l'ensemble condamné est recalculé DEPUIS LES DONNÉES à chaque
 * exécution (temp table, aucun état persistant). Re-jouée sur une base déjà
 * nettoyée, l'ensemble est vide → chaque statement est un no-op. Rejoue donc
 * aussi le travail de #1786000000000 (superset), sans dépendre de son exécution.
 *
 * down() : no-op documenté — les coquilles supprimées ne sont pas restaurables
 * (vides par définition) et les re-parentings ne conservent pas l'ancien
 * account_id. Même politique que #1786000000000 / DedupeAccountsBySiren.
 */
export class RepurgeErroredAccounts1786020000000 implements MigrationInterface {
  public name = 'RepurgeErroredAccounts1786020000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Matérialise (doomed_id → survivor_id, nullable) UNE fois pour que
    //    re-parent et delete travaillent sur exactement le même set. Le prédicat
    //    « coquille vide condamnée » est défini une seule fois (flag is_doomed)
    //    et sert AUSSI à exclure les condamnées du choix du survivant.
    await queryRunner.query(`
      CREATE TEMP TABLE _repurge_errored_accounts AS
      WITH scoped AS (
        SELECT
          a.id,
          a.status,
          a.updated_at,
          COALESCE('ws:' || a.workspace_id::text, 'u:' || a.user_id::text) AS scope_key,
          LOWER(TRIM(a.company_name)) AS company_key,
          (
            EXISTS (SELECT 1 FROM contacts c WHERE c.account_id = a.id)
            OR EXISTS (SELECT 1 FROM attack_angles ang WHERE ang.account_id = a.id)
            OR EXISTS (SELECT 1 FROM action_plans ap WHERE ap.account_id = a.id)
            OR EXISTS (SELECT 1 FROM analysis_runs r WHERE r.account_id = a.id AND r.status = 'completed')
          ) AS has_data
        FROM accounts a
        WHERE a.status <> 'deleted'
      ),
      flagged AS (
        SELECT
          s.*,
          (
            NOT s.has_data
            AND (
              s.status = 'error'
              OR s.status = 'canceled'
              OR (s.status = 'analyzing' AND s.updated_at < now() - interval '24 hours')
            )
          ) AS is_doomed
        FROM scoped s
      ),
      survivors AS (
        SELECT DISTINCT ON (f.scope_key, f.company_key)
          f.scope_key,
          f.company_key,
          f.id AS survivor_id
        FROM flagged f
        WHERE NOT f.is_doomed
        ORDER BY
          f.scope_key,
          f.company_key,
          (f.status = 'completed') DESC,
          f.has_data DESC,
          f.updated_at DESC,
          f.id
      )
      SELECT f.id AS doomed_id, v.survivor_id AS survivor_id
      FROM flagged f
      LEFT JOIN survivors v
        ON v.scope_key = f.scope_key
       AND v.company_key = f.company_key
      WHERE f.is_doomed
    `)

    // 2a. Historique des runs — survivant présent : re-parenté AVANT le delete
    //     (analysis_runs n'a pas de FK → orphelins invisibles sinon). Les runs
    //     encore 'analyzing' d'une coquille morte sont clos en 'error'.
    await queryRunner.query(`
      UPDATE analysis_runs r
         SET account_id = p.survivor_id,
             status = CASE WHEN r.status = 'analyzing' THEN 'error' ELSE r.status END,
             completed_at = CASE
               WHEN r.status = 'analyzing' THEN COALESCE(r.completed_at, now())
               ELSE r.completed_at
             END
        FROM _repurge_errored_accounts p
       WHERE r.account_id = p.doomed_id
         AND p.survivor_id IS NOT NULL
    `)

    // 2b. Historique des runs — AUCUN survivant (groupe 100 % vide, cas des 5
    //     Decathlon) : les runs d'une coquille sans run 'completed' n'ont aucune
    //     valeur ; sans FK, les laisser = orphelins invisibles → on les supprime.
    await queryRunner.query(`
      DELETE FROM analysis_runs r
       USING _repurge_errored_accounts p
       WHERE r.account_id = p.doomed_id
         AND p.survivor_id IS NULL
    `)

    // 3. Mémoire de corrections (#506) — survivant présent : re-parentée AVANT le
    //    delete (la FK ON DELETE CASCADE la détruirait). Même groupe = même
    //    LOWER(company_name) → la jointure mémoire du service reste valide.
    //    Sans survivant : rien à faire ici — le feedback part en CASCADE avec la
    //    coquille (perte théorique et assumée, cf. en-tête).
    await queryRunner.query(`
      UPDATE account_feedback f
         SET account_id = p.survivor_id
        FROM _repurge_errored_accounts p
       WHERE f.account_id = p.doomed_id
         AND p.survivor_id IS NOT NULL
    `)

    // 4. Suppression des coquilles vides condamnées. Cascades restantes :
    //    contacts / attack_angles / action_plans vides par définition ; shares /
    //    vocabulary / chat / memory d'une coquille sans dossier partent avec
    //    elle ; user_actions / beta_feedback en SET NULL (audit conservé).
    await queryRunner.query(`
      DELETE FROM accounts a
       USING _repurge_errored_accounts p
       WHERE a.id = p.doomed_id
    `)

    await queryRunner.query(`DROP TABLE IF EXISTS _repurge_errored_accounts`)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op assumé : les coquilles supprimées étaient vides (rien à restaurer) et
    // les re-parentings runs/feedback ne gardent pas trace de l'ancien account_id.
  }
}
