import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IsNull, Not, type Repository } from 'typeorm'
import { ReverseMarketDismissalEntity } from '../../../database/entities/reverse-market-dismissal.entity'
import { ReverseMarketDismissalService } from './reverse-market-dismissal.service'

/**
 * #2968 — « Masquer » un environnement du Reverse Market : mêmes garanties
 * que `AccountsService.dismissSimilarSuggestion` (#2127.37) — upsert sur la
 * clé composite, jamais une seconde ligne, et une correction humaine
 * (démasquer) gagne toujours.
 */
describe('ReverseMarketDismissalService (#2968)', () => {
  let service: ReverseMarketDismissalService
  let repo: jest.Mocked<Pick<Repository<ReverseMarketDismissalEntity>, 'upsert' | 'find'>>

  beforeEach(async () => {
    repo = { upsert: jest.fn(), find: jest.fn() } as unknown as typeof repo
    const module = await Test.createTestingModule({
      providers: [
        ReverseMarketDismissalService,
        { provide: getRepositoryToken(ReverseMarketDismissalEntity), useValue: repo },
      ],
    }).compile()
    service = module.get(ReverseMarketDismissalService)
  })

  it('dismiss upsert sur la clé composite, jamais une seconde ligne pour la même entreprise', async () => {
    await service.dismiss('ws1', 'user1', 'consultant1', ' Thales ')
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws1',
        user_id: 'user1',
        consultant_id: 'consultant1',
        company_key: 'thales',
        company_name: ' Thales ',
        dismissed_at: expect.any(Date),
      }),
      ['workspace_id', 'user_id', 'consultant_id', 'company_key'],
    )
  })

  it('restore repasse dismissed_at à NULL — la ligne n’est jamais supprimée', async () => {
    await service.restore('ws1', 'user1', 'consultant1', 'Thales')
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ dismissed_at: null }), [
      'workspace_id',
      'user_id',
      'consultant_id',
      'company_key',
    ])
  })

  it('dismissedCompanyNames ne rend que les lignes VIVANTES (dismissed_at non nul)', async () => {
    repo.find.mockResolvedValue([
      { company_name: 'Thales', dismissed_at: new Date() },
    ] as ReverseMarketDismissalEntity[])
    const names = await service.dismissedCompanyNames('ws1', 'user1', 'consultant1')
    expect(names).toEqual(['Thales'])
    expect(repo.find).toHaveBeenCalledWith({
      where: { workspace_id: 'ws1', user_id: 'user1', consultant_id: 'consultant1', dismissed_at: Not(IsNull()) },
    })
  })
})
