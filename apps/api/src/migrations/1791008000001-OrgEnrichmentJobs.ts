import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `org_enrichment_jobs` — le planificateur d'enrichissement devient PERSISTANT
 * (OrgGraph FINAL §11, « job persistant, idempotent »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dialogue existait, les deux routes existaient (`enrichment-plan` /
 * `enrichment-confirm`), la sélection existait et était juste — mais **rien
 * n'était écrit**. `grep -E "org_enrichment_jobs" apps/api/src` rendait zéro.
 * Concrètement : une vague qui tombe au milieu d'un plan complet ne laissait
 * aucune trace, l'utilisateur ne savait pas où il en était, et le seul moyen de
 * « reprendre » était de recliquer le même mode en espérant que le filtre
 * `family IS NULL` fasse le reste. Ça marchait tant que rien n'échouait — c'est
 * exactement la définition d'une reprise qui n'existe pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX COLONNES DE COÛT, ET JAMAIS UNE SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * `estimated_credits` est ce qu'on a ANNONCÉ avant le premier clic ; il ne
 * bouge plus jamais. `actual_credits` est ce qui a été RÉELLEMENT débité. Les
 * confondre — une seule colonne qu'on « met à jour » — ferait disparaître
 * l'ÉCART, or l'écart est tout l'intérêt : un plan annoncé à 12 crédits qui en
 * consomme 20 est un planificateur qui ment, et personne ne pourrait le savoir.
 *
 * `actual_credits` est **NULLABLE**, et `NULL` n'est pas `0` : `NULL` veut dire
 * « aucune vague n'a encore abouti, il n'y a rien à mesurer ». Un `0` dirait
 * « mesuré, et ça n'a rien coûté », ce qui est faux d'un job qui n'a pas
 * démarré. On compte des UNITÉS de crédit ; une ligne non mesurée sort du total
 * et se compte à part — même règle que le registre de coûts fournisseurs
 * (`analytics/cost-alert.ts`), et pour la même raison : absorber les inconnues
 * comme des zéros fait passer un job coûteux pour un job sage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `waves` EN JSONB, ET PAS UNE TABLE FILLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une vague n'existe QUE dans son job, ne se requête jamais seule, et son lot de
 * `contactIds` est figé à la création. Une table fille apporterait une jointure,
 * un ordre à maintenir et une seconde source de vérité pour un objet qui n'a pas
 * de vie propre. Le statut du JOB, lui, est bien une colonne : c'est ce qui
 * permet d'indexer « les jobs à reprendre » sans ouvrir chaque blob. Il est
 * TOUJOURS écrit depuis `deriveOrgEnrichmentJobStatus` (contrats), jamais à la
 * main — une dérivation vit à un seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * `workspace_id` : un plan d'enrichissement est le travail d'une ESN sur un
 * compte, et deux espaces sont deux concurrents. Table `scoped` par déduction
 * (GA-65) — rien à déclarer au registre. `user_id` garde QUI a lancé, pour
 * l'affichage et le débit ; ce n'est pas une clé de portée.
 */
export class OrgEnrichmentJobs1791008000001 implements MigrationInterface {
  public name = 'OrgEnrichmentJobs1791008000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS org_enrichment_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL,
        user_id uuid NOT NULL,
        mode text NOT NULL,
        target_params jsonb NOT NULL DEFAULT '{}'::jsonb,
        wave_size integer NOT NULL DEFAULT 50,
        status text NOT NULL DEFAULT 'pending',
        prompt_version text NOT NULL,
        estimated_credits integer NOT NULL DEFAULT 0,
        actual_credits integer,
        waves jsonb NOT NULL DEFAULT '[]'::jsonb,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT org_enrichment_jobs_wave_size_check CHECK (wave_size >= 1 AND wave_size <= 50)
      )
    `)

    // Nommées explicitement (GA-177) et déposées avant d'être posées, pour que
    // la migration reste rejouable. Les deux listes sont les énumérations des
    // contrats — voir le MAPPING de `check-constraints-cover-enums.spec.ts`.
    await queryRunner.query(`ALTER TABLE org_enrichment_jobs DROP CONSTRAINT IF EXISTS org_enrichment_jobs_mode_check`)
    await queryRunner.query(`
      ALTER TABLE org_enrichment_jobs
        ADD CONSTRAINT org_enrichment_jobs_mode_check
        CHECK (mode IN ('next_batch', 'direction', 'missing_roles', 'hierarchy_level', 'full_account'))
    `)
    await queryRunner.query(
      `ALTER TABLE org_enrichment_jobs DROP CONSTRAINT IF EXISTS org_enrichment_jobs_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE org_enrichment_jobs
        ADD CONSTRAINT org_enrichment_jobs_status_check
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial'))
    `)

    // La requête qui porte la reprise : « ce compte a-t-il un job de ce mode
    // qui n'est pas fini ? ». Partiel, parce qu'un job terminé n'est jamais
    // repris et qu'il y en aura beaucoup plus que d'inachevés.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS org_enrichment_jobs_resumable_idx
        ON org_enrichment_jobs (workspace_id, account_id, mode, created_at DESC)
        WHERE status IN ('pending', 'running', 'partial', 'failed')
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS org_enrichment_jobs_account_idx
        ON org_enrichment_jobs (workspace_id, account_id, created_at DESC)
    `)

    await queryRunner.query(`
      COMMENT ON COLUMN org_enrichment_jobs.actual_credits IS
        'Credits REELLEMENT debites, en unites. NULL = aucune vague aboutie, donc rien de mesure - jamais 0, qui dirait "mesure, et gratuit". Distinct de estimated_credits a dessein : l ECART est ce qu on veut voir.'
    `)
    await queryRunner.query(`
      COMMENT ON TABLE org_enrichment_jobs IS
        'Le plan d enrichissement d organigramme, PERSISTE (OrgGraph FINAL §11). Une vague qui tombe au milieu se reprend la ou elle s est arretee : les contactIds de chaque vague sont figes a la creation. Scopee par workspace_id - un plan est le travail d une ESN sur un compte.'
    `)

    await queryRunner.query(`ALTER TABLE org_enrichment_jobs ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'org_enrichment_jobs' AND policyname = 'org_enrichment_jobs_own_workspace'
        ) THEN
          CREATE POLICY org_enrichment_jobs_own_workspace ON org_enrichment_jobs
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      EXCEPTION
        WHEN undefined_function OR undefined_table OR undefined_object THEN NULL;
      END
      $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS org_enrichment_jobs`)
  }
}
