import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1959 — QUI a déclenché une tentative de dispatch.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `action_dispatch_attempts` (migration `ActionDispatchIdempotency`) porte
 * `workspace_id`, `idempotency_key`, `intent_type`, `status`, `reason`,
 * `external_ref`, `created_at`, `completed_at` — neuf colonnes, aucune ne dit
 * QUI a tenté le geste. Un séquenceur (`outreach.service.ts`) ou un run Action
 * OS dispatchent au même titre qu'un clic dans le chat : sans auteur, une
 * tentative suspecte (rejeu, boucle) ne se rattache à personne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE JUMEAU — `workflow_runs.user_id`
 * ─────────────────────────────────────────────────────────────────────────────
 * `WorkflowRunEntity.user_id` (`apps/api/src/database/entities/workflow-run.entity.ts`)
 * porte déjà « l'auteur du run — l'attribution, distincte du périmètre de
 * lecture », en `uuid` NOT NULL avec un index : un run a TOUJOURS un
 * `principal` (contrôleur HTTP ou reprise d'un run existant), donc son colonne
 * ne connaît pas l'absence.
 *
 * `action_dispatch_attempts` n'a pas cette garantie : c'est la mécanique de
 * DÉDUPLICATION DU TRANSPORT (voir la migration jumelle), pas un objet métier
 * dont chaque appelant a déjà été audité. On suit donc la FORME du jumeau
 * (`uuid`, indexé) sans copier sa contrainte NOT NULL — ⚠️ un `NULL` ici est
 * VRAI (« déclenché par le système, aucune personne derrière »), pas un trou de
 * donnée : c'est la même doctrine que `chat_messages.author_id` et
 * `memory_pinned_facts` (migrations `ChatMessageAuthorNullable`,
 * `MemoryPinnedFactAuthorNullable`) — nullable pour un système qui écrit tout
 * seul, jamais un `NULL` qui voudrait dire « on ne sait pas ».
 *
 * Aujourd'hui, `ActionRouterService.dispatchIdempotent` a TOUJOURS un
 * `ctx.userId` (le `principal` est obligatoire côté chat, `outreach.service.ts`
 * et `WorkflowRunnerService`) : la colonne est donc renseignée sur tous les
 * appelants existants, et reste `NULL` prête pour un appelant futur qui n'en
 * aurait vraiment aucun.
 *
 * Sans entité TypeORM — comme sa table (voir la migration jumelle) : le
 * service y accède par SQL brut via `this.accounts.query`.
 */
export class ActionDispatchAttemptAuthor1793108734561 implements MigrationInterface {
  name = 'ActionDispatchAttemptAuthor1793108734561'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // #1959 — l'auteur de la tentative, nullable : NULL = système, pas un trou.
    await queryRunner.query(`
      ALTER TABLE action_dispatch_attempts
        ADD COLUMN IF NOT EXISTS user_id uuid
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS action_dispatch_attempts_user_id_idx
        ON action_dispatch_attempts (user_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS action_dispatch_attempts_user_id_idx`)
    await queryRunner.query(`ALTER TABLE action_dispatch_attempts DROP COLUMN IF EXISTS user_id`)
  }
}
