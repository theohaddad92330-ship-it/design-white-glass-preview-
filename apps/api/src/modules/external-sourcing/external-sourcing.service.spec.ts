import { NotFoundException } from '@nestjs/common'
import { EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE, EXTERNAL_SOURCING_SOURCE_LIMIT } from '@bellum/contracts'
import { ExternalSourcingService } from './external-sourcing.service'

describe('ExternalSourcingService', () => {
  function build(
    needsQuery: jest.Mock,
    consultantsQuery: jest.Mock,
    extra: Record<string, jest.Mock> = {},
    partnerBriefsExtra: Record<string, jest.Mock> = {},
  ) {
    const needs = { manager: { query: needsQuery } }
    const consultants: Record<string, jest.Mock | { query: jest.Mock }> & { manager: { query: jest.Mock } } = {
      manager: { query: consultantsQuery },
      findOne: jest.fn(),
      update: jest.fn(),
      ...extra,
    }
    const partnerBriefs = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((row: unknown) => row),
      save: jest.fn((row: Record<string, unknown>) => ({
        id: 'brief-1',
        prepared_at: new Date('2026-09-28T10:00:00.000Z'),
        feedback_recorded_at: null,
        ...row,
      })),
      update: jest.fn(),
      ...partnerBriefsExtra,
    }
    const service = new ExternalSourcingService(consultants as never, needs as never, partnerBriefs as never)
    return { service, consultants, partnerBriefs }
  }

  describe('search', () => {
    it('dit NON — un besoin sans compétence n’interroge AUCUNE source', async () => {
      const needsQuery = jest.fn().mockResolvedValue([{ skills: [] }])
      const consultantsQuery = jest.fn()
      const { service } = build(needsQuery, consultantsQuery)

      const result = await service.search('need-1', 'ws-1')

      expect(result).toEqual({
        needId: 'need-1',
        skillTerms: [],
        unavailableReason: 'skills_missing',
        candidates: [],
        notConnected: [],
        unanswered: [],
      })
      expect(consultantsQuery).not.toHaveBeenCalled()
    })

    it('rend `null` quand le besoin n’existe pas dans cet espace', async () => {
      const needsQuery = jest.fn().mockResolvedValue([])
      const { service } = build(needsQuery, jest.fn())
      expect(await service.search('need-x', 'ws-1')).toBeNull()
    })

    it('agrège les quatre sources branchées, classées par compétences partagées, et nomme la source non branchée', async () => {
      const needsQuery = jest.fn().mockResolvedValue([{ skills: [{ term: 'Kubernetes', required: true }] }])
      const consultantsQuery = jest
        .fn()
        // network_referral
        .mockResolvedValueOnce([
          { id: 'c-0', full_name: 'Inès Marchetti', title: 'Cloud', skills: ['kubernetes', 'terraform'] },
        ])
        // partner_bench
        .mockResolvedValueOnce([{ id: 'c-1', full_name: 'Zoé Berthier', title: 'DevOps', skills: ['kubernetes'] }])
        // inbound_candidacy
        .mockResolvedValueOnce([])
        // csv_ats_import
        .mockResolvedValueOnce([
          { id: 'c-2', full_name: 'Anne Dupuis', title: 'SRE', skills: ['kubernetes', 'terraform'] },
        ])
      const { service } = build(needsQuery, consultantsQuery)

      const result = await service.search('need-1', 'ws-1')

      expect(result?.unavailableReason).toBeNull()
      expect(result?.notConnected).toEqual(['external_directory'])
      // Les trois partagent 1 compétence (« Kubernetes ») : égalité départagée
      // par le nom, en français — Anne, Inès, Zoé.
      expect(result?.candidates.map(c => c.id)).toEqual(['c-2', 'c-0', 'c-1'])
      expect(result?.candidates[1]).toMatchObject({ sourceKind: 'network_referral', limits: ['not_yet_qualified'] })
      expect(result?.candidates[0]).toMatchObject({
        sourceKind: 'csv_ats_import',
        sharedSkills: ['Kubernetes'],
        limits: ['not_yet_qualified'],
      })
      expect(result?.candidates[2]).toMatchObject({
        sourceKind: 'partner_bench',
        limits: ['partner_availability_unconfirmed'],
      })
    })

    it('#2190.12 — interroge chaque source avec le volume par défaut quand rien n’est choisi', async () => {
      const needsQuery = jest.fn().mockResolvedValue([{ skills: [{ term: 'Kubernetes', required: true }] }])
      const consultantsQuery = jest.fn().mockResolvedValue([])
      const { service } = build(needsQuery, consultantsQuery)

      await service.search('need-1', 'ws-1')

      expect(consultantsQuery).toHaveBeenCalledTimes(4)
      for (const call of consultantsQuery.mock.calls) {
        expect(call[1].at(-1)).toBe(EXTERNAL_SOURCING_SOURCE_LIMIT)
      }
    })

    it('#2190.12 — un volume choisi voyage jusqu’à chaque source, borné aux limites publiées', async () => {
      const needsQuery = jest.fn().mockResolvedValue([{ skills: [{ term: 'Kubernetes', required: true }] }])
      const consultantsQuery = jest.fn().mockResolvedValue([])
      const { service } = build(needsQuery, consultantsQuery)

      await service.search('need-1', 'ws-1', 10_000)

      for (const call of consultantsQuery.mock.calls) {
        expect(call[1].at(-1)).toBe(EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE)
      }
    })
  })

  describe('#2190.3 — la source « recommandations et réseau »', () => {
    it('une seule requête LIT le réseau ; les deux sources voisines EXCLUENT ces fiches', async () => {
      const needsQuery = jest.fn().mockResolvedValue([{ skills: [{ term: 'Kubernetes', required: true }] }])
      const consultantsQuery = jest.fn().mockResolvedValue([])
      const { service } = build(needsQuery, consultantsQuery)

      await service.search('need-1', 'ws-1')

      const pattern = '(cooptation|recommandation|parrainage|referral)'
      const sqls = consultantsQuery.mock.calls.map(call => String(call[0]))
      const reads = sqls.filter(sql => sql.includes(`~ '${pattern}'`) && !sql.includes(`!~ '${pattern}'`))
      const excludes = sqls.filter(sql => sql.includes(`!~ '${pattern}'`))
      expect(reads).toHaveLength(1)
      expect(excludes).toHaveLength(2)
    })
  })

  describe('importCandidate', () => {
    it('refuse un profil introuvable dans cet espace', async () => {
      const { service, consultants } = build(jest.fn(), jest.fn())
      ;(consultants.findOne as jest.Mock).mockResolvedValue(null)

      await expect(
        service.importCandidate(
          'ws-1',
          'need-1',
          {
            consultantId: 'c-1',
            sourceKind: 'inbound_candidacy',
            consent: true,
          },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('est idempotent — une fiche déjà importée n’est jamais réécrite', async () => {
      const { service, consultants } = build(jest.fn(), jest.fn())
      ;(consultants.findOne as jest.Mock).mockResolvedValue({
        id: 'c-1',
        external_sourcing_origin: {
          sourceKind: 'inbound_candidacy',
          needId: 'need-0',
          importedAt: '2026-09-01T00:00:00.000Z',
        },
        consent_given_at: null,
        qualified_at: null,
      })

      const result = await service.importCandidate(
        'ws-1',
        'need-1',
        {
          consultantId: 'c-1',
          sourceKind: 'inbound_candidacy',
          consent: true,
        },
        'user-1',
      )

      expect(result).toEqual({ consultantId: 'c-1', imported: false })
      expect(consultants.update).not.toHaveBeenCalled()
    })

    it('trace l’origine, recueille le consentement et qualifie la fiche', async () => {
      const { service, consultants } = build(jest.fn(), jest.fn())
      ;(consultants.findOne as jest.Mock).mockResolvedValue({
        id: 'c-1',
        external_sourcing_origin: null,
        consent_given_at: null,
        qualified_at: null,
      })

      const result = await service.importCandidate(
        'ws-1',
        'need-1',
        {
          consultantId: 'c-1',
          sourceKind: 'partner_bench',
          consent: true,
        },
        'user-1',
      )

      expect(result).toEqual({ consultantId: 'c-1', imported: true })
      expect(consultants.update).toHaveBeenCalledWith(
        { id: 'c-1' },
        expect.objectContaining({
          review_status: 'qualified',
          external_sourcing_origin: expect.objectContaining({ sourceKind: 'partner_bench', needId: 'need-1' }),
        }),
      )
    })
  })

  describe('#2190.5 / #2190.7 — l’annuaire externe', () => {
    const needsQuery = () => jest.fn().mockResolvedValue([{ skills: [{ term: 'Kubernetes', required: true }] }])
    const originalFetch = global.fetch
    const originalKey = process.env['APOLLO_API_KEY']
    afterEach(() => {
      global.fetch = originalFetch
      if (originalKey === undefined) delete process.env['APOLLO_API_KEY']
      else process.env['APOLLO_API_KEY'] = originalKey
    })

    it('sans clé : « non branché », AUCUN appel réseau', async () => {
      delete process.env['APOLLO_API_KEY']
      global.fetch = jest.fn()
      const { service } = build(needsQuery(), jest.fn().mockResolvedValue([]))

      const result = await service.search('need-1', 'ws-1')

      expect(result?.notConnected).toEqual(['external_directory'])
      expect(result?.unanswered).toEqual([])
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('avec clé : les profils de l’annuaire rejoignent la liste, sans nommer le fournisseur', async () => {
      process.env['APOLLO_API_KEY'] = 'k-test'
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          people: [{ id: 'p1', first_name: 'Camille', last_name: 'Durand', title: 'Kubernetes SRE' }],
        }),
      })
      const { service } = build(needsQuery(), jest.fn().mockResolvedValue([]))

      const result = await service.search('need-1', 'ws-1')

      expect(result?.notConnected).toEqual([])
      expect(result?.candidates).toEqual([
        expect.objectContaining({
          id: 'external_directory:p1',
          fullName: 'Camille Durand',
          sharedSkills: ['Kubernetes'],
        }),
      ])
      expect(JSON.stringify(result).toLowerCase()).not.toContain('apollo')
    })

    it('timeout : la source est NOMMÉE « sans réponse », les sources voisines répondent quand même', async () => {
      process.env['APOLLO_API_KEY'] = 'k-test'
      global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      const { service } = build(needsQuery(), jest.fn().mockResolvedValue([]))

      const result = await service.search('need-1', 'ws-1')

      expect(result?.unanswered).toEqual(['external_directory'])
      expect(result?.candidates).toEqual([])
    })

    it('importer un profil de l’annuaire CRÉE la fiche (nom, poste, compétences) avec l’origine tracée', async () => {
      const query = jest.fn().mockResolvedValue([])
      const { service, consultants } = build(jest.fn(), query, {
        create: jest.fn((row: unknown) => row),
        save: jest.fn(async (row: Record<string, unknown>) => ({ id: 'c-new', ...row })),
      })

      const result = await service.importCandidate(
        'ws-1',
        'need-1',
        {
          sourceKind: 'external_directory',
          consent: true,
          externalProfile: {
            ref: 'external_directory:p1',
            fullName: 'Camille Durand',
            title: 'SRE',
            skills: ['Kubernetes'],
          },
        },
        'user-1',
      )

      expect(result).toEqual({ consultantId: 'c-new', imported: true })
      expect(consultants['save']).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          user_id: 'user-1',
          full_name: 'Camille Durand',
          review_status: 'qualified',
          external_sourcing_origin: expect.objectContaining({
            sourceKind: 'external_directory',
            externalRef: 'external_directory:p1',
          }),
        }),
      )
      expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO consultant_skills'), [
        'c-new',
        'ws-1',
        'kubernetes',
      ])
    })

    it('est idempotent : un second import du même profil ne crée pas de doublon', async () => {
      const query = jest.fn().mockResolvedValue([{ id: 'c-old' }])
      const { service, consultants } = build(jest.fn(), query, { save: jest.fn(), create: jest.fn() })

      const result = await service.importCandidate(
        'ws-1',
        'need-1',
        {
          sourceKind: 'external_directory',
          consent: true,
          externalProfile: { ref: 'external_directory:p1', fullName: 'Camille Durand', title: null, skills: [] },
        },
        'user-1',
      )

      expect(result).toEqual({ consultantId: 'c-old', imported: false })
      expect(consultants['save']).not.toHaveBeenCalled()
    })
  })

  describe('preparePartnerBrief — le brief se PRÉPARE, il ne s’envoie JAMAIS', () => {
    it('refuse un besoin introuvable dans cet espace', async () => {
      const needsQuery = jest.fn().mockResolvedValue([])
      const { service } = build(needsQuery, jest.fn())

      await expect(
        service.preparePartnerBrief('ws-1', 'need-x', 'user-1', { partnerName: 'ESN Atlas' }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('compose le message depuis le besoin RÉEL — jamais une donnée inventée', async () => {
      const needsQuery = jest
        .fn()
        .mockResolvedValue([
          { skills: [{ term: 'Kubernetes', required: true }], title: 'Ingénieur DevOps', headcount: 2 },
        ])
      const { service, partnerBriefs } = build(needsQuery, jest.fn())

      const result = await service.preparePartnerBrief('ws-1', 'need-1', 'user-1', {
        partnerName: 'ESN Atlas',
        conditions: 'TJM max 550€',
        delay: '48h',
      })

      expect(result.partnerName).toBe('ESN Atlas')
      expect(result.message).toContain('Ingénieur DevOps')
      expect(result.message).toContain('Kubernetes')
      expect(result.nonSolicitation).toBe(true)
      expect(result.feedback).toBeNull()
      expect(partnerBriefs.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          need_id: 'need-1',
          partner_name: 'ESN Atlas',
          conditions: 'TJM max 550€',
          delay: '48h',
          prepared_by: 'user-1',
        }),
      )
    })

    it('ne pose AUCUN statut « envoyé » — jamais un fait sans preuve d’envoi', async () => {
      const needsQuery = jest.fn().mockResolvedValue([{ skills: [], title: 'Chef de projet', headcount: 1 }])
      const { service } = build(needsQuery, jest.fn())

      const result = await service.preparePartnerBrief('ws-1', 'need-1', 'user-1', { partnerName: 'ESN Atlas' })

      expect(result).not.toHaveProperty('sentAt')
      expect(result).not.toHaveProperty('status')
    })
  })

  describe('recordPartnerBriefFeedback', () => {
    it('refuse un brief introuvable dans cet espace', async () => {
      const { service, partnerBriefs } = build(jest.fn(), jest.fn())
      ;(partnerBriefs.findOne as jest.Mock).mockResolvedValue(null)

      await expect(
        service.recordPartnerBriefFeedback('ws-1', 'need-1', 'brief-x', { feedback: 'Retour' }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('enregistre le retour — saisi par un humain', async () => {
      const { service, partnerBriefs } = build(jest.fn(), jest.fn())
      ;(partnerBriefs.findOne as jest.Mock).mockResolvedValue({
        id: 'brief-1',
        need_id: 'need-1',
        workspace_id: 'ws-1',
        partner_name: 'ESN Atlas',
        message: 'Besoin : X',
        conditions: null,
        delay: null,
        feedback: null,
        prepared_at: new Date('2026-09-28T10:00:00.000Z'),
        feedback_recorded_at: null,
      })

      const result = await service.recordPartnerBriefFeedback('ws-1', 'need-1', 'brief-1', {
        feedback: 'Deux profils proposés',
      })

      expect(result.feedback).toBe('Deux profils proposés')
      expect(result.feedbackRecordedAt).not.toBeNull()
      expect(partnerBriefs.update).toHaveBeenCalledWith(
        { id: 'brief-1' },
        expect.objectContaining({ feedback: 'Deux profils proposés' }),
      )
    })
  })
})
