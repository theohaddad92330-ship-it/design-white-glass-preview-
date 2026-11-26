import { createMockRepository } from '../../database/test-utils'
import { InvalidPhoneArchiveService } from './invalid-phone-archive.service'

/**
 * #3850.1 (lot V04, 08/10) — le rattrapage CIBLÉ des téléphones déjà en base
 * qui n'ont pas la forme d'un numéro (ex. le code postal brésilien
 * « 90480-000 », mesuré en prod sur une fiche réelle). Ce que ce test doit
 * savoir dire NON : un numéro plausible qui ne fait pas partie du segment, un
 * appel coupé par l'interrupteur, une correction humaine posée entre la
 * lecture et l'écriture.
 */
describe('InvalidPhoneArchiveService', () => {
  let repo: ReturnType<typeof createMockRepository>
  let service: InvalidPhoneArchiveService

  beforeEach(() => {
    delete process.env['CONTACTS_INVALID_PHONE_ARCHIVE_DISABLED']
    repo = createMockRepository()
    service = new InvalidPhoneArchiveService(repo as never)
  })

  describe('listConcerned', () => {
    it('ne retient QUE les téléphones qui n’ont pas la forme d’un numéro', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'a', phone: '90480-000' },
        { id: 'b', phone: '+33 6 81 05 00 91' },
        { id: 'c', phone: '552100554' },
      ])

      const rows = await service.listConcerned()

      expect(rows.map(row => row.id)).toEqual(['a', 'c'])
    })
  })

  describe('runArchive', () => {
    it('archive la valeur (jamais effacée) et vide la colonne lue', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'a', phone: '90480-000', phone_confidence: null, phone_cost_credits: null },
      ])

      const out = await service.runArchive('louis')

      expect(out).toEqual({ scanned: 1, archived: 1, skipped: 0, cut: false })
      expect(repo._qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ phone: null, phone_confidence: null, phone_cost_credits: null }),
      )
      expect(repo._qb.andWhere).toHaveBeenCalledWith('phone = :phone', { phone: '90480-000' })
      const patchCall = repo._qb.setParameter.mock.calls.find(([key]: [string]) => key === 'archivePatch')
      expect(JSON.parse(patchCall?.[1] as string)).toEqual({
        phone: '90480-000',
        phone_confidence: null,
        phone_cost_credits: null,
      })
    })

    it('une correction humaine posée entre la lecture et l’écriture n’est jamais écrasée', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'a', phone: '90480-000', phone_confidence: null, phone_cost_credits: null },
      ])
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })

      const out = await service.runArchive('louis')

      expect(out).toEqual({ scanned: 1, archived: 0, skipped: 1, cut: false })
    })

    it('une panne sur UN contact ne bloque pas les autres', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'a', phone: '90480-000', phone_confidence: null, phone_cost_credits: null },
        { id: 'b', phone: '552100554', phone_confidence: null, phone_cost_credits: null },
      ])
      repo._qb.execute.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce({ affected: 1 })

      const out = await service.runArchive('louis')

      expect(out).toEqual({ scanned: 2, archived: 1, skipped: 1, cut: false })
    })

    it('coupé par l’interrupteur : rien n’est lu ni écrit', async () => {
      process.env['CONTACTS_INVALID_PHONE_ARCHIVE_DISABLED'] = 'true'

      const out = await service.runArchive('louis')

      expect(out).toEqual({ scanned: 0, archived: 0, skipped: 0, cut: true })
      expect(repo.find).not.toHaveBeenCalled()
    })
  })
})
