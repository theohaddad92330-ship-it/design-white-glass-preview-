import { AtsCredentialsService } from './ats-credentials.service'
import { AtsService } from './ats.service'

const listRecords = jest.fn()
jest.mock('../zero-layer/boondmanager.client', () => ({
  BoondManagerClient: jest.fn().mockImplementation(() => ({ listRecords })),
}))

// #4065.9 — missions terminées et candidats vus en entretien, lus par `AtsService.snapshot`.
const row = {
  provider: 'boondmanager',
  auth_mode: 'user_token',
  created_at: new Date(),
  credentials_enc: 'x',
  base_url: null,
}
function service() {
  const connections = { findOne: jest.fn().mockResolvedValue(row) }
  const svc = new AtsService(
    connections as never,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    } as never,
    new AtsCredentialsService(connections as never),
  )
  jest.spyOn(svc as never as { resolveConfig: () => Promise<unknown> }, 'resolveConfig').mockResolvedValue({
    baseUrl: 'https://x',
    searchParam: 'k',
    userToken: 't',
  })
  return svc
}

describe('AtsService.snapshot — fenêtres passées (#4065.9)', () => {
  beforeEach(() => listRecords.mockReset())

  it('ne lit PAS la liste des candidats quand personne ne l’a demandée', async () => {
    listRecords.mockResolvedValue([])
    const out = await service().snapshot('u1')
    expect(listRecords).not.toHaveBeenCalledWith('/candidates')
    expect(out).not.toHaveProperty('interviewedCandidates')
  })

  it('rend les candidats DATÉS dans la fenêtre — et dit `candidatesRead: false` quand la liste n’a pas répondu', async () => {
    const recent = new Date(Date.now() - 10 * 86_400_000).toISOString()
    listRecords.mockImplementation(async (path: string) =>
      path === '/candidates'
        ? [
            { id: '1', fullName: 'Ana Lima', interviewDate: recent },
            { id: '2', fullName: 'Sans date' },
          ]
        : [],
    )
    const ok = await service().snapshot('u1', { interviewedSinceDays: 90 })
    expect(ok.interviewedCandidates?.map(c => c.id)).toEqual(['1'])
    expect(ok.candidatesRead).toBe(true)

    listRecords.mockImplementation(async (path: string) => {
      if (path === '/candidates') throw new Error('boom')
      return []
    })
    const down = await service().snapshot('u1', { interviewedSinceDays: 90 })
    expect(down.interviewedCandidates).toEqual([])
    expect(down.candidatesRead).toBe(false)
  })
})
