import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2948 (#2329.30-.34) — PROCESSUS : démarches en cours, exclusivité, autres
 * entretiens, deadline de décision, owner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION AJOUTE, ET CE QU'ELLE N'AJOUTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre colonnes — `process_in_progress`, `process_exclusive`,
 * `process_other_interviews`, `process_decision_deadline` — mesurées ABSENTES
 * de `consultant.entity.ts` avant ce lot (aucune colonne ni table ne portait
 * « démarches en cours »/« exclusivité »/« autres entretiens »/« deadline »).
 *
 * `owner` (#2329.34) N'A PAS de cinquième colonne : `consultants.owner_user_id`
 * (`1796321356173-ConsultantOwner`, #2185.10) porte déjà « qui pilote cette
 * fiche », affiché en entête (`TalentDetailHeader.tsx`, `owner_name`). Une
 * deuxième colonne « owner de processus » ferait deux réglages pour la même
 * question (GA-26) — le processus de positionnement d'une personne est piloté
 * par la même personne que sa fiche, jamais par un tiers distinct qu'aucun
 * écran ne demande aujourd'hui.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TOUT NULLABLE, SANS DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `null` = « on n'a pas demandé » — jamais « aucune démarche en cours », ce qui
 * serait une réponse inventée pour toutes les fiches déjà en base.
 */
export class ConsultantProcess20260927181200 implements MigrationInterface {
  name = 'ConsultantProcess20260927181200'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD COLUMN IF NOT EXISTS process_in_progress boolean NULL,
        ADD COLUMN IF NOT EXISTS process_exclusive boolean NULL,
        ADD COLUMN IF NOT EXISTS process_other_interviews text NULL,
        ADD COLUMN IF NOT EXISTS process_decision_deadline date NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        DROP COLUMN IF EXISTS process_decision_deadline,
        DROP COLUMN IF EXISTS process_other_interviews,
        DROP COLUMN IF EXISTS process_exclusive,
        DROP COLUMN IF EXISTS process_in_progress
    `)
  }
}
