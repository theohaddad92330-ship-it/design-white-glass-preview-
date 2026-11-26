import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `rfp_source_documents` — #2957 (#2180.54) : les fichiers BRUTS d'un dossier
 * d'appel d'offres, tels que déposés à l'import (30/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `RfpService.analyse()` reçoit chaque document (`text`/`fileBase64`) pour
 * l'extraction, puis le jette : seul le TEXTE extrait survit
 * (`rfps.source_text`). Un commercial qui voulait rouvrir le PDF original
 * (contrôle, archive, litige) ne le pouvait plus — le dossier gardait ce qu'un
 * modèle en avait lu, jamais le document lui-même.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE TABLE DE JOINTURE, PAS UNE COLONNE SUR `rfps`
 * ─────────────────────────────────────────────────────────────────────────────
 * Un dossier regroupe PLUSIEURS documents (#2180.4) : `rfps` porte un
 * dossier, cette table porte SES fichiers, dans l'ordre de dépôt (`position`).
 * Le lien vers le fichier réel vit dans `storage_objects` (registre central,
 * voir `1790990000001-StorageObjects`) — cette table ne fait QUE la jointure,
 * comme `need_documents.storage_object_id` le fait pour un besoin.
 *
 * `ON DELETE CASCADE` sur les deux clés : un dossier supprimé n'a plus de
 * fichiers à nommer, et un objet purgé par la routine de rétention (cinq ans,
 * voir `STORAGE_RETENTION_YEARS_BY_DOMAIN.rfp_source_document`) ne laisse pas
 * derrière lui une ligne qui pointerait dans le vide — contrairement à
 * `need_documents` (qui SUIT un document indépendamment de son fichier), une
 * ligne de cette table n'a aucune raison d'exister sans le fichier qu'elle
 * référence.
 */
export class RfpSourceDocuments1796412761537 implements MigrationInterface {
  public name = 'RfpSourceDocuments1796412761537'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rfp_source_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        rfp_id uuid NOT NULL REFERENCES rfps(id) ON DELETE CASCADE,
        storage_object_id uuid NOT NULL REFERENCES storage_objects(id) ON DELETE CASCADE,
        position smallint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT rfp_source_documents_unique_object UNIQUE (rfp_id, storage_object_id)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS rfp_source_documents_rfp_idx ON rfp_source_documents (workspace_id, rfp_id, position)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE rfp_source_documents IS
        'Les fichiers BRUTS d''un dossier d''appel d''offres (#2957, #2180.54), dans l''ordre de depot. Jointure vers storage_objects uniquement ; ON DELETE CASCADE des deux cotes, une ligne sans fichier n''a rien a nommer.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS rfp_source_documents`)
  }
}
