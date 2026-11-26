import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4196 (épopée #4191, lot L5) — RATTRAPAGE : un consultant en mission n'est
 * jamais archivé. Avant ce lot, rien ne l'empêchait : des fiches archivées
 * portent aujourd'hui une affectation EN COURS. On les désarchive (`archived_at`
 * et `archived_reason` remis à NULL) — une fiche qui travaille chez un client
 * n'est pas « partie ».
 *
 * « En cours » = la même définition que `findActiveEngagements`
 * (`consultants/consultant-engagement.ts`) : affectation ni terminée, ni
 * remplacée, commencée, pas finie, sur une mission ni terminée ni annulée.
 *
 * DONNÉES SEULEMENT, aucun changement de schéma. Idempotente : une fois
 * désarchivées, ces fiches ne correspondent plus au filtre `archived_at IS NOT
 * NULL`. `RAISE NOTICE` du nombre de fiches rattrapées. `down` est un no-op
 * assumé : on ne rejoue pas un archivage qu'aucun humain n'a voulu.
 */
export class UnarchiveConsultantsOnMission1796531417285 implements MigrationInterface {
  name = 'UnarchiveConsultantsOnMission1796531417285'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE unarchived integer;
      BEGIN
        WITH rescued AS (
          UPDATE consultants c
             SET archived_at = NULL, archived_reason = NULL, updated_at = now()
           WHERE c.archived_at IS NOT NULL
             AND EXISTS (
               SELECT 1
                 FROM mission_assignments a
                 JOIN missions m ON m.id = a.mission_id
                WHERE a.consultant_id = c.id
                  AND a.status NOT IN ('completed', 'terminated', 'replaced')
                  AND m.status NOT IN ('completed', 'cancelled')
                  AND a.starts_on <= CURRENT_DATE
                  AND (a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE)
             )
          RETURNING c.id
        )
        SELECT count(*) INTO unarchived FROM rescued;
        RAISE NOTICE 'UnarchiveConsultantsOnMission: % fiche(s) désarchivée(s)', unarchived;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    // Volontairement vide : voir le docblock.
  }
}
