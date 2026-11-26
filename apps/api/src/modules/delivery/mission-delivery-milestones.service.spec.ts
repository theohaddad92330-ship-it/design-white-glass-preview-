import { NotFoundException } from '@nestjs/common'
import { MissionDeliveryMilestonesService } from './mission-delivery-milestones.service'
import { MissionDriftService } from './mission-drift.service'
import { TimesheetsService } from './timesheets.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'

type Routes = Record<string, unknown[]>
function makeManager(routes: Routes) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      for (const [needle, rows] of Object.entries(routes)) if (sql.includes(needle)) return rows
      return []
    }),
  }
  return { manager, queries }
}

const MISSION_ROW_ROUTE = 'renewal_client_rail, renewal_consultant_rail'
// #3291 — la route dédiée à `TimesheetsService.month()` (cra), déclarée AVANT
// tout override caller, pour ne jamais être confondue avec la requête (plus
// large) de `MissionDriftService` : les deux sélectionnent `FROM missions m`.
const CRA_ROUTE = 'LEFT JOIN mission_assignments asg'

function service(routes: Routes) {
  const { manager, queries } = makeManager({
    [MISSION_ROW_ROUTE]: [
      {
        status: 'active',
        account_id: 'a0000000-0000-4000-8000-000000000001',
        renewal_client_rail: null,
        renewal_consultant_rail: null,
      },
    ],
    [CRA_ROUTE]: [],
    ...routes,
  })
  const drift = new MissionDriftService({ manager } as never)
  const timesheets = new TimesheetsService({ manager } as never)
  return { svc: new MissionDeliveryMilestonesService({ manager } as never, drift, timesheets), queries }
}

