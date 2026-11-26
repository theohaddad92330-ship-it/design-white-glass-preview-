import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4295.27 (#4016.121) — la demande de signature d'une PROPOSITION est retenue à l'envoi.
 *
 * « Relire le statut » listait toutes les signatures en attente du compte outil, sans filtre par proposition et
 * sans jamais lire « signé ». L'identifiant de la demande (celui que le fournisseur a activée) est donc rattaché à
 * la proposition (`opportunities`) quand Bellum l'envoie, avec le DERNIER statut relu et sa date — jamais présumé.
 * Additif : aucune ligne n'est réécrite, aucune contrainte posée (les valeurs sont validées par le code).
 */
export class ProposalSignatureRequest1796574900001 implements MigrationInterface {
  public name = 'ProposalSignatureRequest1796574900001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunities
        ADD COLUMN IF NOT EXISTS signature_request_id text,
        ADD COLUMN IF NOT EXISTS signature_provider text,
        ADD COLUMN IF NOT EXISTS signature_sent_at timestamptz,
        ADD COLUMN IF NOT EXISTS signature_status text,
        ADD COLUMN IF NOT EXISTS signature_status_at timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunities
        DROP COLUMN IF EXISTS signature_request_id,
        DROP COLUMN IF EXISTS signature_provider,
        DROP COLUMN IF EXISTS signature_sent_at,
        DROP COLUMN IF EXISTS signature_status,
        DROP COLUMN IF EXISTS signature_status_at
    `)
  }
}
