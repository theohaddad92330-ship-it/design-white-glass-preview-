import { AccountAccessService } from './account-access.service'

/**
 * #2130.102 — la contradiction Partenaires / Accès, servie par `landscape()`.
 * Matrice minimale (Louis, 02/10/2026) : la même entité « concurrent » côté
 * Partenaires ET verrouillée (fait frais) côté Accès — et rien d'autre.
 */
const ENTITY = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-02T00:00:00.000Z')

function buildService(args: { competitors: Record<string, unknown>[]; lockValue: string; observedAt: string | null }) {
  const factRow = {
    id: 'fact-1',
    workspace_id: 'ws-1',
    account_id: 'acc-1',
    entity_id: ENTITY,
    kind: 'lock',
    value: args.lockValue,
    detail: null,
    source: 'déclaré',
    provenance: 'human',
    observed_at: args.observedAt,
    created_at: new Date('2026-10-01T00:00:00.000Z'),
  }
  const facts = {
    find: jest.fn().mockResolvedValue([factRow]),
    query: jest
      .fn()
      .mockImplementation((sql: string) =>
        Promise.resolve(sql.includes("relationship = 'competitor'") ? args.competitors : []),
      ),
  }
  const accounts = {
    findOne: jest.fn().mockResolvedValue({ id: 'acc-1', siren: null, priority_gate: 'pending', raw_analysis: null }),
  }
  const entities = { find: jest.fn().mockResolvedValue([]) }
  return new AccountAccessService(facts as never, accounts as never, entities as never)
}

const COMPETITOR = { id: 'p-1', name: 'Atos', entity_id: ENTITY, relationship: 'competitor' }

describe('#2130.102 — contradictions Partenaires / Accès', () => {
  it('nomme la contradiction quand la même entité est concurrent ET verrouillée', async () => {
    const landscape = await buildService({
      competitors: [COMPETITOR],
      lockValue: 'verrouille',
      observedAt: '2026-09-15',
    }).landscape('ws-1', 'acc-1', NOW)
    expect(landscape.contradictions).toEqual([
      { entity_id: ENTITY, partner_id: 'p-1', partner_name: 'Atos', fact_id: 'fact-1' },
    ])
  })

  it('ne dit rien quand le verrou est ouvert, périmé, ou qu’aucun concurrent n’est rattaché', async () => {
    const open = await buildService({ competitors: [COMPETITOR], lockValue: 'ouvert', observedAt: '2026-09-15' })
    expect((await open.landscape('ws-1', 'acc-1', NOW)).contradictions).toEqual([])
    const stale = await buildService({ competitors: [COMPETITOR], lockValue: 'verrouille', observedAt: '2020-01-01' })
    expect((await stale.landscape('ws-1', 'acc-1', NOW)).contradictions).toEqual([])
    const none = await buildService({ competitors: [], lockValue: 'verrouille', observedAt: '2026-09-15' })
    expect((await none.landscape('ws-1', 'acc-1', NOW)).contradictions).toEqual([])
  })
})
