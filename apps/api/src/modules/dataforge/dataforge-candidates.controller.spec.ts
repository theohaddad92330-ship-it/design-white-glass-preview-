import { DataforgeCandidatesController } from './dataforge-candidates.controller'

describe('DataforgeCandidatesController — #2805 (#2291.3)', () => {
  function build() {
    const orionAccountsService = { searchCandidates: jest.fn().mockResolvedValue([]) }
    const controller = new DataforgeCandidatesController(orionAccountsService as never)
    return { controller, orionAccountsService }
  }

  it('délègue à `searchCandidates` sans critère quand aucun paramètre n’est fourni', async () => {
    const { controller, orionAccountsService } = build()
    await controller.search()
    expect(orionAccountsService.searchCandidates).toHaveBeenCalledWith({
      sector: undefined,
      minAccountPotentialScore: undefined,
      excludeSirenSirets: undefined,
      limit: undefined,
    })
  })

  it('transmet secteur, score minimal et limite, convertis en nombre', async () => {
    const { controller, orionAccountsService } = build()
    await controller.search('Banque', '80', undefined, '10')
    expect(orionAccountsService.searchCandidates).toHaveBeenCalledWith({
      sector: 'Banque',
      minAccountPotentialScore: 80,
      excludeSirenSirets: undefined,
      limit: 10,
    })
  })

  it('accepte un seul SIREN à exclure OU plusieurs, jamais une chaîne unique perdue en tableau', async () => {
    const { controller, orionAccountsService } = build()
    await controller.search(undefined, undefined, '552100554')
    expect(orionAccountsService.searchCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSirenSirets: ['552100554'] }),
    )

    await controller.search(undefined, undefined, ['552100554', '732829320'])
    expect(orionAccountsService.searchCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSirenSirets: ['552100554', '732829320'] }),
    )
  })

  it('ignore un score minimal non numérique plutôt que de planter ou d’inventer une valeur', async () => {
    const { controller, orionAccountsService } = build()
    await controller.search(undefined, 'pas-un-nombre')
    expect(orionAccountsService.searchCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ minAccountPotentialScore: undefined }),
    )
  })

  it('rend directement la liste de candidats du service', async () => {
    const { controller, orionAccountsService } = build()
    orionAccountsService.searchCandidates.mockResolvedValue([{ sourceId: 'DF-0001' }])
    await expect(controller.search()).resolves.toEqual([{ sourceId: 'DF-0001' }])
  })
})
