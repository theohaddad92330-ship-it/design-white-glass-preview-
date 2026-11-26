import { AccountsService } from './accounts.service'

/**
 * Le cloisonnement de portefeuille est réellement APPLIQUÉ à la requête.
 *
 * La règle elle-même est une fonction pure, testée dans les contrats. Ce qui se
 * teste ici est l'autre moitié — et c'est celle qui manque le plus souvent :
 * une règle calculée correctement mais jamais transmise à la requête laisse
 * l'écran afficher tout le portefeuille, avec des tests verts partout.
 *
 * Deux propriétés :
 *  - sans cloisonnement, la requête est BYTE-IDENTIQUE à celle d'avant ;
 *  - avec cloisonnement, la clause porte « ce que je porte OU ce que personne
 *    ne porte » — les deux moitiés, pas seulement la première.
 */
describe('AccountsService.findAccountsByWorkspace — cloisonnement', () => {
  const build = () => {
    const qb = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      select: jest.fn(() => qb),
      addSelect: jest.fn(() => qb),
      leftJoin: jest.fn(() => qb),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getRawMany: jest.fn().mockResolvedValue([]),
    }
    const accounts = { createQueryBuilder: jest.fn(() => qb) }
    return { service: new AccountsService(accounts as never, {} as never, {} as never, {} as never), qb }
  }

  const scopeClauses = (qb: { andWhere: jest.Mock }) =>
    (qb.andWhere.mock.calls as unknown[][])
      .map(call => String(call[0]))
      .filter(clause => clause.includes('assigned_to'))

  it('n’ajoute AUCUNE clause de portefeuille sans cloisonnement', async () => {
    const { service, qb } = build()

    await service.findAccountsByWorkspace('w-1', {}, null)

    expect(scopeClauses(qb)).toEqual([])
  })

  it('restreint aux comptes portés par le membre', async () => {
    const { service, qb } = build()

    await service.findAccountsByWorkspace('w-1', {}, { ownerId: 'u-1', includeUnassigned: true })

    expect(scopeClauses(qb)).toHaveLength(1)
    expect(scopeClauses(qb)[0]).toContain('account.assigned_to = :ownerId')
  })

  it('laisse voir les comptes LIBRES — sans ça, la file des non-attribués se vide pour tout le monde', async () => {
    const { service, qb } = build()

    await service.findAccountsByWorkspace('w-1', {}, { ownerId: 'u-1', includeUnassigned: true })

    expect(scopeClauses(qb)[0]).toContain('account.assigned_to IS NULL')
  })

  it('passe l’identifiant du porteur en PARAMÈTRE, jamais interpolé dans le SQL', async () => {
    const { service, qb } = build()

    await service.findAccountsByWorkspace('w-1', {}, { ownerId: 'u-1', includeUnassigned: true })

    const call = (qb.andWhere.mock.calls as unknown[][]).find(entry => String(entry[0]).includes('assigned_to'))
    expect(call?.[1]).toEqual({ ownerId: 'u-1' })
  })

  it('garde le filtre d’espace en plus du cloisonnement — le second ne remplace pas le premier', async () => {
    const { service, qb } = build()

    await service.findAccountsByWorkspace('w-1', {}, { ownerId: 'u-1', includeUnassigned: true })

    expect(qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'w-1' })
  })
})
