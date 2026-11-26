import { AccountAccessService } from './account-access.service'

const base = {
  id: 'acc-1',
  siren: '552120222',
  group_head_siren: null,
  priority_gate: 'pending',
  signals_collected_at: null,
  employees: null,
}

function build(raw: Record<string, unknown>, statusRows: Record<string, unknown>[] = []) {
  const facts = { find: jest.fn().mockResolvedValue([]), query: jest.fn().mockResolvedValue([]) }
  const accounts = {
    findOne: jest.fn().mockResolvedValue({ ...base, raw_analysis: raw }),
    find: jest.fn().mockResolvedValue([]),
    manager: { query: jest.fn().mockResolvedValue(statusRows) },
  }
  const entities = { find: jest.fn().mockResolvedValue([]) }
  return new AccountAccessService(facts as never, accounts as never, entities as never)
}

describe('AccountAccessService.landscape — Accès au compte · Base commune (lot 776)', () => {
  it('porte les statuts de la fiche rattachée par SIREN, en énumérations métier', async () => {
    const service = build({}, [
      {
        source_id: 'DF-1',
        siren_siret: '552120222',
        group_name: null,
        cluster_id: null,
        sales_accessibility_level: 'MOYENNE',
        barriere_plateforme: false,
        barriere_publique: true,
        referencing_process_found: null,
        supplier_portal: null,
        priority_level: 'P2',
        updated_at: '2026-10-01T00:00:00.000Z',
      },
    ])
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.dataforgeAccess).toEqual({
      accessibility: 'medium',
      barriers: ['public_procurement'],
      route: 'tender',
      priority: 'medium',
      observedAt: '2026-10-01T00:00:00.000Z',
    })
    expect(JSON.stringify(landscape)).not.toMatch(/DF-1|MOYENNE|P2/)
  })

  it('sans fiche : pas de bloc (null), jamais un objet de zéros', async () => {
    const landscape = await build({}).landscape('ws-1', 'acc-1')
    expect(landscape.dataforgeAccess).toBeNull()
  })

  it('la démo sème le bloc dans raw_analysis.dataforge_access', async () => {
    const seeded = { accessibility: 'high', barriers: [], route: 'referencing', priority: 'high', observedAt: null }
    const landscape = await build({ dataforge_access: seeded }).landscape('ws-1', 'acc-1')
    expect(landscape.dataforgeAccess).toEqual(seeded)
  })
})
