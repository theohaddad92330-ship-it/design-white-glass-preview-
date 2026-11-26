import type { Repository } from 'typeorm'
import { ContactResolutionCorrectionEntity } from '../../database/entities/contact-resolution-correction.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { createMockRepository } from '../../database/test-utils'
import { ContactResolutionCorrectionsService } from './contact-resolution-corrections.service'

/**
 * #2159.35 — le service de la correction de rapprochement de contact.
 *
 * Ce qu'il tient : une ligne PAR GESTE (jamais d'update ni de delete — on
 * archive), la version suivante de CETTE fiche dans CET espace, une clé de
 * rapprochement DÉRIVÉE DE L'E-MAIL ACTUEL de la fiche (jamais composée côté
 * client), et une lecture qui ne franchit jamais la frontière d'un espace.
 */
function row(version: number, overrides: Partial<ContactResolutionCorrectionEntity> = {}) {
  return {
    id: `id-${version}`,
    workspaceId: 'ws-1',
    contactId: 'contact-1',
    version,
    decision: 'rejected' as const,
    dedupKey: 'email:accueil@acme.fr',
    note: null,
    decidedBy: 'user-1',
    decidedAt: new Date('2026-09-28T08:00:00Z'),
    ...overrides,
  }
}

function build() {
  const corrections = createMockRepository<ContactResolutionCorrectionEntity>()
  const contacts = createMockRepository<ContactEntity>()
  const service = new ContactResolutionCorrectionsService(
    corrections as unknown as Repository<ContactResolutionCorrectionEntity>,
    contacts as unknown as Repository<ContactEntity>,
  )
  return { corrections, contacts, service }
}

describe('ContactResolutionCorrectionsService', () => {
  it('un geste AJOUTE la version suivante, avec la clé dérivée de l’e-mail ACTUEL de la fiche', async () => {
    const { corrections, contacts, service } = build()
    contacts.findOne.mockResolvedValue({ id: 'contact-1', email: 'Accueil@ACME.fr' })
    corrections.findOne.mockResolvedValue(row(2))

    const out = await service.record({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      decidedBy: 'user-1',
      request: { decision: 'rejected', note: '   ' },
    })

    expect(corrections.insert).toHaveBeenCalledTimes(1)
    expect(corrections.insert.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      version: 3,
      decision: 'rejected',
      // Normalisée comme `existingKeys('contact')` la construit : minuscule, jamais recopiée brute.
      dedupKey: 'email:accueil@acme.fr',
      note: null,
      decidedBy: 'user-1',
    })
    expect(corrections.update).not.toHaveBeenCalled()
    expect(corrections.delete).not.toHaveBeenCalled()
    expect(out).toMatchObject({ version: 3, decision: 'rejected', dedup_key: 'email:accueil@acme.fr', note: null })
  })

  it('la première correction d’une fiche est la version 1', async () => {
    const { corrections, contacts, service } = build()
    contacts.findOne.mockResolvedValue({ id: 'contact-1', email: 'jean@acme.fr' })
    await service.record({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      decidedBy: 'user-1',
      request: { decision: 'confirmed' },
    })
    expect(corrections.insert.mock.calls[0]?.[0]).toMatchObject({ version: 1 })
  })

  it('une fiche sans e-mail n’a aucune clé de rapprochement à corriger — refusé, rien d’écrit', async () => {
    const { corrections, contacts, service } = build()
    contacts.findOne.mockResolvedValue({ id: 'contact-1', email: null })
    await expect(
      service.record({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        decidedBy: 'user-1',
        request: { decision: 'rejected' },
      }),
    ).rejects.toThrow(/e-mail/i)
    expect(corrections.insert).not.toHaveBeenCalled()
  })

  it('une fiche introuvable dans l’espace ne peut pas être corrigée', async () => {
    const { corrections, contacts, service } = build()
    contacts.findOne.mockResolvedValue(null)
    await expect(
      service.record({
        workspaceId: 'ws-1',
        contactId: 'ghost',
        decidedBy: 'user-1',
        request: { decision: 'rejected' },
      }),
    ).rejects.toThrow()
    expect(corrections.insert).not.toHaveBeenCalled()
  })

  it('deux gestes simultanés : la collision d’unicité reprend à la version d’après, jamais deux lignes sous un numéro', async () => {
    const { corrections, contacts, service } = build()
    contacts.findOne.mockResolvedValue({ id: 'contact-1', email: 'jean@acme.fr' })
    corrections.findOne.mockResolvedValueOnce(row(1)).mockResolvedValueOnce(row(2))
    corrections.insert.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))

    const out = await service.record({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      decidedBy: 'user-1',
      request: { decision: 'rejected' },
    })
    expect(corrections.insert).toHaveBeenCalledTimes(2)
    expect(out.version).toBe(3)
  })

  it('la lecture est scopée à l’espace, rendue dans l’ordre des versions, au format du contrat', async () => {
    const { corrections, service } = build()
    corrections.find.mockResolvedValue([row(1), row(2, { decision: 'confirmed', note: 'vérifié par Léa' })])

    const out = await service.list('ws-1', 'contact-1')

    expect(corrections.find.mock.calls[0]?.[0]).toMatchObject({
      where: { workspaceId: 'ws-1', contactId: 'contact-1' },
      order: { version: 'ASC' },
    })
    expect(out).toEqual([
      {
        version: 1,
        decision: 'rejected',
        dedup_key: 'email:accueil@acme.fr',
        note: null,
        decided_at: '2026-09-28T08:00:00.000Z',
      },
      {
        version: 2,
        decision: 'confirmed',
        dedup_key: 'email:accueil@acme.fr',
        note: 'vérifié par Léa',
        decided_at: '2026-09-28T08:00:00.000Z',
      },
    ])
    expect(out[0]).not.toHaveProperty('decided_by')
  })

  describe('#2159.35 — rejectedContactIds, la lecture qui sert import-writer.service.ts', () => {
    it('rend l’ensemble des fiches dont la DERNIÈRE version est un rejet', async () => {
      const { corrections, service } = build()
      const builder = {
        distinctOn: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(async () => [
          { contact_id: 'contact-1', decision: 'rejected' },
          { contact_id: 'contact-2', decision: 'confirmed' },
        ]),
      }
      corrections.createQueryBuilder.mockReturnValue(builder)

      const ids = await service.rejectedContactIds('ws-1')

      expect(builder.where).toHaveBeenCalledWith('c.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      expect(ids).toEqual(new Set(['contact-1']))
    })
  })
})
