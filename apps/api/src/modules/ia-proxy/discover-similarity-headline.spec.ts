import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { DiscoverPortfolioService } from './discover-portfolio.service'

/**
 * #2166.11 (épopée #2806) — LA RÉFÉRENCE COMPARABLE, POUR UN CANDIDAT DÉCOUVERT.
 *
 * Même famille que `resolve()` (état portefeuille) : une lecture workspace-scopée,
 * qui ne jette jamais. Ce qu'elle apparie en plus, ici, c'est le NAF EXACT d'un
 * candidat NEUF contre celui des comptes du portefeuille — jamais un texte de
 * secteur libre (la même précision que `listSimilarCompaniesToExplore`,
 * `accounts.service.ts`, qui a remplacé un texte flou par le NAF pour la même
 * raison : un texte libre fait remonter des entreprises hors secteur).
 *
 * Seul `kind: 'sector'` est produit : `twin`/`tech` restent le panneau
 * « Similaires » (voir le commentaire sur `discoverCandidateSchema.similarityHeadline`).
 */
describe('DiscoverPortfolioService.resolveSimilarityHeadlines', () => {
  const WORKSPACE = 'ws-1'

  type Row = Partial<AccountEntity>

  const build = async (rows: Row[]) => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    }
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) }
    const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }) }
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscoverPortfolioService,
        { provide: getRepositoryToken(AccountEntity), useValue: repo },
        // Dépendance du service (besoins connus) — inutilisée par resolveSimilarityHeadlines.
        { provide: getRepositoryToken(ProjectNeedEntity), useValue: {} },
        { provide: WorkspaceContextService, useValue: workspace },
      ],
    }).compile()
    return { service: moduleRef.get(DiscoverPortfolioService), qb, repo, workspace }
  }

  const candidate = (nafCode: string | null, portfolioState: 'new' | 'analyzed' = 'new') => ({
    nafCode,
    portfolioState,
  })

  it('renvoie un tableau vide pour une liste vide — pas de requête', async () => {
    const { service, repo } = await build([])
    expect(await service.resolveSimilarityHeadlines('user-1', [])).toEqual([])
    expect(repo.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('ne requête pas quand aucun candidat n’est NEUF — un compte déjà possédé n’a rien à apprendre de lui-même', async () => {
    const { service, repo } = await build([])
    const result = await service.resolveSimilarityHeadlines('user-1', [candidate('62.02A', 'analyzed')])
    expect(result).toEqual([undefined])
    expect(repo.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('ne requête pas quand aucun candidat neuf n’a de NAF — rien à apparier', async () => {
    const { service, repo } = await build([])
    const result = await service.resolveSimilarityHeadlines('user-1', [candidate(null, 'new')])
    expect(result).toEqual([undefined])
    expect(repo.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('nomme le compte du portefeuille qui partage le NAF EXACT du candidat', async () => {
    const { service } = await build([
      { company_name: 'Decathlon', naf_code: '47.64Z', status: 'completed', created_at: new Date('2026-01-01') },
    ])
    const [result] = await service.resolveSimilarityHeadlines('user-1', [candidate('47.64Z')])
    expect(result).toEqual({ kind: 'sector', referenceAccount: 'Decathlon' })
  })

  it('ne nomme rien quand aucun compte du portefeuille ne partage ce NAF — jamais deviné', async () => {
    const { service } = await build([
      { company_name: 'Decathlon', naf_code: '47.64Z', status: 'completed', created_at: new Date('2026-01-01') },
    ])
    const [result] = await service.resolveSimilarityHeadlines('user-1', [candidate('62.02A')])
    expect(result).toBeUndefined()
  })

  it('ne regarde jamais un candidat déjà possédé, même si son NAF matche — il n’a rien à apprendre de lui-même', async () => {
    const { service } = await build([
      { company_name: 'Decathlon', naf_code: '47.64Z', status: 'completed', created_at: new Date('2026-01-01') },
    ])
    const [result] = await service.resolveSimilarityHeadlines('user-1', [candidate('47.64Z', 'analyzed')])
    expect(result).toBeUndefined()
  })

  it('ignore un compte du portefeuille SUPPRIMÉ — il ne nomme plus rien', async () => {
    const { service } = await build([
      { company_name: 'Decathlon', naf_code: '47.64Z', status: 'deleted', created_at: new Date('2026-01-01') },
    ])
    const [result] = await service.resolveSimilarityHeadlines('user-1', [candidate('47.64Z')])
    expect(result).toBeUndefined()
  })

  it('choisit le compte le PLUS RÉCENT quand plusieurs partagent le même NAF — même ordre que l’amorçage de découverte', async () => {
    const { service, qb } = await build([
      { company_name: 'Le Plus Récent', naf_code: '47.64Z', status: 'completed', created_at: new Date('2026-06-01') },
      { company_name: 'Le Plus Ancien', naf_code: '47.64Z', status: 'completed', created_at: new Date('2025-01-01') },
    ])
    const [result] = await service.resolveSimilarityHeadlines('user-1', [candidate('47.64Z')])
    expect(result).toEqual({ kind: 'sector', referenceAccount: 'Le Plus Récent' })
    expect(qb.orderBy).toHaveBeenCalledWith('account.created_at', 'DESC')
  })

  it('scope la lecture au workspace actif de l’appelant', async () => {
    const { service, qb, workspace } = await build([])
    await service.resolveSimilarityHeadlines('user-1', [candidate('47.64Z')])
    expect(workspace.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: WORKSPACE })
  })

  it('dégrade en silence plutôt que de faire échouer la découverte — écran gratuit, lecture seule', async () => {
    const { service, repo } = await build([])
    repo.createQueryBuilder.mockImplementation(() => {
      throw new Error('db down')
    })
    const result = await service.resolveSimilarityHeadlines('user-1', [candidate('47.64Z')])
    expect(result).toEqual([undefined])
  })

  it('rend un tableau dans le MÊME ORDRE que les candidats reçus', async () => {
    const { service } = await build([
      { company_name: 'Decathlon', naf_code: '47.64Z', status: 'completed', created_at: new Date('2026-01-01') },
    ])
    const result = await service.resolveSimilarityHeadlines('user-1', [
      candidate('99.99Z'),
      candidate('47.64Z'),
      candidate(null),
    ])
    expect(result).toEqual([undefined, { kind: 'sector', referenceAccount: 'Decathlon' }, undefined])
  })

  // #3238 — « Verdal remonte avec Verdal » : un candidat ne se recommande jamais lui-même.
  it('#3238 — ne cite JAMAIS le candidat lui-même comme sa référence : il passe au compte suivant du NAF', async () => {
    const { service } = await build([
      {
        company_name: 'Verdal Distribution',
        naf_code: '47.11F',
        status: 'completed',
        created_at: new Date('2026-02-01'),
      },
      { company_name: 'Decathlon', naf_code: '47.11F', status: 'completed', created_at: new Date('2026-01-01') },
    ])
    const [result] = await service.resolveSimilarityHeadlines('user-1', [
      { nafCode: '47.11F', portfolioState: 'new' as const, name: 'VERDAL DISTRIBUTION (démo)' },
    ])
    expect(result).toEqual({ kind: 'sector', referenceAccount: 'Decathlon' })
  })

  it('#3238 — sait dire NON : seul compte du NAF = le candidat lui-même → aucune référence, jamais lui-même', async () => {
    const { service } = await build([
      {
        company_name: 'Verdal Distribution',
        naf_code: '47.11F',
        status: 'completed',
        created_at: new Date('2026-02-01'),
      },
    ])
    const [result] = await service.resolveSimilarityHeadlines('user-1', [
      { nafCode: '47.11F', portfolioState: 'new' as const, name: 'Verdal Distribution' },
    ])
    expect(result).toBeUndefined()
  })
})
