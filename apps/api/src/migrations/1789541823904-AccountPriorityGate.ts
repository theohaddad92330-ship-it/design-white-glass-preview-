import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La porte G1 — un compte entre dans le portefeuille, ou en sort (PDF 2 §4.4 B2,
 * ticket BEL-CRM-102).
 *
 * Le geste existait sous une forme muette : « Ajouter au portefeuille » et
 * « Archiver » ne demandaient AUCUN motif et ne laissaient aucune trace. Deux
 * conséquences, toutes deux constatées : les comptes écartés revenaient
 * indéfiniment dans Découvrir, et six mois plus tard personne ne savait
 * pourquoi on avait dit non — donc on redisait non pour la même raison, ou pire,
 * on redisait oui.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX AXES, JAMAIS FUSIONNÉS
 * ─────────────────────────────────────────────────────────────────────────
 * `priority_gate` n'est PAS `commercial_status`, et le ticket l'interdit
 * explicitement. Le premier dit « est-ce que je travaille ce compte » ; le
 * second dit « où en est la relation » (à trier, suivi, client…). Un client
 * peut être mis en veille sans cesser d'être client ; un prospect peut être
 * priorisé sans être suivi. Les confondre ferait disparaître un client de la
 * facturation le jour où quelqu'un le met en veille.
 *
 * La reprise ne PROMEUT personne : seuls les comptes qui portaient déjà un
 * statut au-delà de « à trier » passent en `prioritised`, parce que quelqu'un
 * avait déjà posé ce geste. Tout le reste reste `pending` — c'est-à-dire « la
 * question n'a pas été posée », qui est la vérité.
 */
export class AccountPriorityGate1789541823904 implements MigrationInterface {
  name = 'AccountPriorityGate1789541823904'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS priority_gate text NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS gate_reason text,
        ADD COLUMN IF NOT EXISTS gate_decided_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE accounts ADD CONSTRAINT accounts_priority_gate_check CHECK (
        priority_gate IN ('pending','prioritised','parked')
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS accounts_priority_gate_idx ON accounts (workspace_id, priority_gate)
    `)

    // Reprise : quelqu'un avait déjà décidé pour ces comptes-là.
    await queryRunner.query(`
      UPDATE accounts SET priority_gate = 'prioritised', gate_decided_at = COALESCE(gate_decided_at, updated_at)
      WHERE commercial_status IN ('watching','opportunity','customer')
    `)
    await queryRunner.query(`
      UPDATE accounts SET priority_gate = 'parked', gate_decided_at = COALESCE(gate_decided_at, updated_at)
      WHERE commercial_status = 'archived'
    `)

    // Le catalogue de motifs d'écartement, sur le MÊME patron que les motifs de
    // perte de projet : par espace, éditable, jamais supprimé quand il sert.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_park_reasons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        label text NOT NULL,
        archived boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_park_reasons_unique
        ON account_park_reasons (workspace_id, lower(label))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_park_reasons`)
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_priority_gate_check`)
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP COLUMN IF EXISTS priority_gate,
        DROP COLUMN IF EXISTS gate_reason,
        DROP COLUMN IF EXISTS gate_decided_at
    `)
  }
}
