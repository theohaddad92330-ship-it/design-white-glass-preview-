import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les BESOINS PROPOSÉS par l'analyse (PDF 4, point d'entrée 5 — décision de
 * Louis du 21/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE À PART, ET PAS `project_needs`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le chantier du PDF 4 a refusé ce point d'entrée avec une raison précise : la
 * chaîne « offre d'emploi détectée → besoin à qualifier » suppose que le
 * pipeline d'analyse ÉCRIVE dans `project_needs`, une table qui n'est pas la
 * sienne. C'est exactement ce que la garde des frontières interdit — et
 * au-delà de la règle, le pipe se remplirait tout seul de besoins que personne
 * n'a validés.
 *
 * La table de PROPOSITIONS résout les deux : le pipeline écrit chez lui, et un
 * humain accepte ou écarte. Le besoin naît toujours d'un geste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES COLONNES PORTENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `source_url` est la CLÉ D'IDEMPOTENCE : une même offre relue à chaque
 * actualisation ne doit pas produire dix propositions. C'est aussi l'une des
 * quatre clés que le registre des flux déclarait manquantes.
 *
 * `dismissed_reason` est obligatoire à l'écart : sans lui, on ne saura pas dans
 * six mois si l'offre ne correspondait pas au métier de l'ESN ou si elle était
 * simplement trop ancienne — deux apprentissages différents.
 */
export class NeedProposals1789900000002 implements MigrationInterface {
  name = 'NeedProposals1789900000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS need_proposals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL,
        title text NOT NULL,
        skills text[] NOT NULL DEFAULT '{}',
        location text,
        source text NOT NULL DEFAULT 'job_ad',
        source_url text,
        detected_at timestamptz,
        raw jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'pending',
        decided_at timestamptz,
        decided_by uuid,
        dismissed_reason text,
        created_need_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT need_proposals_status_check CHECK (status IN ('pending', 'accepted', 'dismissed'))
      )
    `)
    // Idempotence : une même offre relue à chaque actualisation ne produit pas
    // une nouvelle proposition. L'index est partiel parce qu'une offre sans URL
    // existe (source manuelle) et ne doit pas bloquer les autres.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_need_proposals_source
         ON need_proposals (account_id, source_url) WHERE source_url IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_need_proposals_pending
         ON need_proposals (workspace_id, created_at DESC) WHERE status = 'pending'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS need_proposals`)
  }
}
