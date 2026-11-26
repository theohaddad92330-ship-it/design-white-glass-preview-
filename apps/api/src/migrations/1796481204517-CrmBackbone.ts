import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4192 (épopée #4191, lot L1) — la colonne vertébrale CRM/ATS, représentable en base.
 *
 * - un positionnement porte jours et coût journalier (donc une marge prévue) ;
 * - une affaire porte une mission PAR positionnement retenu : l'unicité
 *   `missions_opportunity_uniq` (BEL-FIX-001) devient deux index partiels —
 *   un sur le couple (affaire, positionnement), un pour les missions sans
 *   positionnement (toujours UNE par affaire, comme avant) ;
 * - mission → affaire devient une vraie FK (`ON DELETE SET NULL` : une mission
 *   ne se supprime pas, sa facturation s'y accroche) ; mission → positionnement
 *   passe de la FK implicite (sans ON DELETE) à `ON DELETE SET NULL`.
 *
 * Horodatage relevé le 14/10/2026 : max de main = 1796461938274.
 */
export class CrmBackbone1796481204517 implements MigrationInterface {
  public name = 'CrmBackbone1796481204517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE submissions
        ADD COLUMN IF NOT EXISTS planned_days integer NULL
          CONSTRAINT submissions_planned_days_check CHECK (planned_days IS NULL OR planned_days > 0),
        ADD COLUMN IF NOT EXISTS daily_cost_cents bigint NULL
          CONSTRAINT submissions_daily_cost_cents_check CHECK (daily_cost_cents IS NULL OR daily_cost_cents >= 0)
    `)

    await queryRunner.query(`DROP INDEX IF EXISTS missions_opportunity_uniq`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS missions_opportunity_submission_uniq
        ON missions (opportunity_id, submission_id)
        WHERE opportunity_id IS NOT NULL AND submission_id IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS missions_opportunity_nosub_uniq
        ON missions (opportunity_id)
        WHERE opportunity_id IS NOT NULL AND submission_id IS NULL
    `)

    await queryRunner.query(`
      DO $$
      DECLARE
        orphaned integer;
      BEGIN
        UPDATE missions m
           SET opportunity_id = NULL
         WHERE m.opportunity_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.id = m.opportunity_id);
        GET DIAGNOSTICS orphaned = ROW_COUNT;
        RAISE NOTICE 'CrmBackbone — % mission(s) rattachee(s) a une affaire inexistante : lien retire (aucune mission supprimee)', orphaned;
      END $$;
    `)
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_opportunity_fk`)
    await queryRunner.query(`
      ALTER TABLE missions
        ADD CONSTRAINT missions_opportunity_fk FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL
    `)

    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_submission_id_fkey`)
    await queryRunner.query(`
      ALTER TABLE missions
        ADD CONSTRAINT missions_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS missions_opportunity_submission_uniq`)
    await queryRunner.query(`DROP INDEX IF EXISTS missions_opportunity_nosub_uniq`)
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_opportunity_fk`)
    // Plusieurs missions par affaire sont désormais légitimes : l'index d'origine
    // ne revient que s'il n'y a aucun doublon, sinon on le DIT.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM missions WHERE opportunity_id IS NOT NULL GROUP BY opportunity_id HAVING count(*) > 1
        ) THEN
          RAISE WARNING 'CrmBackbone down — des affaires portent plusieurs missions : missions_opportunity_uniq NON recree';
        ELSE
          CREATE UNIQUE INDEX IF NOT EXISTS missions_opportunity_uniq
            ON missions (opportunity_id) WHERE opportunity_id IS NOT NULL;
        END IF;
      END $$;
    `)
    // Les colonnes de coût restent : les retirer détruirait des chiffres saisis.
  }
}
