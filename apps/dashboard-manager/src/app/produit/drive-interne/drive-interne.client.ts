// #3586 — client de la lecture interne du Drive interne (GET /internal/internal-knowledge,
// InternalSecretGuard). Server-side only : le secret interne ne traverse jamais le navigateur.
// Miroir de `InternalKnowledgeOverview` (apps/api/src/modules/internal-knowledge/internal-knowledge.controller.ts).
import type { FichierDrive, StatutFichier } from './drive-interne.logic'

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

export type VueDriveInterne = {
  configured: boolean
  lastRunAt: string | null
  lastStatus: 'ok' | 'error' | null
  lastError: string | null
  lastReconciledAt: string | null
  counts: Record<StatutFichier, number> | null
  digest: { generatedAt: string; sizeChars: number; approxTokens: number } | null
  files: FichierDrive[]
}

export async function fetchDriveInterne(): Promise<VueDriveInterne> {
  const res = await fetch(new URL('/internal/internal-knowledge', REAL_BASE), {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`internal-knowledge endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as VueDriveInterne
}
