import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2172.42 → .49 / .54 — CE QU'ON A DÉCIDÉ D'UNE PISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE, ALORS QUE LA FILE NE S'ÉCRIT NULLE PART
 * ─────────────────────────────────────────────────────────────────────────────
 * Les pistes se DÉRIVENT à la lecture des lignes déjà en base — rien à stocker,
 * pour la même raison que `evidence` (D27 · 28/08). Ce qui ne se dérive pas,
 * c'est la DÉCISION : « hors cible », « pas d'accès », « on verra en janvier ».
 * Sans elle, l'analyse suivante repropose exactement ce que le commercial vient
 * d'écarter, et la file devient un bruit qu'on cesse d'ouvrir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES QUE LA BASE TIENT ELLE-MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `scope = 'workspace'`, contraint. Un écartement AJUSTE l'espace de travail
 *    et ne réécrit JAMAIS la donnée marché globale : « pas d'accès » veut dire
 *    que CETTE ESN n'a pas d'accès, pas que le compte est fermé. Le contraindre
 *    en base plutôt qu'en code ferme aussi le chemin d'une écriture directe —
 *    et, au passage, ce serait un échange d'informations entre concurrents
 *    (`COMMUNITY_FORBIDDEN_KINDS`, GA-43).
 *  · la FORME de chaque décision : un écartement porte un motif et n'expire
 *    pas ; une mise en veille porte une échéance et pas de motif. Une ligne
 *    « écartée sans raison » ne peut pas exister : le motif est ce qui rend la
 *    décision relisible dans six mois.
 *
 * ⚠️ ON ARCHIVE, ON NE SUPPRIME PAS. La ligne EST la pierre tombale : elle porte
 * sa date, son auteur et son motif, et la file la rend consultable. Rien ici
 * n'efface la piste elle-même, qui reste dans `opportunities`.
 *
 * Porte « ajout seulement » (GA-11 / GA-12) : une table neuve, aucune contrainte
 * resserrée ailleurs, aucune colonne existante touchée.
 */
export class QualificationLeadDecisions1794100418506 implements MigrationInterface {
  name = 'QualificationLeadDecisions1794100418506'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qualification_lead_decisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL,
        lead_key text NOT NULL,
        decision text NOT NULL,
        reason text,
        note text,
        scope text NOT NULL DEFAULT 'workspace',
        decided_by uuid,
        decided_at timestamptz NOT NULL DEFAULT now(),
        snoozed_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      ALTER TABLE qualification_lead_decisions
        DROP CONSTRAINT IF EXISTS qualification_lead_decisions_decision_check,
        ADD CONSTRAINT qualification_lead_decisions_decision_check CHECK (decision IN ('dismissed', 'snoozed'))
    `)
    await queryRunner.query(`
      ALTER TABLE qualification_lead_decisions
        DROP CONSTRAINT IF EXISTS qualification_lead_decisions_reason_check,
        ADD CONSTRAINT qualification_lead_decisions_reason_check CHECK (reason IS NULL OR reason IN ('out_of_target', 'no_real_demand', 'bad_timing', 'no_access', 'false_data', 'already_handled', 'other'))
    `)
    await queryRunner.query(`
      ALTER TABLE qualification_lead_decisions
        DROP CONSTRAINT IF EXISTS qualification_lead_decisions_scope_check,
        ADD CONSTRAINT qualification_lead_decisions_scope_check CHECK (scope = 'workspace')
    `)
    await queryRunner.query(`
      ALTER TABLE qualification_lead_decisions
        DROP CONSTRAINT IF EXISTS qualification_lead_decisions_shape_check,
        ADD CONSTRAINT qualification_lead_decisions_shape_check
        CHECK (
          (decision = 'dismissed' AND reason IS NOT NULL AND snoozed_until IS NULL)
          OR
          (decision = 'snoozed' AND reason IS NULL AND snoozed_until IS NOT NULL)
        )
    `)

    // Une seule décision vivante par piste et par espace : reprendre une piste
    // écartée est un geste de correction, pas une seconde ligne d'histoire.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS qualification_lead_decisions_key_idx
        ON qualification_lead_decisions (workspace_id, lead_key)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS qualification_lead_decisions_account_idx
        ON qualification_lead_decisions (workspace_id, account_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS qualification_lead_decisions`)
  }
}
