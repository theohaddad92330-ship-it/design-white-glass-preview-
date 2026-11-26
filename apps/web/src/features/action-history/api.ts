import type { ActionHistoryItem, ActionHistoryQuery, ActionHistoryResponse, SinceLastSeen } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export function buildQueryString(filters: ActionHistoryQuery): string {
  const params = new URLSearchParams()
  if (filters.type) params.set('type', filters.type)
  if (filters.status) params.set('status', filters.status)
  if (filters.period) params.set('period', filters.period)
  // Recherche par compte / par membre. Oublier une clé ici, c'est un filtre qui
  // s'affiche à l'écran, entre dans la clé de cache… et n'atteint jamais le
  // serveur : la liste ne bouge pas et rien ne le signale.
  if (filters.account) params.set('account', filters.account)
  if (filters.actorId) params.set('actorId', filters.actorId)
  // #2200.38 — canal (LinkedIn, e-mail, téléphone, RDV, autre).
  if (filters.channel) params.set('channel', filters.channel)
  // « Depuis votre dernière connexion » : le repère est un paramètre serveur au
  // même titre que les autres — l'omettre montrerait tout l'historique.
  if (filters.since) params.set('since', filters.since)
  if (filters.offset !== undefined) params.set('offset', String(filters.offset))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export const actionHistoryApi = {
  list(filters: ActionHistoryQuery = {}): Promise<ActionHistoryResponse> {
    return apiFetch<ActionHistoryResponse>({ path: `/actions/history${buildQueryString(filters)}` })
  },
  getOne(id: string): Promise<ActionHistoryItem> {
    return apiFetch<ActionHistoryItem>({ path: `/actions/history/${id}` })
  },
  // Pose/rafraîchit le repère « depuis ma dernière connexion » et renvoie
  // l'instant de la visite précédente (stable pour la session courante).
  markSeen(): Promise<SinceLastSeen> {
    return apiFetch<SinceLastSeen>({ path: '/actions/mark-seen', method: 'POST' })
  },
}

export const actionHistoryKeys = {
  all: ['actions', 'history'] as const,
  list: (filters: ActionHistoryQuery) => ['actions', 'history', filters] as const,
  detail: (id: string) => ['actions', 'history', id] as const,
  lastSeen: ['actions', 'last-seen'] as const,
}
