import { RUNNING_MISSION_STATUSES } from '@bellum/contracts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_CRM_COUNTER_MISSIONS } from './demo-crm-counters'
import { DEMO_CRM_RECETTE_COVERAGE } from './demo-coverage'
import { DEMO_CRM_MISSION_LIFECYCLE } from './demo-crm-mission-lifecycle'
import { seedDemoCrmRecette } from './demo-crm-recette'

/**
 * #4191 (recette 15/10, D1) — « Besoin d'origine : non mesuré — aucun besoin d'origine
 * n'est lié à cette mission » sur les fiches SNCF « recette applicative lot A » et
 * Société Générale « refonte du SI paiement phase 2 ».
 *
 * Cause : ces missions (semis #4193 et #4196) étaient insérées SANS `opportunity_id`, et la
 * fiche (`MissionDetailTabs`, `opportunityLabel` ← `opportunities.label`) n'invente aucun
 * lien. Le correctif vit dans le SEMIS, jamais dans le code produit.
 *
 * Le manager ci-dessous est une mini-base en mémoire : le test lit l'ÉTAT FINAL des missions,
 * pas une liste de requêtes.
 */
type MissionRow = {
  id: string
  account_id: string
  label: string
  status: string
  role_title: string | null
  daily_rate: number | null
  started_on: string
  opportunity_id: string | null
  need_id: string | null
}

function fakeDb(missions: MissionRow[]) {
  const opportunities: { id: string; label: string; account_id: string; params: unknown[] }[] = []
  const needs: { id: string; project_id: string; title: string }[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM missions')) {
      const statuses = params[1] as string[]
      return missions.filter(m => statuses.includes(m.status) && m.opportunity_id === null)
    }
    if (sql.includes('INSERT INTO opportunities')) {
      const row = {
        id: `opp${opportunities.length + 1}`,
        account_id: String(params[1]),
        label: String(params[2]),
        params,
      }
      opportunities.push(row)
      return [{ id: row.id }]
    }
    if (sql.includes('INSERT INTO project_needs')) {
      const row = { id: `need${needs.length + 1}`, project_id: String(params[1]), title: String(params[3]) }
      needs.push(row)
      return [{ id: row.id }]
    }
    if (sql.includes('UPDATE missions')) {
      const mission = missions.find(m => m.id === params[0])
      if (mission && mission.opportunity_id === null) {
        mission.opportunity_id = String(params[2])
        mission.need_id = String(params[3])
      }
      return []
    }
    return []
  })
  return { manager: { query } as never, query, opportunities, needs }
}

const base = (over: Partial<MissionRow>): MissionRow => ({
  id: 'm',
  account_id: 'acc',
  label: 'Mission',
  status: 'active',
  role_title: 'Rôle',
  daily_rate: 600,
  started_on: '2026-05-01',
  opportunity_id: null,
  need_id: null,
  ...over,
})

function demoMissions(): MissionRow[] {
  return [
    ...DEMO_CRM_COUNTER_MISSIONS.map((m, i) => base({ id: `c${i}`, label: m.label, role_title: m.role_title })),
    base({ id: 'lc1', label: DEMO_CRM_MISSION_LIFECYCLE.running.label }),
    base({ id: 'lc2', label: DEMO_CRM_MISSION_LIFECYCLE.finished.label, status: 'terminated' }),
    base({ id: 'linked', label: 'Déjà liée', opportunity_id: 'opp-existante', need_id: 'need-existant' }),
  ]
}

