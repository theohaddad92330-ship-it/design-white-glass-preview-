import { failure, success } from '@bellum/utils'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { ContactReachabilityCatchupService } from './contact-reachability-catchup.service'

/**
 * E1 (07/10/2026, #3698 — décision Louis, point 6) — le rattrapage CIBLÉ : une
 * liste d'ids donnée par l'opérateur (Louis teste sur 25 contacts), jamais le
 * parc, jamais au déploiement, gratuit pour le client. Et la lecture de
 * couverture (point 7) sur ce même échantillon.
 */
describe('ContactReachabilityCatchupService — rattrapage ciblé et couverture (E1)', () => {
  let find: jest.Mock
  let enqueue: jest.Mock
  let service: ContactReachabilityCatchupService

  const row = (over: Partial<ContactEntity>): ContactEntity =>
    ({
      id: 'c1',
      user_id: 'u1',
      full_name: 'Alice Martin',
      entity: 'Acme',
      email: null,
      phone: null,
      linkedin_url: null,
      hidden: false,
      excluded_at: null,
      ...over,
    }) as ContactEntity

  beforeEach(() => {
    delete process.env.CONTACTS_REACHABILITY_CATCHUP_DISABLED
    find = jest.fn()
    enqueue = jest.fn().mockResolvedValue(success({ job_id: 'j', state: 'queued' }))
    service = new ContactReachabilityCatchupService({ find } as never, { enqueue } as never)
  })

  it('rejoue CHAQUE id à qui il manque une coordonnée — gratuit, forcé, toutes coordonnées', async () => {
    find.mockResolvedValue([row({ id: 'a' }), row({ id: 'b', email: 'b@x.fr', phone: '+33 6 11 22 33 44' })])
    const out = await service.runForIds('louis', ['a', 'b'])
    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(enqueue).toHaveBeenCalledWith(
      'a',
      'u1',
      expect.objectContaining({ force: true, free: true, first_name: 'Alice', last_name: 'Martin' }),
    )
    // Pas de `only` : le rattrapage cherche tout ce qui manque.
    expect(enqueue.mock.calls[0][2]).not.toHaveProperty('only')
    expect(out).toMatchObject({ requested: 2, enqueued: 2, skipped: 0, cut: false })
  })

  it('NON : un contact complet, écarté, ou inconnu n’est pas rejoué — et chacun dit pourquoi', async () => {
    find.mockResolvedValue([
      row({ id: 'full', email: 'a@x.fr', phone: '+33 6 11 22 33 44', linkedin_url: 'https://www.linkedin.com/in/a' }),
      row({ id: 'hidden', hidden: true }),
    ])
    const out = await service.runForIds('louis', ['full', 'hidden', 'ghost'])
    expect(enqueue).not.toHaveBeenCalled()
    expect(out.per_contact).toEqual([
      { contact_id: 'full', status: 'complete' },
      { contact_id: 'hidden', status: 'excluded' },
      { contact_id: 'ghost', status: 'not_found' },
    ])
  })

  it('NON : borné à 50 ids — jamais le parc', async () => {
    find.mockResolvedValue([])
    const ids = Array.from({ length: 80 }, (_, index) => `id-${index}`)
    const out = await service.runForIds('louis', ids)
    expect(out.requested).toBe(50)
  })

  it('NON : l’interrupteur coupe aussi le rattrapage ciblé', async () => {
    process.env.CONTACTS_REACHABILITY_CATCHUP_DISABLED = 'true'
    const out = await service.runForIds('louis', ['a'])
    expect(out.cut).toBe(true)
    expect(find).not.toHaveBeenCalled()
  })

  it('un refus de mise en file est compté, nommé, jamais avalé', async () => {
    find.mockResolvedValue([row({ id: 'a' })])
    enqueue.mockResolvedValueOnce(failure({ code: 'opt_out', message: 'stop' }))
    const out = await service.runForIds('louis', ['a'])
    expect(out).toMatchObject({ enqueued: 0, skipped: 1 })
    expect(out.per_contact).toEqual([{ contact_id: 'a', status: 'opt_out' }])
  })

  it('couverture : compte par coordonnée, et par source (interne — opérateur seulement)', async () => {
    find.mockResolvedValue([
      row({
        id: 'a',
        email: 'a@x.fr',
        enrichment_coordinates: {
          email: { state: 'found', sources_queried: 1, at: 't' },
          phone: { state: 'not_found', sources_queried: 2, at: 't' },
        },
        enrichment_trace: {
          attempts: [
            { source: 'apollo', coordinate: 'email', outcome: 'found', at: 't' },
            { source: 'apollo', coordinate: 'phone', outcome: 'not_found', at: 't' },
            { source: 'fullenrich', coordinate: 'phone', outcome: 'not_found', at: 't' },
          ],
        },
      } as Partial<ContactEntity>),
      row({ id: 'b', phone: '+33 6 11 22 33 44' }),
    ])
    const out = await service.coverage(['a', 'b'])
    expect(out.contacts).toBe(2)
    expect(out.present).toEqual({ email: 1, phone: 1, linkedin: 0 })
    expect(out.coordinates.phone).toMatchObject({ not_found: 1, none: 1 })
    expect(out.sources['fullenrich']?.['phone']).toEqual({ not_found: 1 })
    expect(out.sources['apollo']?.['email']).toEqual({ found: 1 })
    // La trace interne est lue explicitement : la colonne n'est jamais servie par défaut.
    expect(find.mock.calls[0][0].select).toContain('enrichment_trace')
  })
})
