import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo C talents-recrutement — DÉCISION LOUIS 22/10/2026 : l'écran Recrutement, cinq étapes pour une PERSONNE
 * (À qualifier · Échange prévu · Qualifié · En veille · Écartée), indépendantes de ses présentations.
 *
 * Table neuve, append-only : une ligne par changement d'étape, avec son motif. Sa contrainte d'étape est posée ICI,
 * AVANT le code qui l'écrit (GA-11/12), et porte les cinq valeurs de `RECRUITMENT_STAGES`.
 *
 * Aucune clé vers une présentation ni une affectation : l'étape de recrutement ne les altère pas. La clé vers la
 * personne est `ON DELETE CASCADE` — l'effacement RGPD à sa demande (c67) emporte son journal avec elle ; « Écartée »,
 * elle, ne supprime rien.
 */
export class TalentRecruitmentEvents1796575013276 implements MigrationInterface {
  public name = 'TalentRecruitmentEvents1796575013276'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS talent_recruitment_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        talent_id uuid NOT NULL REFERENCES consultants (id) ON DELETE CASCADE,
        stage text NOT NULL,
        reason text,
        planned_at timestamptz,
        changed_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT talent_recruitment_events_stage_check
          CHECK (stage IN ('to_qualify', 'call_planned', 'qualified', 'on_hold', 'discarded')),
        CONSTRAINT talent_recruitment_events_reason_check CHECK (reason IS NULL OR char_length(reason) <= 500)
      )
    `)
    // L'étape courante d'une personne : sa ligne la plus récente.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_talent_recruitment_events_talent
        ON talent_recruitment_events (workspace_id, talent_id, created_at DESC)
    `)
    await queryRunner.query(`ALTER TABLE talent_recruitment_events ENABLE ROW LEVEL SECURITY`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
