import { formaterInstant } from '@/lib/dates'
// Client des endpoints registre d'outils du back-office
// (GET /internal/admin/tool-registry*, derrière InternalSecretGuard).
// Serveur uniquement : le secret interne ne doit jamais atteindre le navigateur.
// Même forme que src/lib/admin.ts.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/** Texte du catalogue, localisé FR + EN (règle i18n permanente du dépôt). */
type LocalizedText = { fr: string; en: string }

/** D'où l'état d'un outil est tiré. */
type ToolSourceKind = 'webhook' | 'crm' | 'oauth' | 'mcp' | 'server' | 'ia-server' | 'catalog' | 'workspace-secret'

/** État d'un outil pour un espace donné (contrat `ConnectedTool` de l'API). */
export type ToolStatus = 'connected' | 'available' | 'action_required' | 'coming_soon'

/** Une fiche du catalogue vue par l'opérateur. */
export type AdminCatalogTool = {
  provider: string
  family: string
  displayName: string
  owner: string
  sourceKind: ToolSourceKind
  sourceRef: string | null
  /** Ce serveur peut-il proposer l'outil ? `false` ⇒ invisible côté client. */
  configured: boolean
  reads: string[]
  writes: string[]
  allowedActions: string[]
  costModel: LocalizedText
  memoryPolicy: LocalizedText
  rateLimits: LocalizedText | null
}

type AdminCatalogReport = {
  tools: AdminCatalogTool[]
  total: number
  configured: number
}

/** Un outil tel que résolu pour un espace de travail réel. */
export type WorkspaceTool = {
  provider: string
  family: string
  display_name: string
  owner: string
  status: ToolStatus
  scopes: string[]
  last_sync: string | null
  data_types: { reads: string[]; writes: string[] }
  allowed_actions: string[]
}

type AdminWorkspaceRegistry = {
  workspaceId: string
  memberCount: number
  tools: WorkspaceTool[]
  connected: number
  actionRequired: number
}

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${REAL_BASE}/internal/admin/tool-registry${path}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Admin endpoint ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export async function fetchToolCatalog(): Promise<AdminCatalogReport> {
  return adminGet<AdminCatalogReport>('')
}

export async function fetchWorkspaceRegistry(workspaceId: string): Promise<AdminWorkspaceRegistry> {
  return adminGet<AdminWorkspaceRegistry>(`/workspaces/${encodeURIComponent(workspaceId)}`)
}

/** Libellé français d'un état, pour l'affichage. */
export const STATUS_LABEL: Record<ToolStatus, string> = {
  connected: 'Connecté',
  available: 'Disponible',
  action_required: 'Action requise',
  coming_soon: 'Non configuré',
}

/** Classe de pastille réutilisée depuis globals.css (pas de CSS nouveau). */
export const STATUS_BADGE: Record<ToolStatus, string> = {
  connected: 'completed',
  available: 'analyzing',
  action_required: 'error',
  coming_soon: '',
}

/** Libellé français d'un silo. */
export const SOURCE_LABEL: Record<ToolSourceKind, string> = {
  webhook: 'Webhook',
  crm: 'CRM (OAuth)',
  oauth: 'OAuth dédié',
  mcp: 'MCP',
  server: 'Clé API',
  'ia-server': 'Clé IA',
  catalog: 'Modélisé',
  'workspace-secret': 'Identifiants client',
}

/**
 * Le journal de livraison des webhooks, transverse aux clients.
 *
 * Il vivait sur l'écran utilisateur ; un code HTTP et un numéro de tentative
 * sont du diagnostic, pas une information dont un commercial peut faire quelque
 * chose. Il est ici depuis le 14/08, avec la trace technique complète.
 */
export type AdminDeliveryRow = {
  id: string
  provider: string
  userId: string
  event: string
  status: 'pending' | 'success' | 'failed'
  httpStatus: number | null
  attempt: number
  error: string | null
  createdAt: string
}

export async function fetchDeliveries(workspaceId?: string): Promise<{ rows: AdminDeliveryRow[]; truncated: boolean }> {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
  const res = await fetch(`${REAL_BASE}/internal/admin/integrations/deliveries${qs}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Admin deliveries endpoint returned ${res.status} ${res.statusText}`)
  return (await res.json()) as { rows: AdminDeliveryRow[]; truncated: boolean }
}

/**
 * SCOPES-I.4 — les connexions OAuth dont le jeton porte MOINS de portées que l'app n'en demande, par
 * connecteur. Lecture seule. `appSide` : l'écart est né d'un consentement neuf — l'app publiée ne
 * propose pas la portée, et aucune reconnexion ne la répare (c'est à nous d'agir).
 */
type AdminScopeGapRow = {
  provider: string
  label: string
  workspaces: number
  users: number
  appSide: number
  missingScopes: Array<{ scope: string; workspaces: number }>
}

export async function fetchScopeGaps(): Promise<{ connectors: AdminScopeGapRow[] }> {
  const res = await fetch(`${REAL_BASE}/internal/admin/scope-gaps`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Admin scope-gaps endpoint returned ${res.status} ${res.statusText}`)
  return (await res.json()) as { connectors: AdminScopeGapRow[] }
}

/** Pastille d'une livraison. `pending` n'est ni un succès ni un échec : une file
 *  qui attend et un envoi refusé demandent deux gestes différents. */
export const DELIVERY_BADGE: Record<AdminDeliveryRow['status'], string> = {
  success: 'completed',
  failed: 'error',
  pending: 'analyzing',
}

export const DELIVERY_LABEL: Record<AdminDeliveryRow['status'], string> = {
  success: 'Remis',
  failed: 'Échec',
  pending: 'En file',
}

/** Date + heure : sur un journal d'incident, le jour seul ne sert à rien. */
export function formatDateTime(iso: string | null): string {
  return formaterInstant(iso, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Date courte, ou tiret quand l'API n'a rien à dire (jamais de date inventée). */
export function formatDate(iso: string | null): string {
  return formaterInstant(iso, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Liste courte, ou tiret. Défensif : l'API normalise déjà ces tableaux, mais un
 *  champ absent doit dégrader, pas casser la page. */
export function joinOrDash(values: string[] | undefined | null): string {
  const list = values ?? []
  return list.length > 0 ? list.join(', ') : '—'
}
