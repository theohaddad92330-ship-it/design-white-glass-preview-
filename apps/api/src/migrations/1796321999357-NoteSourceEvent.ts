import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2103.1 — LE PRÉALABLE du déclencheur post-RDV : savoir si un rendez-vous a
 * DÉJÀ un compte rendu, pour ne jamais le reproposer.
 *
 * `MeetingRecap.sourceEventId` (packages/contracts/src/schemas/meeting-notes.ts)
 * existe côté contrat depuis `fix/autres-a3-23-09`, mais rien ne le PERSISTE :
 * `NotesService.create` écrit la note (`entity_type`/`entity_id`) sans jamais
 * garder le rendez-vous d'origine. Sans cette colonne, aucune requête ne peut
 * répondre « ce rendez-vous a-t-il déjà un CR ? » — chaque nuit précédente
 * (25/09, 26/09 lots r6/r7/nuit-14) a buté sur exactement ce constat.
 *
 * Additive et nullable : `NULL` pour toute note qui n'est pas née d'un
 * rendez-vous (l'immense majorité), comportement d'avant inchangé. `text`,
 * pas `uuid` : l'id d'un événement Google/Outlook n'est pas un UUID.
 */
export class NoteSourceEvent1796321999357 implements MigrationInterface {
  public name = 'NoteSourceEvent1796321999357'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS source_event_id text;
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS notes_source_event_id_idx ON notes (source_event_id) WHERE source_event_id IS NOT NULL;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
