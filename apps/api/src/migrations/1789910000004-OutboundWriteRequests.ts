import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'écriture CRM gouvernée (PDF 7 §4.4 et BEL-INT-603 — arbitrage Louis du
 * 21/08 : « toutes les écritures CRM »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ERP avait sa prévisualisation figée et son approbation depuis le 03/08
 * (`ats_write_requests`). Le CRM, lui, écrivait EN DIRECT : un export de contact,
 * une note, une tâche, une société partaient sans que personne ait vu champ par
 * champ ce qui allait être écrit. La table `outbound_write_requests` était
 * prévue au plan CRM (T10) et n'a jamais été créée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DIFFÉRENCE AVEC L'ERP, ET POURQUOI ELLE EST ASSUMÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une écriture ERP exige un RESPONSABLE : elle engage la facturation et la paie
 * de l'ESN, et `canDecide` interdit même l'auto-approbation. Une écriture CRM,
 * non : c'est le carnet d'adresses commercial de celui qui la demande. Le
 * demandeur peut donc décider lui-même — ce qui garde le clic humain fluide
 * (prévisualiser puis confirmer) sans rien retirer à la garantie, puisque la
 * prévisualisation est FIGÉE et qu'elle est montrée avant.
 *
 * Ce que la décision de Louis change vraiment : une écriture déclenchée EN FOND
 * (une note posée par la téléphonie, un reflet d'interaction réseau) ne part
 * plus toute seule. Elle devient une demande EN ATTENTE, visible. C'est la
 * conséquence qu'il a lue et acceptée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS PROPRIÉTÉS
 * ─────────────────────────────────────────────────────────────────────────────
 * `preview` est figée à la création : recalculer au moment d'approuver
 * montrerait autre chose que ce qui a été relu. `expires_at` à 3 jours — le PDF
 * en demande 21 au §8 et écrit au §4.4 qu'« approuvée trois semaines plus tard,
 * elle écrirait un état que plus personne n'a en tête » ; il se contredit, et le
 * dépôt a déjà 3 jours partout. `idempotency_key` empêche qu'un double clic ou
 * un rejeu dépose deux fois la même note dans un CRM — ce qui ne se répare pas.
 */
export class OutboundWriteRequests1789910000004 implements MigrationInterface {
  name = 'OutboundWriteRequests1789910000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outbound_write_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        requested_by uuid NOT NULL,
        provider text NOT NULL,
        kind text NOT NULL,
        payload jsonb NOT NULL,
        preview jsonb NOT NULL,
        origin text NOT NULL DEFAULT 'user',
        state text NOT NULL DEFAULT 'pending',
        idempotency_key text,
        decided_by uuid,
        decided_at timestamptz,
        expires_at timestamptz NOT NULL,
        provider_response text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outbound_write_requests_state_check
          CHECK (state IN ('pending', 'approved', 'rejected', 'expired', 'failed', 'written')),
        CONSTRAINT outbound_write_requests_origin_check CHECK (origin IN ('user', 'system'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS outbound_write_requests_idem_uidx
        ON outbound_write_requests (workspace_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outbound_write_requests_pending_idx
        ON outbound_write_requests (workspace_id, state, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS outbound_write_requests`)
  }
}