describe('MissionDeliveryMilestonesService — #3269 (BEL-SC-240)', () => {
  it('mission hors espace → 404', async () => {
    const { svc } = service({ [MISSION_ROW_ROUTE]: [] })
    await expect(svc.list(WORKSPACE, MISSION)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rend les 17 jalons, même sans aucune donnée déclarée ou projetée', async () => {
    const { svc } = service({})
    const result = await svc.list(WORKSPACE, MISSION)
    expect(result).toHaveLength(17)
    expect(result.find(r => r.key === 'brief_consultant')?.state).toBe('not_started')
    expect(result.find(r => r.key === 'cra')?.state).toBe('not_evaluable')
    expect(result.find(r => r.key === 'expansion')?.state).toBe('not_evaluable')
    // Aucun relevé lisible pour le détecteur de dérive → not_evaluable, jamais deviné.
    expect(result.find(r => r.key === 'risque')?.state).toBe('not_evaluable')
    // Aucun rail de renouvellement ouvert → not_started.
    expect(result.find(r => r.key === 'renouvellement')?.state).toBe('not_started')
  })

  describe('expansion — autres entités du client (#3413, « autre BU »)', () => {
    const EXPANSION_ROUTE = 'FROM account_entities'
    const expansion = async (rows: unknown[]) => {
      const { svc } = service({ [EXPANSION_ROUTE]: rows })
      const result = await svc.list(WORKSPACE, MISSION)
      return result.find(r => r.key === 'expansion')
    }

    it('aucune entité connue chez le client → non évaluable, jamais inventé', async () => {
      const signal = await expansion([])
      expect(signal?.state).toBe('not_evaluable')
      expect(signal?.note).toBeNull()
    })

    it('l’entité qui héberge la mission est exclue : seules les AUTRES sont nommées', async () => {
      const signal = await expansion([
        { name: 'Direction des systèmes d’information', hosts_mission: true, host_known: true },
        { name: 'NOVA Supply Chain', hosts_mission: false, host_known: true },
      ])
      expect(signal?.state).toBe('lead_known')
      expect(signal?.note).toBe('Autres entités du client : NOVA Supply Chain')
    })

    it('seule l’entité d’hébergement est connue → rien à proposer', async () => {
      const signal = await expansion([{ name: 'DSI', hosts_mission: true, host_known: true }])
      expect(signal?.state).toBe('not_evaluable')
    })

    it('hébergeur inconnu → « entités connues », jamais « autres » (on ne devine pas laquelle héberge)', async () => {
      const signal = await expansion([
        { name: 'DSI', hosts_mission: false, host_known: false },
        { name: 'Supply Chain', hosts_mission: false, host_known: false },
      ])
      expect(signal?.state).toBe('lead_known')
      expect(signal?.note).toBe('Entités connues du client : DSI, Supply Chain')
    })

    it('plus de trois entités → trois nommées et le reste compté', async () => {
      const rows = ['A', 'B', 'C', 'D', 'E'].map(name => ({ name, hosts_mission: false, host_known: true }))
      const signal = await expansion(rows)
      expect(signal?.note).toBe('Autres entités du client : A, B, C (+2)')
    })
  })

  describe('risque — PROJETTE MissionDriftService (#3291)', () => {
    it('trois mois sains → risque "done"', async () => {
      const row = (period: string) => ({
        mission_id: MISSION,
        mission_label: 'Data Engineer',
        account_name: 'Orange',
        ends_on: '2026-12-31',
        period_month: `${period}-01`,
        days: '20',
        expected_days: '20',
        status: 'validated',
        validated_by_client_at: null,
      })
      const { svc } = service({
        'FROM missions m': [row('2026-05'), row('2026-06'), row('2026-07')],
      })
      const result = await svc.list(WORKSPACE, MISSION)
      expect(result.find(r => r.key === 'risque')?.state).toBe('done')
    })

    it('dérive détectée (écart négatif qui dure + jours contestés) → risque "in_progress"', async () => {
      const row = (period: string, over: Record<string, unknown> = {}) => ({
        mission_id: MISSION,
        mission_label: 'Data Engineer',
        account_name: 'Orange',
        ends_on: '2026-12-31',
        period_month: `${period}-01`,
        days: '18',
        expected_days: '20',
        status: 'validated',
        validated_by_client_at: null,
        ...over,
      })
      const { svc } = service({
        'FROM missions m': [
          row('2026-05', { days: '18' }),
          row('2026-06', { days: '16' }),
          row('2026-07', { days: '14', status: 'disputed' }),
        ],
      })
      const result = await svc.list(WORKSPACE, MISSION)
      expect(result.find(r => r.key === 'risque')?.state).toBe('in_progress')
    })
  })

  describe('cra — PROJETTE TimesheetsService.month() (#3291)', () => {
    const NOW = new Date('2026-10-05T00:00:00Z')
    const craRow = (over: Record<string, unknown> = {}) => ({
      mission_id: MISSION,
      mission_label: 'Data Engineer',
      account_name: 'Orange',
      contract_kind: 'regie',
      started_on: '2026-01-01',
      ends_on: '2026-12-31',
      consultant_id: 'c0000000-0000-4000-8000-000000000001',
      consultant_name: 'Alice',
      ts_id: null,
      ts_days: null,
      ts_status: null,
      ts_expected: '20',
      ...over,
    })

    it('aucun relevé attendu (contrat ≠ régie) → not_evaluable', async () => {
      const { svc } = service({ [CRA_ROUTE]: [craRow({ contract_kind: 'forfait' })] })
      const result = await svc.list(WORKSPACE, MISSION, NOW)
      expect(result.find(r => r.key === 'cra')?.state).toBe('not_evaluable')
    })

    it('relevé du mois précédent manquant (contrat régie) → in_progress, raison nommée', async () => {
      const { svc } = service({ [CRA_ROUTE]: [craRow()] })
      const result = await svc.list(WORKSPACE, MISSION, NOW)
      const cra = result.find(r => r.key === 'cra')
      expect(cra?.state).toBe('in_progress')
      expect(cra?.note).toMatch(/manquant/)
    })

    it('relevé validé, jours conformes → done', async () => {
      const { svc } = service({
        [CRA_ROUTE]: [craRow({ ts_id: 't1', ts_days: '20', ts_status: 'validated' })],
      })
      const result = await svc.list(WORKSPACE, MISSION, NOW)
      const cra = result.find(r => r.key === 'cra')
      expect(cra?.state).toBe('done')
    })
  })

  describe('renouvellement — PROJETTE canConfirmRenewal (#3291)', () => {
    it('les deux rails confirment "oui" → renouvellement "done"', async () => {
      const { svc } = service({
        [MISSION_ROW_ROUTE]: [
          {
            status: 'active',
            account_id: 'a0000000-0000-4000-8000-000000000001',
            renewal_client_rail: { intent: 'oui' },
            renewal_consultant_rail: { intent: 'oui' },
          },
        ],
      })
      const result = await svc.list(WORKSPACE, MISSION)
      expect(result.find(r => r.key === 'renouvellement')?.state).toBe('done')
    })

    it('un seul rail ouvert (le second jamais ouvert) → renouvellement "in_progress", jamais "done"', async () => {
      const { svc } = service({
        [MISSION_ROW_ROUTE]: [
          {
            status: 'active',
            account_id: 'a0000000-0000-4000-8000-000000000001',
            renewal_client_rail: { intent: 'oui' },
            renewal_consultant_rail: null,
          },
        ],
      })
      const result = await svc.list(WORKSPACE, MISSION)
      expect(result.find(r => r.key === 'renouvellement')?.state).toBe('in_progress')
    })
  })

  it('déclarer un jalon ARCHIVE le geste précédent (jamais DELETE) puis écrit auteur + note', async () => {
    const { svc, queries } = service({})
    await svc.declare(WORKSPACE, USER, MISSION, { key: 'brief_consultant', note: 'brief transmis le 28/09' })
    expect(queries.some(q => /DELETE/i.test(q.sql))).toBe(false)
    const archive = queries.findIndex(q => q.sql.includes('UPDATE mission_delivery_milestones SET archived_at'))
    const insert = queries.findIndex(q => q.sql.includes('INSERT INTO mission_delivery_milestones'))
    expect(archive).toBeGreaterThanOrEqual(0)
    expect(insert).toBeGreaterThan(archive)
    expect(queries[insert].params).toEqual([WORKSPACE, MISSION, 'brief_consultant', 'brief transmis le 28/09', USER])
  })

  it('un REX présent (proofs.source=rex) rend rex_interne ET rex_client "done" — un seul signal, jamais deux objets', async () => {
    const { svc } = service({ "AND source = 'rex'": [{ id: 'p1' }] })
    const result = await svc.list(WORKSPACE, MISSION)
    expect(result.find(r => r.key === 'rex_interne')?.state).toBe('done')
    expect(result.find(r => r.key === 'rex_client')?.state).toBe('done')
  })

  it('deux pouls de satisfaction posés (client + consultant) rendent "done"', async () => {
    const { svc } = service({ 'FROM mission_feedback': [{ rail: 'client' }, { rail: 'consultant' }] })
    const result = await svc.list(WORKSPACE, MISSION)
    expect(result.find(r => r.key === 'satisfaction')?.state).toBe('done')
  })

  describe('reverseMarketReadiness — NO-GO', () => {
    it('mission active → not_applicable', async () => {
      const { svc } = service({})
      const readiness = await svc.reverseMarketReadiness(WORKSPACE, MISSION)
      expect(readiness.state).toBe('not_applicable')
      expect(readiness.availabilityDeclared).toBe(false)
    })

    it('mission terminée sans remplacement → a_verifier, jamais de disponibilité déclarée', async () => {
      const { svc } = service({
        [MISSION_ROW_ROUTE]: [
          {
            status: 'ended',
            account_id: 'a0000000-0000-4000-8000-000000000001',
            renewal_client_rail: null,
            renewal_consultant_rail: null,
          },
        ],
      })
      const readiness = await svc.reverseMarketReadiness(WORKSPACE, MISSION)
      expect(readiness.state).toBe('a_verifier')
      expect(readiness.availabilityDeclared).toBe(false)
    })
  })
})
