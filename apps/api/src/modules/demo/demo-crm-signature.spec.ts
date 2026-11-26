import { DEMO_CRM_SIGNATURE, seedDemoCrmSignature } from './demo-crm-signature'
import { DEMO_CRM_WRITE_REQUESTS } from './demo-crm-write-requests'

// #4195 (lot L4) — la salle a une affaire SNCF prête à signer : deux retenus sur deux besoins.
describe('DEMO_CRM_SIGNATURE — SNCF en négociation, deux positionnements retenus', () => {
  const { account, needs, submissions } = DEMO_CRM_SIGNATURE

  it('deux retenus, sur deux besoins distincts, par deux talents distincts', () => {
    expect(account).toBe('SNCF')
    expect(submissions.filter(s => s.stage === 'accepted')).toHaveLength(2)
    expect(new Set(submissions.map(s => s.need)).size).toBe(2)
    expect(new Set(submissions.map(s => s.consultant)).size).toBe(2)
  })

  it('chaque retenu porte un TJM ; un besoin sans durée donnera une mission sans fin (jamais inventée)', () => {
    for (const s of submissions) expect(s.proposed_rate_cents).toBeGreaterThan(0)
    expect(needs.some(n => n.duration_months === null)).toBe(true)
    expect(needs.some(n => n.duration_months !== null)).toBe(true)
  })
})

// #4195.5 — la carte SNCF de /actions cite l'affaire « Renfort régie » : /projects doit la montrer, en Négociation.
describe('#4195.5 — l’affaire citée par la carte /actions existe dans /projects', () => {
  const cited = DEMO_CRM_WRITE_REQUESTS.find(
    request => request.kind === 'update_deal_stage' && request.payload['company'] === 'SNCF',
  )

  it('l’affaire semée porte le NOM exact que la carte cite', () => {
    expect(cited?.payload['dealName']).toBeTruthy()
    expect(DEMO_CRM_SIGNATURE.project.label).toBe(cited?.payload['dealName'])
    expect(DEMO_CRM_SIGNATURE.project.label).toMatch(/^Renfort régie/)
  })

  it('est insérée au stade « negotiation », avec ses deux positionnements retenus', async () => {
    const inserts: { sql: string; params: unknown[] }[] = []
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM accounts')) return [{ id: 'acc' }]
      if (sql.includes('SELECT id FROM opportunities')) return []
      if (sql.includes('INSERT INTO opportunities')) {
        inserts.push({ sql, params })
        return [{ id: 'proj' }]
      }
      if (sql.includes('FROM project_needs')) return []
      if (sql.includes('INSERT INTO project_needs')) return [{ id: `need-${Math.random()}` }]
      if (sql.includes('FROM consultants')) return [{ id: 'cons' }]
      inserts.push({ sql, params })
      return []
    })
    await seedDemoCrmSignature({ query } as never, 'ws', 'owner')
    const deal = inserts.find(call => call.sql.includes('INSERT INTO opportunities'))
    expect(deal?.sql).toContain("'negotiation'")
    expect(deal?.params).toContain(cited?.payload['dealName'])
    const retained = inserts.filter(call => call.sql.includes('INSERT INTO submissions'))
    expect(retained).toHaveLength(2)
    expect(retained.every(call => call.params.includes('accepted'))).toBe(true)
  })
})

// V4-CORRECTIFS-B (b) — « 03/11/2026 » en dur devenait faux au premier changement de mois : les débuts
// des besoins sont des OFFSETS depuis la visite, jamais des dates.
describe('seedDemoCrmSignature — V4-CORRECTIFS-B (b) débuts relatifs à la date du semis', () => {
  async function startsAt(now: number): Promise<unknown[]> {
    const starts: unknown[] = []
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM accounts')) return [{ id: 'acc' }]
      if (sql.includes('FROM opportunities')) return [{ id: 'proj' }]
      if (sql.includes('FROM project_needs')) return []
      if (sql.includes('INSERT INTO project_needs')) {
        starts.push(params[5])
        return [{ id: `need${starts.length}` }]
      }
      return []
    })
    await seedDemoCrmSignature({ query } as never, 'ws', 'owner', now)
    return starts
  }

  it('deux semis à deux dates donnent deux débuts décalés de la même durée', async () => {
    const october = await startsAt(Date.parse('2026-10-20T10:00:00Z'))
    const march = await startsAt(Date.parse('2027-03-05T10:00:00Z'))
    expect(october).toHaveLength(2)
    expect(october[0]).toBe('2026-11-03')
    expect(march[0]).toBe('2027-03-19')
  })
})