describe('seedDemoCrmRecette — chaque mission démo active a son affaire et son besoin d’origine', () => {
  it('aucune mission en cours ne reste sans origine (SNCF lot A et SG phase 2 comprises)', async () => {
    const missions = demoMissions()
    const { manager } = fakeDb(missions)
    await seedDemoCrmRecette(manager, 'ws', 'owner')

    const running = missions.filter(m => (RUNNING_MISSION_STATUSES as readonly string[]).includes(m.status))
    expect(running.map(m => m.label)).toEqual(
      expect.arrayContaining(['SNCF — recette applicative lot A', DEMO_CRM_MISSION_LIFECYCLE.running.label]),
    )
    for (const mission of running) {
      expect({
        label: mission.label,
        opportunity: mission.opportunity_id !== null,
        need: mission.need_id !== null,
      }).toEqual({
        label: mission.label,
        opportunity: true,
        need: true,
      })
    }
  })

  it('SAIT DIRE NON : sans le semis, la garde voit des missions sans origine', () => {
    const running = demoMissions().filter(m => (RUNNING_MISSION_STATUSES as readonly string[]).includes(m.status))
    expect(running.filter(m => m.opportunity_id === null).length).toBeGreaterThan(0)
  })

  it('une affaire PAR mission (index unique missions_opportunity_nosub_uniq), au libellé de la mission', async () => {
    const missions = demoMissions()
    const { manager, opportunities } = fakeDb(missions)
    await seedDemoCrmRecette(manager, 'ws', 'owner')
    const linked = missions.filter(m => m.id !== 'linked' && m.opportunity_id !== null)
    expect(new Set(linked.map(m => m.opportunity_id)).size).toBe(linked.length)
    expect(opportunities.map(o => o.label).sort()).toEqual(linked.map(m => m.label).sort())
  })

  it('n’écrase pas un lien existant, ne touche pas une mission terminée, et se rejoue sans doublon', async () => {
    const missions = demoMissions()
    const { manager, opportunities } = fakeDb(missions)
    await seedDemoCrmRecette(manager, 'ws', 'owner')
    const afterFirst = opportunities.length
    expect(missions.find(m => m.id === 'linked')?.opportunity_id).toBe('opp-existante')
    expect(missions.find(m => m.id === 'lc2')?.opportunity_id).toBeNull()
    await seedDemoCrmRecette(manager, 'ws', 'owner')
    expect(opportunities).toHaveLength(afterFirst)
  })

  it('respecte les contraintes SQL : affaire gagnée (stage/outcome/closed_at), besoin « staffed », statuts lus dans le contrat', async () => {
    const missions = demoMissions()
    const { manager, query } = fakeDb(missions)
    await seedDemoCrmRecette(manager, 'ws', 'owner')
    const calls = query.mock.calls as unknown as [string, unknown[]][]
    const opportunity = calls.find(([sql]) => sql.includes('INSERT INTO opportunities'))
    // opportunities_stage_check / opportunities_outcome_check (ProjectPivot) : 'won' / 'won'.
    expect(opportunity?.[0]).toContain("'besoin'")
    expect(opportunity?.[0]).toMatch(/'won'.*'won'/s)
    expect(opportunity?.[0]).toContain('closed_at')
    // project_needs_status_check (NeedInterviewNegotiationStatuses) contient 'staffed'.
    const need = calls.find(([sql]) => sql.includes('INSERT INTO project_needs'))
    expect(need?.[0]).toContain("'staffed'")
    const select = calls.find(([sql]) => sql.includes('FROM missions'))
    expect(select?.[1][1]).toEqual([...RUNNING_MISSION_STATUSES])
  })

  it('n’invente rien : sans mission à relier, aucune écriture', async () => {
    const { manager, query } = fakeDb([base({ opportunity_id: 'x', need_id: 'y' }), base({ status: 'terminated' })])
    await seedDemoCrmRecette(manager, 'ws', 'owner')
    expect((query.mock.calls as unknown as [string][]).some(([sql]) => /INSERT|UPDATE/.test(sql))).toBe(false)
  })

  it('est appelé APRÈS le dernier seedDemoCrm* dans le semis (sinon il ne voit pas leurs missions)', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const calls = [...seed.matchAll(/await seedDemoCrm(\w+)\(/g)].map(m => ({ name: m[1], at: m.index ?? 0 }))
    const recette = calls.find(c => c.name === 'Recette')
    expect(recette).toBeDefined()
    expect(Math.max(...calls.filter(c => c.name !== 'Recette').map(c => c.at))).toBeLessThan(recette?.at ?? 0)
  })

  it('la couverture déclare ce semis comme « seedé », avec sa raison', () => {
    expect(DEMO_CRM_RECETTE_COVERAGE.state).toBe('seede')
    expect(DEMO_CRM_RECETTE_COVERAGE.reason).toContain('Besoin d’origine')
  })
})

// V4-CORRECTIFS-B (b) — « 01/11/2026 · AFFAIRE GAGNÉE » dans le brief du RDV SNCF : l'affaire gagnée
// reprenait le DÉMARRAGE de la mission, qui peut être à venir. Une affaire gagnée est signée AVANT
// qu'on la date : jamais après aujourd'hui.
describe('seedDemoCrmRecette — V4-CORRECTIFS-B (b) une affaire gagnée n’est jamais datée dans le futur', () => {
  const NOW = Date.parse('2026-10-20T10:00:00Z')

  it('une mission qui démarre dans 12 jours donne une affaire signée AVANT maintenant', async () => {
    const { manager, opportunities } = fakeDb([base({ started_on: '2026-11-01' })])
    await seedDemoCrmRecette(manager, 'ws', 'owner', NOW)
    const signedAt = Date.parse(String(opportunities[0]?.params[4]))
    expect(signedAt).toBeLessThanOrEqual(NOW)
  })

  it('une mission déjà démarrée garde sa date de démarrage (le passé n’est pas touché)', async () => {
    const { manager, opportunities } = fakeDb([base({ started_on: '2026-05-01' })])
    await seedDemoCrmRecette(manager, 'ws', 'owner', NOW)
    expect(opportunities[0]?.params[4]).toBe('2026-05-01T00:00:00Z')
  })
})
