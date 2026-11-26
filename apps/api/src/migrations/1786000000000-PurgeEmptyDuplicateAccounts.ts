import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Purge des doublons VIDES de `accounts` (bug prod « 7× Decathlon »).
 *
 * Cause : `AnalysisService.start()` ne matchait un compte existant que sur les
 * statuts `analyzing` (idempotence) et `completed` (result cache). Un compte en
 * `error` ne matchait ni l'un ni l'autre → chaque relance après un échec SSE
 * appelait `accountsService.create()` et empilait une nouvelle ligne (constat
 * prod : 7× Decathlon + 2× Blablacar dans /accounts). Le fix runtime
 * (`findReusableFailedByUserAndCompany` + `reuseForRelaunch`) réutilise
 * désormais la ligne échouée ; cette migration nettoie le stock existant.
 *
 * POLITIQUE — délibérément PRUDENTE :
 *
 *  1. Groupes de doublons = (workspace — fallback user pour les lignes legacy
 *     sans workspace_id, `COALESCE('ws:'||…, 'u:'||…)`), entreprise normalisée
 *     `LOWER(TRIM(company_name))`. Les lignes `deleted` (invisibles UI) ne
 *     comptent pas. Seuls les groupes d'au moins 2 lignes sont concernés.
 *  2. SURVIVANT (jamais touché) = rang 1 du groupe :
 *     `completed` d'abord (le plus récent), sinon la ligne AVEC données, sinon
 *     la plus récente. `id` en tie-breaker pour un ordre déterministe.
 *  3. SUPPRIMÉES = uniquement les COQUILLES VIDES non-survivantes :
 *       - statut `error`, OU `analyzing` bloqué depuis > 24 h (une analyse
 *         réelle dure 3-6 min — 24 h sans update = run mort ; un run encore
 *         vivant n'est jamais touché). `completed`/`archived`/`canceled` ne
 *         sont JAMAIS supprimés par cette migration.
 *       - ET zéro contact, zéro attack_angle, zéro action_plan, zéro
 *         analysis_run `completed`. Une ligne portant la MOINDRE donnée
 *         n'est jamais supprimée, quel que soit son statut.
 *
 * FK / cascades vérifiées (source : migrations Init + suivantes) :
 *   - contacts / attack_angles / action_plans → CASCADE, mais vides par
 *     définition de la coquille (critère n°3) → cascade à vide.
 *   - analysis_runs → PAS de FK (audit voulu survivant à la suppression) :
 *     RE-PARENTÉS sur le survivant AVANT le delete — l'historique append-only
 *     (P0 Théo) des tentatives échouées reste visible sur le dossier survivant
 *     au lieu de devenir orphelin. Les runs encore `analyzing` d'une coquille
 *     morte sont clos en `error` (+ completed_at) : rien ne tourne plus.
 *   - account_feedback → CASCADE : RE-PARENTÉ AVANT le delete (simple UPDATE,
 *     même groupe donc même workspace) — la mémoire de corrections (#506,
 *     jointure workspace + LOWER(company_name)) est préservée.
 *   - account_shares / account_vocabulary / chat_messages / memory (CASCADE) :
 *     on laisse la cascade — dérivés d'une coquille sans dossier (un partage ou
 *     un chat sur un compte errored vide n'a rien à montrer), pas de valeur à
 *     re-parenter.
 *   - user_actions / beta_feedback (SET NULL) : l'audit est conservé, la
 *     référence est simplement détachée — aucun FK cassé.
 *
 * IDEMPOTENTE : le set des condamnées est recalculé depuis les données à chaque
 * exécution (temp table, aucun état persistant) ; re-jouée après purge, le set
 * est vide et chaque statement est un no-op.
 */
export class PurgeEmptyDuplicateAccounts1786000000000 implements MigrationInterface {
  public name = 'PurgeEmptyDuplicateAccounts1786000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Matérialise (doomed_id → survivor_id) UNE fois, pour que le re-parent
    //    et le delete travaillent sur exactement le même set (pas de recalcul
    //    entre statements). Temp table locale à la session de migration.
    await queryRunner.query(`
      CREATE TEMP TABLE _purge_dup_accounts AS
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
      ranked AS (
        SELECT
          s.*,
          ROW_NUMBER() OVER (
            PARTITION BY s.scope_key, s.company_key
            ORDER BY (status = 'completed') DESC, has_data DESC, updated_at DESC, id
          ) AS rn,
          COUNT(*) OVER (PARTITION BY s.scope_key, s.company_key) AS group_size
        FROM scoped s
      )
      SELECT d.id AS doomed_id, k.id AS survivor_id
      FROM ranked d
      JOIN ranked k
        ON k.scope_key = d.scope_key
       AND k.company_key = d.company_key
       AND k.rn = 1
      WHERE d.group_size >= 2
        AND d.rn > 1
        AND NOT d.has_data
        AND (
          d.status = 'error'
          OR (d.status = 'analyzing' AND d.updated_at < now() - interval '24 hours')
        )
    `)

    // 2. Historique des runs (P0 Théo — append-only) : re-parenté sur le
    //    survivant AVANT le delete. analysis_runs n'a pas de FK : sans ce
    //    re-parent, les lignes deviendraient des orphelines invisibles. Les
    //    runs encore 'analyzing' d'une coquille morte sont clos en 'error'.
    await queryRunner.query(`
      UPDATE analysis_runs r
         SET account_id = p.survivor_id,
             status = CASE WHEN r.status = 'analyzing' THEN 'error' ELSE r.status END,
             completed_at = CASE
               WHEN r.status = 'analyzing' THEN COALESCE(r.completed_at, now())
               ELSE r.completed_at
             END
        FROM _purge_dup_accounts p
       WHERE r.account_id = p.doomed_id
    `)

    // 3. Mémoire de corrections (#506) : re-parentée AVANT le delete — la FK
    //    ON DELETE CASCADE de account_feedback détruirait sinon les retours
    //    utilisateur posés sur la coquille. Même groupe = même workspace, la
    //    jointure workspace + LOWER(company_name) du service reste valide.
    await queryRunner.query(`
      UPDATE account_feedback f
         SET account_id = p.survivor_id
        FROM _purge_dup_accounts p
       WHERE f.account_id = p.doomed_id
    `)

    // 4. Suppression des coquilles vides. Cascades restantes : contacts /
    //    attack_angles / action_plans sont vides par définition ; shares /
    //    vocabulary / chat / memory d'une coquille sans dossier partent avec
    //    elle ; user_actions / beta_feedback sont SET NULL (audit conservé).
    await queryRunner.query(`
      DELETE FROM accounts a
       USING _purge_dup_accounts p
       WHERE a.id = p.doomed_id
    `)

    await queryRunner.query(`DROP TABLE IF EXISTS _purge_dup_accounts`)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op assumé : les coquilles supprimées ne sont pas restaurables (aucune
    // sauvegarde de leur contenu — elles étaient vides par définition) et les
    // re-parentings runs/feedback ne gardent pas trace de l'ancien account_id.
    // Même politique que l'archive pass de DedupeAccountsBySiren.
  }
}
