import { MISSION_START_ANNOUNCE_WINDOW_DAYS } from '@bellum/contracts'
import { missionsStartingSoonNotReady } from './mission-start-window'

/**
 * #2409.8 — ce que Laura annonce d'elle-même avant un démarrage. Le jugement
 * reste celui de `computeMissionStartReadiness` (via `loadMissionStartReadiness`) :
 * ce lecteur ne fait que choisir les missions proches du démarrage.
 */
const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-23T10:00:00Z')

function makeManager(
  candidates: { id: string; label: string; started_on: string }[],
  checksById: Record<string, string[]>,
) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('ORDER BY m.started_on')) return candidates
      if (sql.includes('AS consultant_assigned')) {
        const c = candidates.find(row => row.id === params[0])
        return [{ started_on: c?.started_on ?? null, daily_rate: '600', consultant_assigned: true }]
      }
      if (sql.includes('FROM mission_start_checks')) {
        return (checksById[params[0] as string] ?? []).map(item_key => ({
          item_key,
          proof: 'mail du 20/09',
          confirmed_by: 'u1',
          confirmed_at: '2026-09-20T10:00:00Z',
        }))
      }
      return []
    }),
  }
  return { manager, queries }
}

const ALL = ['client_agreement', 'consultant_agreement', 'contract_signed', 'site_access']

describe('missionsStartingSoonNotReady — #2409.8', () => {
  it('ne rend QUE les missions dont la checklist n’est pas complète, avec leurs manques NOMMÉS', async () => {
    const { manager } = makeManager(
      [
        { id: 'm-ready', label: 'Prête', started_on: '2026-09-28' },
        { id: 'm-blocked', label: 'Bloquée', started_on: '2026-09-30' },
      ],
      { 'm-ready': ALL, 'm-blocked': ['client_agreement', 'contract_signed'] },
    )
    const out = await missionsStartingSoonNotReady(manager as never, WORKSPACE, NOW)
    expect(out.map(m => m.missionId)).toEqual(['m-blocked'])
    expect(out[0]?.label).toBe('Bloquée')
    expect(out[0]?.readiness.missing).toEqual(['consultant_agreement'])
    expect(out[0]?.readiness.reserves).toEqual(['site_access'])
  })

  it('borne la lecture à l’espace, aux statuts AVANT démarrage et à la fenêtre de quatorze jours', async () => {
    const { manager, queries } = makeManager([], {})
    const out = await missionsStartingSoonNotReady(manager as never, WORKSPACE, NOW)
    expect(out).toEqual([])
    const select = queries.find(q => q.sql.includes('ORDER BY m.started_on'))
    expect(select?.sql).toContain('m.workspace_id = $1')
    expect(select?.sql).toContain('m.started_on IS NOT NULL')
    expect(select?.params).toEqual([
      WORKSPACE,
      ['draft', 'onboarding', 'ready_to_start'],
      MISSION_START_ANNOUNCE_WINDOW_DAYS,
    ])
  })
})
