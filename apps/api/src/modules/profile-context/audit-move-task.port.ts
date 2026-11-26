/**
 * #2074.16 — la SEULE forme sous laquelle la décision sur un mouvement d'audit
 * apprend à poser l'action correspondante dans Actions (une TÂCHE : un
 * mouvement d'audit n'a pas de compte, et `action_plan_items.account_id` est
 * NOT NULL).
 *
 * Même raisonnement que `workspace-id.port.ts` (#2009.7) : GA-07 refuse que
 * `ProfileContextService` aille chercher `TasksService` d'un autre module. Le
 * câblage vit dans `profile-context.module.ts` ; `TasksModule` n'importe pas
 * `ProfileContextModule` (sens unique, aucun cycle, aucun `forwardRef`).
 */
export const AUDIT_MOVE_TASK_WRITER = Symbol('AUDIT_MOVE_TASK_WRITER')

type AuditMoveTask = {
  /** `<ruleId>:<cible>` — la clé de l'index unique `tasks_audit_move_once_idx`. */
  sourceKey: string
  title: string
  objective: string | null
  expectedResult: string | null
}

export type AuditMoveTaskWriter = {
  /** Idempotent : re-poser la même clé pour le même utilisateur rend `created: false`. */
  createOnce(userId: string, task: AuditMoveTask): Promise<{ created: boolean }>
}
