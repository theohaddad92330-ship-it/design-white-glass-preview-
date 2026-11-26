import { RECENT_HIRE_WINDOW_DAYS } from '@bellum/contracts'
import { RECENT_HIRES_CONTACT_LIMIT, loadAccountRecentHires, recentHireContactsReader } from './recent-hires'

const NOW = Date.parse('2026-10-09T12:00:00Z')

const ROW = {
  id: 'c1',
  full_name: 'Claire Martin',
  title: 'DSI',
  email: 'claire.martin@acme.fr',
  phone: null,
  linkedin_url: null,
  apollo_enrichment: {
    employment_history: [{ organization_name: 'ACME', title: 'DSI', start_date: '2026-08-01', current: true }],
  },
}

describe('loadAccountRecentHires (#3970)', () => {
  it('lit les contacts VISIBLES du compte, dans l’espace, et rend les recrutements avec leur raison', async () => {
    const read = jest.fn().mockResolvedValue([ROW])
    const result = await loadAccountRecentHires(read, {
      workspaceId: 'w1',
      accountId: 'a1',
      companyName: 'ACME',
      profile: { personas: ["DSI / Directeur des Systèmes d'Information"], placedRoles: [] },
      nowMs: NOW,
    })
    expect(read).toHaveBeenCalledWith('a1', 'w1')
    expect(result.windowDays).toBe(RECENT_HIRE_WINDOW_DAYS)
    expect(result.examinedContacts).toBe(1)
    expect(result.hires).toHaveLength(1)
    expect(result.hires[0]?.relevance.status).toBe('pertinent')
  })

  it('sait dire NON : aucun contact enrichi → 0 examiné, jamais un recrutement inventé', async () => {
    const read = jest.fn().mockResolvedValue([{ ...ROW, apollo_enrichment: null }])
    const result = await loadAccountRecentHires(read, {
      workspaceId: 'w1',
      accountId: 'a1',
      companyName: 'ACME',
      profile: { personas: [], placedRoles: [] },
      nowMs: NOW,
    })
    expect(result).toEqual({ windowDays: RECENT_HIRE_WINDOW_DAYS, examinedContacts: 0, hires: [] })
  })

  it('la lecture écarte les contacts masqués et supprimés, reste bornée à l’espace et à une limite', async () => {
    const find = jest.fn().mockResolvedValue([ROW])
    await recentHireContactsReader({ find } as never)('a1', 'w1')
    const options = find.mock.calls[0][1]
    expect(options.where).toMatchObject({ account_id: 'a1', workspace_id: 'w1', hidden: false })
    expect(options.where).toHaveProperty('deleted_at')
    expect(options.take).toBe(RECENT_HIRES_CONTACT_LIMIT)
  })
})
