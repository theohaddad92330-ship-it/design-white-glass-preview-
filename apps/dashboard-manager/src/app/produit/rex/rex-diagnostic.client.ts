// #3544.4 — client de la lecture interne des REX (GET /internal/rex-entries,
// InternalSecretGuard). Server-side only : le secret interne ne traverse jamais
// le navigateur. Miroir de `InternalRexRow`
// (apps/api/src/modules/capitalisation/internal-rex.controller.ts).

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

export type LigneRex = {
  id: string
  workspaceId: string
  missionId: string
  missionLabel: string | null
  collectedAt: string
  collectedBy: { userId: string; firstName: string | null; lastName: string | null; email: string | null } | null
  identicalTextCount: number
}

export async function fetchRexEntries(workspaceId?: string): Promise<LigneRex[]> {
  const url = new URL('/internal/rex-entries', REAL_BASE)
  if (workspaceId) url.searchParams.set('workspaceId', workspaceId)
  const res = await fetch(url, { headers: { 'x-internal-secret': REAL_SECRET }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`rex-entries endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as LigneRex[]
}
