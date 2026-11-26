import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3758 — L'INSTANTANÉ STRUCTURÉ D'UN COMPTE RENDU DE RENDEZ-VOUS.
 *
 * Une colonne additive sur `notes`, même patron que `source_event_id`
 * (`decision_maker_contact_id`, migration 20260927183242) : nullable, posée
 * SEULEMENT par `MeetingNotesService` quand une approbation `recap` porte des
 * décisions, des prochaines étapes ou une relance. Une note déjà en base
 * (ou une note écrite à la main) reste `null` — « non enregistré », jamais
 * un objet vide qui laisserait croire qu'une cascade l'a produite.
 *
 * Nouvelle table jamais envisagée : `notes` porte déjà le compte rendu
 * (`body`), son compte (`entity_id`) et son rendez-vous source
 * (`source_event_id`) — ajouter une seconde table aurait dupliqué ces trois
 * clés pour ne loger qu'un complément du MÊME enregistrement.
 */
export class NoteMeetingRecapSnapshot1796437505057 implements MigrationInterface {
  name = 'NoteMeetingRecapSnapshot1796437505057'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS meeting_recap_snapshot jsonb
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notes DROP COLUMN IF EXISTS meeting_recap_snapshot
    `)
  }
}
