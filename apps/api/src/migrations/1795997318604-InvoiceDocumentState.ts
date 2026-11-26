import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2418.2 — les TROIS états de DOCUMENT, À CÔTÉ des quatre d'encaissement.
 *
 * DÉCISION LOUIS 21/09/2026 : oui pour « acceptée », « rejetée », « avoir
 * émis » — comme états du DOCUMENT dans l'outil du client, jamais mêlés aux
 * quatre statuts d'encaissement (`paid` / `overdue` / `disputed` / `pending`,
 * `c72_encaissement_reste_du_nomme`). Le cinquième statut d'ENCAISSEMENT reste
 * REFUSÉ : pas de `partially_paid`, le reste dû se NOMME sur « en retard » ou
 * « en attente ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS AXES, ET C'EST LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `state` (colonne existante) — où en est NOTRE écriture : `created` →
 *     `sent` → `invoiced` / `failed` / `unknown`.
 *  2. `document_state` (colonne ajoutée ici) — où en est le DOCUMENT chez le
 *     client : `accepted` / `rejected` / `credited`.
 *  3. Les quatre statuts d'ENCAISSEMENT — dérivés, jamais stockés
 *     (`apps/web/src/features/missions/collections.ts`).
 *
 * Les confondre reviendrait à dire qu'une facture acceptée est payée, ou qu'un
 * avoir est un litige. Trois questions, trois réponses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONTRAINTE SQL PASSE AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette migration voyage seule, avec la colonne d'entité qu'elle exige (GA-36)
 * et l'énumération fermée que GA-12 lui associe — trois déclarations, aucune
 * écriture. La porte du connecteur et le service qui lit sa réponse arrivent au
 * commit SUIVANT : quand du code écrira « acceptée », la contrainte l'attendra
 * depuis un commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN ÉTAT SANS SA PREUVE N'EXISTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces trois états ne s'écrivent QUE sur preuve du connecteur, jamais par
 * déduction (doctrine : « facturé ne s'écrit que sur preuve du connecteur »,
 * #2564 ; « facturé se garde, sa SOURCE se nomme », `c80`). La contrainte
 * `…_document_evidence_check` le rend indéformable EN BASE : l'état, sa
 * référence chez l'outil et la date à laquelle l'outil l'a dit sont présents
 * tous les trois, ou absents tous les trois. Un `UPDATE` qui poserait
 * « acceptée » sans preuve est refusé par PostgreSQL, pas seulement par une
 * relecture — c'est la différence entre une règle et une intention.
 *
 * Additive : aucune colonne existante n'est touchée, aucune valeur existante
 * n'est réécrite. Les lignes déjà là restent `NULL` — on ne sait pas, et « on
 * ne sait pas » n'est pas « rejetée ».
 */
export class InvoiceDocumentState1795997318604 implements MigrationInterface {
  name = 'InvoiceDocumentState1795997318604'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_connector_write_requests
        ADD COLUMN IF NOT EXISTS document_state text,
        ADD COLUMN IF NOT EXISTS document_state_reference text,
        ADD COLUMN IF NOT EXISTS document_state_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_connector_write_requests
        DROP CONSTRAINT IF EXISTS invoice_connector_write_requests_document_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_connector_write_requests
        ADD CONSTRAINT invoice_connector_write_requests_document_state_check
        CHECK (document_state IS NULL OR document_state IN ('accepted', 'rejected', 'credited'))
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_connector_write_requests
        DROP CONSTRAINT IF EXISTS invoice_connector_write_requests_document_evidence_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_connector_write_requests
        ADD CONSTRAINT invoice_connector_write_requests_document_evidence_check
        CHECK (
          (document_state IS NULL AND document_state_reference IS NULL AND document_state_at IS NULL)
          OR (document_state IS NOT NULL AND document_state_reference IS NOT NULL AND document_state_at IS NOT NULL)
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_connector_write_requests
        DROP CONSTRAINT IF EXISTS invoice_connector_write_requests_document_evidence_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_connector_write_requests
        DROP CONSTRAINT IF EXISTS invoice_connector_write_requests_document_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_connector_write_requests
        DROP COLUMN IF EXISTS document_state_at,
        DROP COLUMN IF EXISTS document_state_reference,
        DROP COLUMN IF EXISTS document_state
    `)
  }
}
