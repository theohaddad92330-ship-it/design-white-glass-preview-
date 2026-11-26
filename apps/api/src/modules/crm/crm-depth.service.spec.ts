import { ServiceUnavailableException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import { CrmPipelineSyncEntity } from '../../database/entities/crm-pipeline-sync.entity'
import { SuppressionService } from '../mailer/suppression.service'
import { CrmDepthService } from './crm-depth.service'
import { CrmService } from './crm.service'
import { HubspotDepthClient } from './hubspot-depth.client'

const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const USER = '11111111-1111-1111-1111-111111111111'

type Mocked<T> = { [K in keyof T]: jest.Mock }

/**
 * Le service tient un client concret ; on remplace ses méthodes sur le
 * prototype. C'est volontaire : le client est un détail d'implémentation du
 * service (il n'est pas injecté), et l'injecter pour le test seul ouvrirait un
 * point d'extension que personne n'utiliserait en production.
 */
const clientProto = HubspotDepthClient.prototype as unknown as Record<string, unknown>
let savedMethods: Record<string, unknown> = {}

function stubClient(overrides: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in savedMethods)) savedMethods[key] = clientProto[key]
    clientProto[key] = value
  }
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedMethods)) clientProto[key] = value
  savedMethods = {}
})

describe('CrmDepthService', () => {
  let service: CrmDepthService
  let facts: Mocked<Pick<import('typeorm').Repository<CrmDealFactEntity>, 'find' | 'upsert' | 'createQueryBuilder'>>
  let syncs: Mocked<Pick<import('typeorm').Repository<CrmPipelineSyncEntity>, 'findOne' | 'upsert'>>
  let suppressions: { isSuppressed: jest.Mock }

  beforeEach(async () => {
    jest.restoreAllMocks()
    facts = {
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    }
    syncs = { findOne: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue(undefined) }
    suppressions = { isSuppressed: jest.fn().mockResolvedValue(false) }

    const moduleRef = await Test.createTestingModule({
      providers: [
        CrmDepthService,
        {
          provide: CrmService,
          useValue: {
            resolveAccess: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE, accessToken: 'tok' }),
            findCompanyIdFor: jest.fn().mockResolvedValue(null),
            isDemoUser: jest.fn().mockResolvedValue(false),
          },
        },
        { provide: getRepositoryToken(CrmDealFactEntity), useValue: facts },
        { provide: getRepositoryToken(CrmPipelineSyncEntity), useValue: syncs },
        { provide: SuppressionService, useValue: suppressions },
      ],
    }).compile()

    service = moduleRef.get(CrmDepthService)
  })

  describe('inscription dans une séquence — le double opt-out', () => {
    it('n’inscrit pas un contact désabonné CHEZ LE FOURNISSEUR', async () => {
      const enroll = jest.fn()
      stubClient({
        readContactState: async () => ({ email: 'a@example.test', optedOut: true }),
        enrollInSequence: enroll,
      })

      const result = await service.enrollInSequence(USER, {
        sequenceId: 's1',
        contactIds: ['c1'],
        senderEmail: 'moi@esn.test',
      })

      expect(enroll).not.toHaveBeenCalled()
      expect(result.enrolled).toEqual([])
      expect(result.skipped[0]).toMatchObject({ contactId: 'c1', reason: 'Désabonné dans le CRM' })
    })

    it('n’inscrit pas un contact désabonné CHEZ NOUS, même si le CRM l’accepte', async () => {
      // C'est le cœur de la décision : deux moteurs d'envoi, deux listes de
      // désabonnés. Une personne qui s'est désabonnée d'un côté ne doit pas
      // être rattrapée par l'autre.
      const enroll = jest.fn()
      suppressions.isSuppressed.mockResolvedValue(true)
      stubClient({
        readContactState: async () => ({ email: 'a@example.test', optedOut: false }),
        enrollInSequence: enroll,
      })

      const result = await service.enrollInSequence(USER, {
        sequenceId: 's1',
        contactIds: ['c1'],
        senderEmail: 'moi@esn.test',
      })

      expect(enroll).not.toHaveBeenCalled()
      expect(result.skipped[0]?.reason).toBe('Désabonné dans Bellum')
      expect(suppressions.isSuppressed).toHaveBeenCalledWith(WORKSPACE, 'a@example.test')
    })

    it('saute une fiche introuvable plutôt que de la traiter comme consentante', async () => {
      stubClient({ readContactState: async () => null, enrollInSequence: jest.fn() })
      const result = await service.enrollInSequence(USER, {
        sequenceId: 's1',
        contactIds: ['fantome'],
        senderEmail: 'moi@esn.test',
      })
      expect(result.skipped[0]?.reason).toBe('Fiche introuvable dans le CRM')
    })

    it('saute une fiche sans e-mail — rien à envoyer, rien à rapprocher', async () => {
      stubClient({
        readContactState: async () => ({ email: null, optedOut: false }),
        enrollInSequence: jest.fn(),
      })
      const result = await service.enrollInSequence(USER, {
        sequenceId: 's1',
        contactIds: ['c1'],
        senderEmail: 'moi@esn.test',
      })
      expect(result.enrolled).toEqual([])
      expect(result.skipped[0]?.reason).toContain('sans e-mail')
    })

    it('un échec sur un contact n’empêche pas les autres, et il est nommé', async () => {
      stubClient({
        readContactState: async () => ({ email: 'a@example.test', optedOut: false }),
        enrollInSequence: jest
          .fn()
          .mockRejectedValueOnce(new Error('quota dépassé'))
          .mockResolvedValueOnce({ id: 'e2' }),
      })

      const result = await service.enrollInSequence(USER, {
        sequenceId: 's1',
        contactIds: ['ko', 'ok'],
        senderEmail: 'moi@esn.test',
      })

      expect(result.enrolled).toEqual(['e2'])
      expect(result.skipped[0]).toMatchObject({ contactId: 'ko', reason: 'quota dépassé' })
    })

    it('borne à cinquante et DIT ce qui a été laissé de côté', async () => {
      stubClient({
        readContactState: async () => ({ email: 'a@example.test', optedOut: false }),
        enrollInSequence: async () => ({ id: 'e' }),
      })

      const result = await service.enrollInSequence(USER, {
        sequenceId: 's1',
        contactIds: Array.from({ length: 60 }, (_, i) => `c${i}`),
        senderEmail: 'moi@esn.test',
      })

      expect(result.enrolled).toHaveLength(50)
      expect(result.skipped.at(-1)?.reason).toContain('10 contact(s) au-delà de la borne')
    })
  })

  describe('rapport de pipeline', () => {
    // R24 (15/10/2026) — /integrations montre le CRM de la salle « branché » : /pilotage/pipe ne dit pas « Aucun CRM
    // connecté » (une seule source). Les affaires de la salle, aucun jeton, aucune synchro prétendue.
    it('en démo, rend les affaires de la salle sans lire de CRM ni prétendre une synchro', async () => {
      const crm = service['crm'] as unknown as { isDemoUser: jest.Mock; resolveAccess: jest.Mock }
      crm.isDemoUser.mockResolvedValue(true)

      const report = await service.getPipelineReport(USER, { period: 'year' })

      expect(crm.resolveAccess).not.toHaveBeenCalled()
      expect(report.coverage.syncedAt).toBeNull()
      expect(report.coverage.dealsRead).toBe(3)
      expect(report.open.deals).toBe(1)
    })

    it('sert le cache daté quand la relecture échoue, plutôt qu’une page d’erreur', async () => {
      const syncedAt = new Date('2026-08-02T06:00:00.000Z')
      syncs.findOne.mockResolvedValue({ synced_at: syncedAt, truncated: false, deals_read: 12 })
      facts.find.mockResolvedValue([])
      stubClient({
        readDealHistory: async () => {
          throw new Error('HubSpot indisponible')
        },
      })

      const report = await service.getPipelineReport(USER, { period: 'quarter', refresh: true })

      expect(report.coverage.syncedAt).toBe(syncedAt.toISOString())
    })

    // P5 (29/09) — `/crm/pipeline/report` appelé plusieurs fois à la fois sur
    // /pilotage : cache périmé => chaque appel relisait tout le CRM du client.
    it('P5 — 3 appels simultanés sur un cache périmé ne relisent le CRM QU’UNE fois', async () => {
      syncs.findOne.mockResolvedValue({
        synced_at: new Date('2026-01-01T00:00:00.000Z'),
        truncated: false,
        deals_read: 0,
      })
      const readDealHistory = jest.fn(async () => {
        await new Promise(resolve => setImmediate(resolve))
        return { deals: [], truncated: false }
      })
      stubClient({ readDealHistory })

      await Promise.all([
        service.getPipelineReport(USER, { period: 'quarter' }),
        service.getPipelineReport(USER, { period: 'quarter' }),
        service.getPipelineReport(USER, { period: 'month' }),
      ])
      expect(readDealHistory).toHaveBeenCalledTimes(1)

      // Une fois finie, la promesse est oubliée : le cache périmé se relit encore.
      await service.getPipelineReport(USER, { period: 'quarter' })
      expect(readDealHistory).toHaveBeenCalledTimes(2)
    })

    it('remonte l’erreur quand il n’y a AUCUN cache — un rapport vide se lirait « pipeline vide »', async () => {
      syncs.findOne.mockResolvedValue(null)
      stubClient({
        readDealHistory: async () => {
          throw new Error('HubSpot indisponible')
        },
      })

      await expect(service.getPipelineReport(USER, { period: 'quarter' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
    })

    it('dit qu’une PORTÉE manque plutôt que de rendre une erreur interne', async () => {
      // Vécu en production le 16/08 : le portail avait été branché avant que la
      // lecture des affaires soit demandée. L'écran affichait « CRM connecté »,
      // l'appel rendait un 500 opaque, et rien n'indiquait qu'il suffisait de
      // reconnecter.
      syncs.findOne.mockResolvedValue(null)
      stubClient({
        readDealHistory: async () => {
          throw new Error("HubSpot read deals failed: This app hasn't been granted all required scopes")
        },
      })

      await expect(service.getPipelineReport(USER, { period: 'quarter' })).rejects.toMatchObject({
        response: { reason: 'scope_missing' },
      })
    })

    it('ne purge pas les deals absents quand la lecture a été tronquée', async () => {
      // Sur une lecture tronquée, l'absence d'un deal ne prouve rien : purger
      // effacerait la moitié du pipeline du client.
      const deleteBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      }
      facts.createQueryBuilder.mockReturnValue(deleteBuilder)
      stubClient({
        readDealHistory: async () => ({
          deals: [
            {
              id: 'd1',
              name: 'Deal',
              stage: null,
              stageLabel: null,
              pipeline: null,
              amount: null,
              ownerId: null,
              ownerName: null,
              createdAt: null,
              closedAt: null,
              lastActivityAt: null,
              isClosed: false,
              isWon: null,
            },
          ],
          truncated: true,
        }),
      })

      await service.syncPipeline(USER)

      expect(facts.upsert).toHaveBeenCalled()
      expect(facts.createQueryBuilder).not.toHaveBeenCalled()
    })
  })
})
