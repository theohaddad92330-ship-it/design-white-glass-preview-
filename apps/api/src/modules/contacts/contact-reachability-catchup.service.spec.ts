import { CONTACT_REACHABILITY_CATCHUP_CAPABILITY_AT } from '@bellum/contracts'
import { failure, success } from '@bellum/utils'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { ContactReachabilityCatchupService } from './contact-reachability-catchup.service'

const BEFORE = new Date('2026-09-01T10:00:00.000Z')
const AFTER = new Date('2026-10-03T10:00:00.000Z')

function contact(over: Partial<ContactEntity>): ContactEntity {
  return {
    id: 'c1',
    user_id: 'u1',
    full_name: 'Alice Martin',
    entity: 'Acme',
    email: null,
    phone: null,
    last_enrichment_at: null,
    created_at: BEFORE,
    ...over,
  } as ContactEntity
}

/**
 * #3549 — le rejeu ciblé des contacts sans e-mail/téléphone collectés avant le
 * correctif. Jamais tout le parc, jamais seul au déploiement, gratuit pour le client.
 */
describe('ContactReachabilityCatchupService', () => {
  let find: jest.Mock
  let enqueue: jest.Mock
  let service: ContactReachabilityCatchupService

  beforeEach(() => {
    delete process.env.CONTACTS_REACHABILITY_CATCHUP_DISABLED
    find = jest.fn()
    enqueue = jest.fn().mockResolvedValue(success({ job_id: 'j', state: 'queued' }))
    service = new ContactReachabilityCatchupService({ find } as never, { enqueue } as never)
  })

  it('lit les candidats avec une borne dure, jamais tout le parc', async () => {
    find.mockResolvedValue([])
    await service.listConcerned(25)
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }))
  })

  it('le dernier mot est la fonction pure : un contact collecté APRÈS la capacité sort, même renvoyé par le SQL', async () => {
    find.mockResolvedValue([contact({ id: 'old' }), contact({ id: 'new', last_enrichment_at: AFTER })])
    const rows = await service.listConcerned(10)
    expect(rows.map(r => r.id)).toEqual(['old'])
    expect(CONTACT_REACHABILITY_CATCHUP_CAPABILITY_AT > BEFORE.toISOString()).toBe(true)
  })

  it('met chaque contact en file AU NOM DE SON PROPRIÉTAIRE, gratuit, en ne demandant que ce qui manque', async () => {
    find.mockResolvedValue([
      contact({ id: 'a', user_id: 'owner-a', email: 'a@x.fr' }),
      contact({ id: 'b', user_id: 'owner-b', phone: '+33600000000' }),
      contact({ id: 'c', user_id: 'owner-c' }),
    ])
    const out = await service.runCatchup('louis', 10)
    expect(out).toEqual({ scanned: 3, enqueued: 3, skipped: 0, cut: false })
    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      'a',
      'owner-a',
      expect.objectContaining({
        free: true,
        force: true,
        only: 'phone',
        organization_name: 'Acme',
        first_name: 'Alice',
      }),
    )
    expect(enqueue).toHaveBeenNthCalledWith(2, 'b', 'owner-b', expect.objectContaining({ only: 'email' }))
    expect(enqueue.mock.calls[2][2]).not.toHaveProperty('only')
  })

  it('un refus d’avance (opt-out, écarté…) est compté, et le lot continue', async () => {
    find.mockResolvedValue([contact({ id: 'a' }), contact({ id: 'b' })])
    enqueue
      .mockResolvedValueOnce(failure({ code: 'opt_out', message: 'stop' }))
      .mockResolvedValueOnce(success({ job_id: 'j', state: 'queued' }))
    const out = await service.runCatchup('louis', 10)
    expect(out).toMatchObject({ scanned: 2, enqueued: 1, skipped: 1 })
  })

  it('une panne inattendue sur un contact ne coupe pas les suivants', async () => {
    find.mockResolvedValue([contact({ id: 'a' }), contact({ id: 'b' })])
    enqueue.mockRejectedValueOnce(new Error('redis')).mockResolvedValueOnce(success({ job_id: 'j', state: 'queued' }))
    const out = await service.runCatchup('louis', 10)
    expect(out).toMatchObject({ enqueued: 1, skipped: 1 })
  })

  it('l’interrupteur coupé n’exécute RIEN : ni lecture ni file', async () => {
    process.env.CONTACTS_REACHABILITY_CATCHUP_DISABLED = 'true'
    const out = await service.runCatchup('louis', 10)
    expect(out).toEqual({ scanned: 0, enqueued: 0, skipped: 0, cut: true })
    expect(find).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })
})
