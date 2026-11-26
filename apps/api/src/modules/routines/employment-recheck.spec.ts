import {
  EMPLOYMENT_CHECK_EVERY_DAYS,
  employmentCheckIsDue,
  employmentRecheckJobId,
  EMPLOYMENT_RECHECK_QUEUE,
} from './employment-check'
import { EmploymentRecheckRequester } from '../contacts/employment-recheck.requester'

// #4286.13 — « on relit le contact quand on va dessus sur sa fiche au bout d'un mois ».
const NOW = new Date('2026-10-22T10:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe('employmentCheckIsDue (#4286.13)', () => {
  it('réutilise la constante UNIQUE de la routine : 30 jours', () => {
    expect(EMPLOYMENT_CHECK_EVERY_DAYS).toBe(30)
  })

  it('est dû sans relecture, ou plus vieille que 30 jours', () => {
    expect(employmentCheckIsDue({ apolloId: 'a1' }, NOW)).toBe(true)
    expect(employmentCheckIsDue({ apolloId: 'a1', employmentCheck: {} }, NOW)).toBe(true)
    expect(employmentCheckIsDue({ apolloId: 'a1', employmentCheck: { at: 'pas une date' } }, NOW)).toBe(true)
    expect(employmentCheckIsDue({ apolloId: 'a1', employmentCheck: { at: daysAgo(31) } }, NOW)).toBe(true)
  })

  it('n’est PAS dû à moins de 30 jours', () => {
    expect(employmentCheckIsDue({ apolloId: 'a1', employmentCheck: { at: daysAgo(29) } }, NOW)).toBe(false)
    expect(employmentCheckIsDue({ apolloId: 'a1', employmentCheck: { at: daysAgo(30) } }, NOW)).toBe(false)
  })

  it('sait dire NON : sans identifiant d’annuaire ou sans raw_data, rien à relire', () => {
    expect(employmentCheckIsDue(null, NOW)).toBe(false)
    expect(employmentCheckIsDue({}, NOW)).toBe(false)
    expect(employmentCheckIsDue({ apolloId: '  ' }, NOW)).toBe(false)
  })
})

describe('EmploymentRecheckRequester (#4286.13)', () => {
  function requesterWith() {
    const add = jest.fn().mockResolvedValue(undefined)
    return { requester: new EmploymentRecheckRequester({ add } as never), add }
  }

  it('ouverture à plus de 30 jours → une relecture enfilée, clé de job = le contact', async () => {
    const { requester, add } = requesterWith()
    const queued = await requester.requestIfDue(
      'ws-1',
      { id: 'c-1', raw_data: { apolloId: 'a1', employmentCheck: { at: daysAgo(45) } } },
      NOW,
    )
    expect(queued).toBe(true)
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(
      EMPLOYMENT_RECHECK_QUEUE,
      { workspaceId: 'ws-1', contactId: 'c-1' },
      expect.objectContaining({ jobId: employmentRecheckJobId('c-1') }),
    )
  })

  it('ouverture à moins de 30 jours → rien n’est enfilé', async () => {
    const { requester, add } = requesterWith()
    const queued = await requester.requestIfDue(
      'ws-1',
      { id: 'c-1', raw_data: { apolloId: 'a1', employmentCheck: { at: daysAgo(10) } } },
      NOW,
    )
    expect(queued).toBe(false)
    expect(add).not.toHaveBeenCalled()
  })

  it('deux ouvertures → la MÊME clé de job (la file n’en garde qu’un)', async () => {
    const { requester, add } = requesterWith()
    const contact = { id: 'c-1', raw_data: { apolloId: 'a1' } }
    await requester.requestIfDue('ws-1', contact, NOW)
    await requester.requestIfDue('ws-1', contact, NOW)
    const ids = add.mock.calls.map(call => (call[2] as { jobId: string }).jobId)
    expect(ids).toEqual([employmentRecheckJobId('c-1'), employmentRecheckJobId('c-1')])
    expect(employmentRecheckJobId('c-1')).not.toContain(':')
  })

  it('une file en panne ne fait jamais échouer l’ouverture de la fiche', async () => {
    const add = jest.fn().mockRejectedValue(new Error('redis down'))
    const requester = new EmploymentRecheckRequester({ add } as never)
    jest.spyOn(requester['logger'], 'warn').mockImplementation(() => undefined)
    await expect(requester.requestIfDue('ws-1', { id: 'c-1', raw_data: { apolloId: 'a1' } }, NOW)).resolves.toBe(false)
  })
})
