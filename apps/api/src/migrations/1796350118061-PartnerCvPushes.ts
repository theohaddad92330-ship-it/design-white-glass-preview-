import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `partner_cv_pushes` — #2887 (#2371.8) : LA REVUE D'UN CV POUSSÉ À UN
 * PARTENAIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * `consultant_push_feedback` capitalise déjà le RETOUR d'un push vers une
 * OPPORTUNITÉ (`opportunity_id`, un client final). Ce chantier pousse vers un
 * PARTENAIRE (`partner_relations`, tome 4, D61) — un destinataire différent,
 * jamais mélangé (GA-26 : un réglage vit à un seul endroit, mais deux
 * DESTINATAIRES distincts restent deux tables distinctes, comme
 * `submission_feedback` / `submission_consultant_feedback` le font déjà pour
 * client/consultant).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST STOCKÉ, CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le brief (nom, titre, séniorité, expérience) et le TJM se LISENT sur
 * `consultants` à chaque affichage — jamais dupliqués ici, pour ne jamais
 * diverger d'une fiche qui change. Seuls deux champs sont propres à CETTE
 * table : `margin_share_pct` (le partage négocié avec CE partenaire, que rien
 * d'autre ne connaît) et `outcome` (le retour du partenaire, saisi par un
 * humain — jamais deviné).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `status` N'EST JAMAIS UNE PREUVE D'ENVOI
 * ─────────────────────────────────────────────────────────────────────────────
 * `envoyee_declaree` est un GESTE DÉCLARATIF du commercial, jamais un envoi
 * vérifié (doctrine, Louis 21/09/2026) — Laura prépare, elle n'envoie jamais.
 */
export class PartnerCvPushes1796350118061 implements MigrationInterface {
  public name = 'PartnerCvPushes1796350118061'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS partner_cv_pushes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        partner_relation_id uuid NOT NULL,
        consultant_id uuid NOT NULL,
        margin_share_pct numeric NULL,
        status text NOT NULL DEFAULT 'preparee',
        outcome text NOT NULL DEFAULT 'en_attente',
        prepared_by uuid NULL,
        sent_declared_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT partner_cv_pushes_status_check CHECK (status IN ('preparee', 'envoyee_declaree')),
        CONSTRAINT partner_cv_pushes_outcome_check CHECK (outcome IN ('en_attente', 'retenu', 'refuse')),
        CONSTRAINT partner_cv_pushes_sent_declared_at_check CHECK (
          sent_declared_at IS NULL OR status = 'envoyee_declaree'
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS partner_cv_pushes_partner_idx ON partner_cv_pushes (workspace_id, partner_relation_id, created_at)`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE partner_cv_pushes IS 'Revue d’un CV poussé à un partenaire (#2887, #2371.8) — brief et TJM dérivés de consultants, jamais dupliqués.'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS partner_cv_pushes`)
  }
}
