import { SkillAliasService } from './skill-alias.service'

/**
 * La bibliothèque d'alias partagée entre espaces (D18, réouverte le 21/08).
 *
 * Ce qui compte ici n'est pas le partage — c'est ce qu'il NE fait PAS. Un alias
 * validé ailleurs arrive comme une SUGGESTION : le vocabulaire d'une ESN cyber
 * n'est pas celui d'une ESN data, et imposer un rapprochement ferait remonter
 * des profils sur un mot qu'ils n'ont jamais écrit.
 */
describe('bibliothèque d’alias partagée', () => {
  let repo: { findOne: jest.Mock; save: jest.Mock; find: jest.Mock; manager: { query: jest.Mock } }
  let service: SkillAliasService

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(async row => row),
      find: jest.fn().mockResolvedValue([]),
      manager: { query: jest.fn().mockResolvedValue([]) },
    }
    service = new SkillAliasService(repo as never)
  })

  it('un alias APPROUVÉ alimente la bibliothèque', async () => {
    repo.findOne.mockResolvedValue({ id: 'a-1', workspace_id: 'w-1', raw_term: 'reactjs', canonical_term: null })
    await service.decide('a-1', 'w-1', 'u-1', 'approved', 'React')
    const insert = repo.manager.query.mock.calls.find(call => String(call[0]).includes('skill_alias_library'))
    expect(insert).toBeDefined()
    expect(String(insert?.[0])).toContain('workspaces_approved + 1')
  })

  it('un alias REJETÉ ne partage rien', async () => {
    // Un « non » est une information locale : le terme ne veut peut-être rien
    // dire ici, et ça n'apprend rien aux autres.
    repo.findOne.mockResolvedValue({ id: 'a-1', workspace_id: 'w-1', raw_term: 'elk', canonical_term: 'elastic' })
    await service.decide('a-1', 'w-1', 'u-1', 'rejected')
    expect(repo.manager.query.mock.calls.some(call => String(call[0]).includes('skill_alias_library'))).toBe(false)
  })

  it('un partage en échec ne fait PAS échouer la décision', async () => {
    // Le partage est un bonus, jamais une condition de la décision qu'on vient
    // de prendre pour son propre espace.
    repo.findOne.mockResolvedValue({ id: 'a-1', workspace_id: 'w-1', raw_term: 'k8s', canonical_term: null })
    repo.manager.query.mockRejectedValue(new Error('table absente'))
    const result = await service.decide('a-1', 'w-1', 'u-1', 'approved', 'Kubernetes')
    expect(result?.status).toBe('approved')
  })

  it('les suggestions EXCLUENT ce que l’espace a déjà tranché', async () => {
    // Reproposer un terme qu'on a déjà rejeté apprend à ignorer la liste.
    repo.manager.query.mockResolvedValue([{ raw_term: 'reactjs', canonical_term: 'react', workspaces_approved: 12 }])
    const out = await service.librarySuggestions('w-1')
    expect(out).toEqual([{ rawTerm: 'reactjs', canonicalTerm: 'react', workspacesApproved: 12 }])
    expect(String(repo.manager.query.mock.calls[0]?.[0])).toContain('NOT EXISTS')
  })

  it('sans espace, aucune suggestion — et aucune requête', async () => {
    expect(await service.librarySuggestions(null)).toEqual([])
    expect(repo.manager.query).not.toHaveBeenCalled()
  })

  it('une bibliothèque illisible rend une liste vide, jamais une erreur', async () => {
    repo.manager.query.mockRejectedValue(new Error('boom'))
    expect(await service.librarySuggestions('w-1')).toEqual([])
  })
})
