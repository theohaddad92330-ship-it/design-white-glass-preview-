import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — LE LIEN SIGNÉ À PORTÉE LIMITÉE.
 *
 * Vocabulaire complet dans
 * `packages/contracts/src/schemas/legal-contract-upload-link.ts` (GA-26).
 *
 * `token_hash` est UNIQUE et c'est la SEULE colonne par laquelle la porte
 * publique résout une ligne (jamais par `workspace_id` — le jeton, pas la
 * session, prouve le droit). Même patron de hachage que `api_keys.key_hash`
 * (`apps/api/src/database/entities/api-key.entity.ts`) : le jeton brut n'est
 * JAMAIS stocké, seul son SHA-256 l'est.
 *
 * `contract_id`/`mission_id` sont NOT NULL — « une mission + un contrat »,
 * jamais un lien qui porterait l'un sans l'autre. `ON DELETE CASCADE` sur les
 * deux : un contrat ou une mission supprimés emportent les liens qu'ils
 * portaient, jamais un lien orphelin qui résoudrait vers rien.
 *
 * Même patron RLS que `legal_contracts` (workspace-scopé, lecture par les
 * membres de l'espace) — la porte publique, elle, passe par la clé de
 * service de l'API, comme le reste du dépôt (`storage_objects`, etc.).
 */
export class LegalContractUploadLinks1796437800002 implements MigrationInterface {
  public name = 'LegalContractUploadLinks1796437800002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legal_contract_upload_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        contract_id uuid NOT NULL REFERENCES legal_contracts(id) ON DELETE CASCADE,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz NULL,
        deposits jsonb NOT NULL DEFAULT '[]'::jsonb,
        CONSTRAINT legal_contract_upload_links_token_hash_key UNIQUE (token_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_legal_contract_upload_links_contract
        ON legal_contract_upload_links (contract_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_legal_contract_upload_links_workspace
        ON legal_contract_upload_links (workspace_id);
      ALTER TABLE legal_contract_upload_links ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "legal_contract_upload_links_workspace_read" ON legal_contract_upload_links;
      CREATE POLICY "legal_contract_upload_links_workspace_read" ON legal_contract_upload_links FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS legal_contract_upload_links`)
  }
}
