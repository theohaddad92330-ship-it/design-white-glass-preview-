import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Action OS — les trois tables qui manquaient au domaine (addendum final p24).
 *
 * L'infrastructure d'exécution existait (BullMQ, outbox, Redis Streams,
 * identifiants de corrélation, journal `user_actions`). Ce qui n'existait pas,
 * c'est ce dont on a besoin pour GOUVERNER une exécution :
 *
 *  - `workflow_runs` — une suite d'actions devient un objet : on sait d'où elle
 *    vient, où elle en est, ce qu'elle a coûté, et on peut la reprendre. Sans
 *    elle, cinq lignes de journal sans lien étaient tout ce qui restait.
 *  - `approval_requests` — une approbation survit à la fermeture de l'onglet,
 *    peut être tranchée par un manager, et expire. Le clic dans l'instant ne
 *    permettait ni délégation ni trace.
 *  - `credit_reservations` — un crédit se réserve avant de se dépenser, de sorte
 *    que le solde reste exact PENDANT un run, pas seulement avant et après.
 *
 * Les définitions de workflow, elles, ne sont PAS en base : elles vivent dans le
 * code (versionnées avec lui, revues en PR, testées). La base ne portera que
 * leur activation quand l'écran d'administration existera — une définition
 * éditable en base sans revue serait un chemin d'écriture non gouverné, ce que
 * ce chantier cherche précisément à supprimer.
 *
 * Additif : aucune table existante n'est modifiée, aucune donnée n'est déplacée.
 */
export class ActionOs1788270000000 implements MigrationInterface {
  public name = 'ActionOs1788270000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        definition_key text NOT NULL,
        definition_version integer NOT NULL,
        trigger text NOT NULL,
        status text NOT NULL,
        account_id uuid,
        contact_id uuid,
        correlation_id text NOT NULL,
        idempotency_key text NOT NULL,
        steps jsonb NOT NULL DEFAULT '[]'::jsonb,
        estimated_credits integer NOT NULL DEFAULT 0,
        spent_credits integer NOT NULL DEFAULT 0,
        started_at timestamptz,
        finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // L'idempotence est PAR ESPACE : la clé est choisie côté client, deux
    // espaces peuvent légitimement employer la même. C'est cet index — pas une
    // vérification applicative — qui garantit qu'un double clic ne produit
    // qu'un run, même si les deux requêtes arrivent en même temps.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_idempotency_uniq
      ON workflow_runs (workspace_id, idempotency_key)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS workflow_runs_workspace_status_idx
      ON workflow_runs (workspace_id, status, created_at DESC)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        step_key text,
        required_level text NOT NULL,
        state text NOT NULL,
        requested_by uuid NOT NULL,
        decided_by uuid,
        decided_at timestamptz,
        summary text NOT NULL,
        estimated_credits integer NOT NULL DEFAULT 0,
        expires_at timestamptz NOT NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS approval_requests_workspace_state_idx
      ON approval_requests (workspace_id, state, created_at DESC)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS credit_reservations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        kind text NOT NULL,
        amount integer NOT NULL CHECK (amount > 0),
        state text NOT NULL,
        reference text NOT NULL,
        expires_at timestamptz NOT NULL,
        settled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Le solde disponible = crédits restants moins les réservations VIVANTES.
    // Cet index est celui de la requête chaude (à chaque estimation de coût).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS credit_reservations_live_idx
      ON credit_reservations (workspace_id, kind, expires_at)
      WHERE state = 'reserved'
    `)

    // Réglages d'approbation par espace. Les colonnes sont nullables : NULL =
    // « le défaut produit », de sorte qu'un espace existant n'a pas besoin d'être
    // rétro-rempli et qu'un changement de défaut le suit automatiquement.
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS approval_default_level text`)
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS approval_bulk_threshold integer`)
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS approval_spend_threshold integer`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
