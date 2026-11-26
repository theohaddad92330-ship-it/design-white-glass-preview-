import type { EngagementDraftChannel, EngagementDraftSnapshot } from '@bellum/contracts'

/** Ce qu'il faut de l'exécuteur SQL — `EntityManager` le satisfait, un double de spec aussi. */
type SqlRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

type DraftRow = {
  entries: unknown
  context: string
  parameters: unknown
}

/**
 * #3694.7 — relire le brief confirmé et le fil qui le porte, bornés à l'espace
 * ET à l'utilisateur qui écrit (un brouillon n'est jamais partagé entre deux
 * commerciaux sur le même contact, même portée que l'ancien `Map` en mémoire).
 */
export async function loadEngagementDraft(
  runner: SqlRunner,
  input: { contactId: string; workspaceId: string; userId: string; channel: EngagementDraftChannel },
): Promise<EngagementDraftSnapshot | null> {
  const rows = (await runner.query(
    `SELECT entries, context, parameters
       FROM engagement_drafts
      WHERE workspace_id = $1 AND user_id = $2 AND contact_id = $3 AND channel = $4`,
    [input.workspaceId, input.userId, input.contactId, input.channel],
  )) as DraftRow[]
  const row = rows?.[0]
  if (!row) return null
  return {
    entries: (row.entries ?? []) as EngagementDraftSnapshot['entries'],
    context: row.context ?? '',
    parameters: (row.parameters ?? {}) as EngagementDraftSnapshot['parameters'],
  }
}

/**
 * #3694.7 — enregistre le cliché COMPLET (fil, contexte, paramètres) : une
 * ligne par (utilisateur, contact, canal), ré-écrite à chaque sauvegarde —
 * ce n'est pas un historique, c'est l'état courant du brouillon.
 */
export async function saveEngagementDraft(
  runner: SqlRunner,
  input: {
    contactId: string
    workspaceId: string
    userId: string
    channel: EngagementDraftChannel
  } & EngagementDraftSnapshot,
): Promise<void> {
  await runner.query(
    `INSERT INTO engagement_drafts (workspace_id, user_id, contact_id, channel, entries, context, parameters, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, now())
     ON CONFLICT (user_id, contact_id, channel) DO UPDATE SET
       entries = EXCLUDED.entries,
       context = EXCLUDED.context,
       parameters = EXCLUDED.parameters,
       updated_at = now()`,
    [
      input.workspaceId,
      input.userId,
      input.contactId,
      input.channel,
      JSON.stringify(input.entries),
      input.context,
      JSON.stringify(input.parameters),
    ],
  )
}
