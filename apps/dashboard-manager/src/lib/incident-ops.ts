// #2445.12 (épopée #2766, lot SRC5 28/09 soir) — l'impact, les actions et la
// communication d'un incident connecteur. Server-side client for
// `internal/admin/incidents/*` (InternalSecretGuard) — même patron que
// `admin.ts` : le secret ne quitte jamais ce module.

import { adminMutate } from './admin'

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

async function incidentsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${REAL_BASE}/internal/admin/incidents${path}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Incident endpoint ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

/** `{ ok: false }` = l'ancre n'existe pas (ou n'est pas un début d'incident) — jamais un compte inventé. */
export type IncidentImpact = { ok: true; workspacesTouched: number } | { ok: false }

export type IncidentLogEntry = {
  id: string
  kind: 'action' | 'communication'
  workspaceId: string | null
  note: string
  createdAt: string
}

export function fetchIncidentImpact(incidentId: string): Promise<IncidentImpact> {
  return incidentsGet<IncidentImpact>(`/${incidentId}/impact`)
}

export function fetchIncidentLogs(incidentId: string): Promise<IncidentLogEntry[]> {
  // #2445.12 — l'API expose ce journal sous `/logs` ; le proxy Next.js le
  // sert sous `/journal` (voir `route.ts` voisin) : un chemin nommé `logs`
  // est ignoré par le `.gitignore` racine du monorepo (`# Logs` → `logs`),
  // ce qui aurait fait disparaître ce fichier de tout commit en silence.
  return incidentsGet<IncidentLogEntry[]>(`/${incidentId}/logs`)
}

export function logIncidentAction(incidentId: string, note: string, actor: string) {
  return adminMutate('POST', `/incidents/${incidentId}/actions`, { note, actor })
}

export function logIncidentCommunication(incidentId: string, note: string, actor: string, workspaceId?: string) {
  return adminMutate('POST', `/incidents/${incidentId}/communications`, { note, actor, workspaceId })
}
