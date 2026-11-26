/**
 * #4996 L3 — de quels comptes ce lecteur est-il CO-ÉQUIPIER ACTIF ?
 *
 * Le pendant mémoire de `portfolioScopeClause` (contrat) : les jugements qui
 * tiennent déjà un compte chargé (`isInPortfolio`) demandent ici, en UNE requête
 * bornée à l'espace, lesquels de ces comptes l'équipent. Un retrait pose
 * `removed_at` : seule la ligne active compte.
 */
export async function activeTeammateAccountIds(
  manager: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  workspaceId: string,
  userId: string,
  accountIds: readonly string[],
): Promise<Set<string>> {
  if (accountIds.length === 0) return new Set()
  const rows = (await manager.query(
    `SELECT account_id FROM account_team_members
      WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL AND account_id = ANY($3::uuid[])`,
    [workspaceId, userId, [...accountIds]],
  )) as { account_id: string }[] | undefined
  return new Set((rows ?? []).map(row => row.account_id))
}
