import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3699.6 — LA BIBLIOTHÈQUE DE DOCUMENTS ATTACHABLES : le fichier réel d'un
 * asset outreach (#2838), ce que la base doit accepter AVANT le code qui
 * l'écrit (GA-11/GA-12).
 *
 *  1. `storage_objects_domain_check` gagne `outreach_asset_file`, EN FIN de
 *     liste — reprise de la DERNIÈRE déclaration
 *     (`1796437800004-LegalContractExternalUploadStorageDomain`).
 *  2. `outreach_assets.storage_object_id` — le lien vers l'objet rangé,
 *     NULLABLE (un asset sans fichier reste un asset : il s'annonce, il ne se
 *     joint pas). `ON DELETE SET NULL` : un objet effacé détache l'asset, il ne
 *     l'emporte pas. C'est exactement la suite que le docblock du catalogue
 *     (`outreach-asset.ts`) annonçait, sur le patron `1790990000002-StoredFileLinks`.
 *  3. RLS posée sur `outreach_assets` (lecture des membres de l'espace) : le
 *     catalogue porte désormais des octets, il ne reste pas lisible hors espace
 *     par la clé publique.
 *
 * Additive seulement : aucune ligne existante n'est touchée.
 */
export class OutreachAssetFile1796437901201 implements MigrationInterface {
  public name = 'OutreachAssetFile1796437901201'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE storage_objects DROP CONSTRAINT IF EXISTS storage_objects_domain_check`)
    await queryRunner.query(`
      ALTER TABLE storage_objects ADD CONSTRAINT storage_objects_domain_check
        CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment', 'chat_image_attachment', 'rfp_source_document', 'rag_document_source', 'legal_contract_external_upload', 'outreach_asset_file'))
    `)
    await queryRunner.query(`
      ALTER TABLE outreach_assets
        ADD COLUMN IF NOT EXISTS storage_object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outreach_assets_object_idx
        ON outreach_assets (storage_object_id) WHERE storage_object_id IS NOT NULL
    `)
    await queryRunner.query(`ALTER TABLE outreach_assets ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "outreach_assets_workspace_read" ON outreach_assets`)
    await queryRunner.query(`
      CREATE POLICY "outreach_assets_workspace_read" ON outreach_assets FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN outreach_assets.storage_object_id IS
        '#3699.6 - le fichier reel de l''asset (domaine outreach_asset_file), joignable a un envoi individuel choisi par le commercial. NULL = asset annonce, sans fichier.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS "outreach_assets_workspace_read" ON outreach_assets`)
    await queryRunner.query(`ALTER TABLE outreach_assets DISABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP INDEX IF EXISTS outreach_assets_object_idx`)
    await queryRunner.query(`ALTER TABLE outreach_assets DROP COLUMN IF EXISTS storage_object_id`)
    // ⚠️ La contrainte de domaine n'est PAS rétrécie : des objets
    // `outreach_asset_file` peuvent déjà exister.
  }
}
