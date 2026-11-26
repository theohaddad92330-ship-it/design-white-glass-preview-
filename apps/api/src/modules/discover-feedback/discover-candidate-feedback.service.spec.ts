import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DiscoverCandidateFeedbackEntity } from '../../database/entities/discover-candidate-feedback.entity'
import { DiscoverCandidateFeedbackService } from './discover-candidate-feedback.service'

/**
 * #3671.2bis — le retour serveur « Mauvaise entreprise » sur une carte
 * Découvrir : par espace, par SIREN, jamais un doublon sur un second clic.
 * `workspaceId` entre déjà résolu (GA-07) — la résolution est au contrôleur.
 */
describe('DiscoverCandidateFeedbackService', () => {
  const WORKSPACE = 'ws-1'
  const SIREN = '552081317'

  const build = async (manager: { query: jest.Mock }) => {
    const repo = { manager }
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscoverCandidateFeedbackService,
        { provide: getRepositoryToken(DiscoverCandidateFeedbackEntity), useValue: repo },
      ],
    }).compile()
    return { service: moduleRef.get(DiscoverCandidateFeedbackService), repo }
  }

  describe('record', () => {
    it('enregistre le verdict, scopé espace + siren', async () => {
      const query = jest.fn().mockResolvedValue(undefined)
      const { service } = await build({ query })

      const result = await service.record(WORKSPACE, 'u-1', SIREN, 'wrong_company')

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO discover_candidate_feedback'),
        expect.arrayContaining([WORKSPACE, 'u-1', SIREN, 'wrong_company']),
      )
      expect(result).toEqual({ siren: SIREN, verdict: 'wrong_company', recordedAt: expect.any(String) })
    })

    it('un second clic sur la même carte ne double rien (ON CONFLICT DO NOTHING)', async () => {
      const query = jest.fn().mockResolvedValue(undefined)
      const { service } = await build({ query })
      await service.record(WORKSPACE, 'u-1', SIREN, 'wrong_company')
      expect(query.mock.calls[0][0]).toContain('ON CONFLICT')
      expect(query.mock.calls[0][0]).toContain('DO NOTHING')
    })
  })

  describe('excludedSirens', () => {
    it('ne rend que les SIREN contredits de CET espace', async () => {
      const query = jest.fn().mockResolvedValue([{ siren: SIREN }, { siren: '111111111' }])
      const { service } = await build({ query })

      const result = await service.excludedSirens(WORKSPACE)

      expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE workspace_id = $1'), [WORKSPACE])
      expect(result).toEqual(new Set([SIREN, '111111111']))
    })

    it('une lecture en échec rend un ensemble VIDE — jamais une exclusion inventée', async () => {
      const query = jest.fn().mockRejectedValue(new Error('db down'))
      const { service } = await build({ query })
      expect(await service.excludedSirens(WORKSPACE)).toEqual(new Set())
    })
  })
})
