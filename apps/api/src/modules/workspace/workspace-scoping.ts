import { IsNull, type FindOptionsWhere, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm'

/**
 * Canonical multi-user Phase-2 scoping helpers.
 *
 * Team-scoped modules read their rows with `where user_id = :uid`. Phase 2
 * swaps that for `where workspace_id = :wsId`, where `:wsId` comes from
 * {@link WorkspaceContextService.resolveActiveWorkspace}. These two helpers are
 * the ONLY two shapes a read takes, so every module converts the same way.
 *
 * `user_id` is **kept on every row** as created-by attribution — only the
 * *read scope* moves to `workspace_id`. Writes still stamp `user_id` (and, once
 * Phase 2 rolls a table over, `workspace_id`).
 *
 * État du dépôt (#4731) : le chemin d'écriture des COMPTES (`accountGestureWhere`) et des
 * CONTACTS (`contactGestureWhere`) est migré. Leur cible de geste compose ces aides en un OU :
 * `[{ id, ...workspaceScopeWhere(wsId) }, { id, workspace_id: IsNull(), user_id }]` — la ligne
 * ANCIENNE (`workspace_id` NULL) garde son geste pour son propriétaire. Pour toute AUTRE table
 * dont le chemin d'écriture n'est pas migré, ne pas utiliser ces aides seules comme cible
 * d'une écriture : un `workspace_id` nu retire le geste aux lignes anciennes.
 *
 * --- Pattern A — repository `find` / `findOne` (object where) --------------
 *
 *   // before
 *   this.repo.find({ where: { user_id: userId }, order: { created_at: 'DESC' } })
 *   // after
 *   const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
 *   this.repo.find({ where: workspaceScopeWhere(workspaceId), order: { created_at: 'DESC' } })
 *
 * --- Pattern B — QueryBuilder ---------------------------------------------
 *
 *   // before
 *   qb.where('a.user_id = :userId', { userId })
 *   // after
 *   applyWorkspaceScope(qb.where('1 = 1'), 'a', workspaceId)
 *   // (or just start the chain with it: applyWorkspaceScope(qb, 'a', workspaceId))
 */

/** Scope column name — single source of truth so a rename is one edit. */
export const WORKSPACE_SCOPE_COLUMN = 'workspace_id' as const

/**
 * Pattern A: the `where` fragment for a `find`/`findOne`. Merge extra
 * predicates with a spread — `{ ...workspaceScopeWhere(wsId), status: 'active' }`.
 */
export function workspaceScopeWhere(workspaceId: string): { workspace_id: string } {
  return { [WORKSPACE_SCOPE_COLUMN]: workspaceId }
}

/**
 * Pattern B: append `<alias>.workspace_id = :workspaceId` to a QueryBuilder.
 * Uses `andWhere` so it composes with any predicates already on the builder;
 * seed a bare builder with `.where('1 = 1')` first if this is the only clause.
 */
export function applyWorkspaceScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  workspaceId: string,
): SelectQueryBuilder<T> {
  return qb.andWhere(`${alias}.${WORKSPACE_SCOPE_COLUMN} = :workspaceId`, { workspaceId })
}

/**
 * #4804 / #4731 — LA CLÉ DE GESTE partagée (séquences, comptes porteurs d'un plan) : un OU entre
 * la ligne de l'ESPACE actif et la ligne ANCIENNE (`workspace_id` NULL) de son propriétaire.
 * Un autre espace reste refusé ; `user_id` = « créé par », jamais « qui a le droit ». UN endroit (GA-26).
 */
export function workspaceGestureWhere<T extends { workspace_id: string | null; user_id: string }>(
  workspaceId: string,
  userId: string,
  base: FindOptionsWhere<T>,
): FindOptionsWhere<T>[] {
  return [
    { ...base, workspace_id: workspaceId } as FindOptionsWhere<T>,
    { ...base, workspace_id: IsNull(), user_id: userId } as FindOptionsWhere<T>,
  ]
}
