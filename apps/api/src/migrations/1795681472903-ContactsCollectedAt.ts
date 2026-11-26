import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #AF.2 (18/09/2026) — LA DATE DE COLLECTE DU SEGMENT CONTACTS, distincte de
 * `contacts_refreshed_at`.
 *
 * ⚠️ `contacts_refreshed_at` (migration `1790040000002`) N'EST PAS cette date :
 * elle n'est écrite QUE par le bouton « Rafraîchir → Contacts »
 * (`AnalysisRefreshService`), jamais par une analyse initiale — un compte
 * analysé ce matin par le pipeline complet porte `contacts_refreshed_at NULL`,
 * exactement comme un compte analysé il y a six mois. La confondre avec « la
 * dernière fois qu'on a collecté les contacts » aurait fait rejouer un rattrapage
 * sur du neuf, ou manqué du vieux.
 *
 * `contacts_collected_at` est stampée à CHAQUE collecte réelle — pipeline
 * complet (Phase 2) OU rafraîchissement ciblé — par
 * `AnalysisPersistenceService.saveContacts`, seul appelant. Elle donne au
 * ciblage du rattrapage (#2543) la date qu'il lui manquait :
 * `isSegmentCollectionStale(contacts_collected_at, SEGMENT_CAPABILITY_EPOCH.contacts)`.
 *
 * NULLABLE : `NULL` = « cette collecte n'a jamais été datée » — l'état de tous
 * les dossiers antérieurs à ce lot. Le ciblage la traite comme CONCERNÉE
 * (`isSegmentCollectionStale` rend `true` sur `null`) : on ne présume jamais
 * un compte à jour faute de savoir.
 */
export class ContactsCollectedAt1795681472903 implements MigrationInterface {
  public name = 'ContactsCollectedAt1795681472903'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS contacts_collected_at timestamptz NULL`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
