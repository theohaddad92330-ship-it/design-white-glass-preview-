// #2905 (#2442.16) — client de la route de REPLAY EN LECTURE SEULE d'un tour
// de Laura (GET /internal/chat-turn/:turnId, InternalSecretGuard). Appelé
// côté serveur uniquement — même doctrine que telemetry.ts : le secret
// interne ne traverse jamais le navigateur.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * #3391 — la raison d'un appel d'outil, telle que `reasoning_trace.tools_detail`
 * la persiste (apps/ia `tools_detail_from_actions`). CLÉS d'entrée seulement,
 * jamais une valeur (#2442.3).
 */
type ChatTurnToolDetail = {
  tool: string
  mode: 'read' | 'write'
  input_keys: string[]
  silent: boolean
}

/** Le sous-ensemble du `context` d'un message que le replay lit. */
type ChatTurnContext = {
  reasoning_trace?: {
    tools_called?: string[]
    tools_detail?: ChatTurnToolDetail[]
    execution_id?: string
  }
} | null

type ChatTurnReplayMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  context: ChatTurnContext
  attachments: { id: string; name: string }[] | null
}

/** Un outil appelé, tel que l'écran le montre. `mode`/`inputKeys` à `null` = non persistés. */
export type ToolCallView = { tool: string; mode: 'read' | 'write' | null; inputKeys: string[] | null }

/**
 * #3391 — les outils appelés par un message de Laura. Un ancien message (sans
 * `tools_detail`) rend ce qu'il a, les NOMS de `tools_called`, avec mode et clés
 * à `null` : rien n'est inventé. Pas de trace du tout : liste vide.
 */
export function outilsDuMessage(context: ChatTurnContext | undefined): ToolCallView[] {
  const trace = context?.reasoning_trace
  if (!trace) return []
  if (Array.isArray(trace.tools_detail) && trace.tools_detail.length > 0) {
    return trace.tools_detail.map(d => ({ tool: d.tool, mode: d.mode, inputKeys: d.input_keys }))
  }
  return (trace.tools_called ?? []).map(tool => ({ tool, mode: null, inputKeys: null }))
}

/**
 * #3777 / #3717.7 (reste du lot W9) — l'identifiant d'exécution du dossier
 * consulté ce tour (`ReasoningTrace.execution_id`, posé par
 * `execution_id_hint` côté IA), pour lire la même piste de bout en bout
 * qu'`executionId` sur le dossier. Absent sans dossier consulté ce tour —
 * jamais deviné.
 */
export function executionIdDuMessage(context: ChatTurnContext | undefined): string | null {
  return context?.reasoning_trace?.execution_id ?? null
}

export async function fetchChatTurnReplay(turnId: string): Promise<ChatTurnReplayMessage[]> {
  const res = await fetch(`${REAL_BASE}/internal/chat-turn/${encodeURIComponent(turnId)}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Chat turn replay endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ChatTurnReplayMessage[]
}

/** #3391 — une ligne de la liste des tours (aucun corps de message). */
export type ChatTurnSummary = {
  turnId: string
  workspaceId: string | null
  workspaceName: string | null
  startedAt: string
  messageCount: number
  toolsCalled: string[]
}

export const CHAT_TURNS_PAGE_SIZE = 25

export async function fetchChatTurns(opts: { workspaceId?: string; offset?: number } = {}): Promise<ChatTurnSummary[]> {
  const url = new URL('/internal/chat-turns', REAL_BASE)
  if (opts.workspaceId) url.searchParams.set('workspaceId', opts.workspaceId)
  url.searchParams.set('limit', String(CHAT_TURNS_PAGE_SIZE))
  url.searchParams.set('offset', String(opts.offset ?? 0))
  const res = await fetch(url, { headers: { 'x-internal-secret': REAL_SECRET }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Chat turns list endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ChatTurnSummary[]
}
