import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les outils administratifs d'un espace : signature électronique et facturation.
 *
 * §5.9 du rapport besoins, déclencheurs n°11 (contrats en attente) et n°12
 * (factures impayées). Les deux routines existaient déjà mais ne lisaient que la
 * messagerie : elles repéraient le mot « facture » dans un fil, pas une facture
 * réellement impayée.
 *
 * Une ligne par fournisseur et par espace : une ESN peut avoir sa signature chez
 * l'un et sa facturation chez l'autre. Le secret est chiffré ; aucune route ne
 * le relit.
 *
 * Ce que cette table ne porte PAS, et ne portera pas : aucun IBAN, aucun moyen
 * de paiement, aucun document. Bellum regarde ce qui traîne et le dit.
 */
export class AdminDocsConnections1788900000005 implements MigrationInterface {
  public name = 'AdminDocsConnections1788900000005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_docs_connections (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id    uuid NOT NULL,
        created_by      uuid NOT NULL,
        provider        text NOT NULL,
        credentials_enc text NOT NULL,
        base_url        text,
        last_used_at    timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT admin_docs_connections_unique UNIQUE (workspace_id, provider),
        CONSTRAINT admin_docs_connections_provider_check CHECK (
          provider IN ('yousign', 'docusign', 'qonto', 'tiime')
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS admin_docs_connections_workspace_idx ON admin_docs_connections (workspace_id)`,
    )
    await queryRunner.query(`ALTER TABLE admin_docs_connections ENABLE ROW LEVEL SECURITY`)
    // Aucune politique permissive : un secret de facturation ne doit jamais être
    // lisible par le client Supabase.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS admin_docs_connections`)
  }
}
