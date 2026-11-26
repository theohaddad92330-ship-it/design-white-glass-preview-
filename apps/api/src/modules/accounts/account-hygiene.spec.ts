import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * Les contrôles de qualité, RENDUS COMPTE PAR COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'API DOIT LES RENDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cockpit sait « 7 comptes suivis sans prochaine action ». La ligne du
 * portefeuille, elle, ne sait pas si c'est ELLE. Refaire le calcul dans le
 * navigateur (« ce compte n'a aucune tâche à venir ») serait une SECONDE copie
 * de la règle : elle divergerait le jour où l'une des deux apprend quelque
 * chose — et elle diverge déjà, puisque `taskBucket` (contrats) exclut les
 * tâches `cancelled` là où le contrôle les compte comme une action programmée.
 *
 * D'où cette lecture : le serveur DÉSIGNE les comptes concernés, avec la même
 * règle que le décompte du cockpit, et l'écran ne fait que lire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `null` PLUTÔT QU'UNE LISTE VIDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une liste vide se lit « tout est propre ». Une lecture qui a échoué doit se
 * lire « je n'ai pas pu regarder ». Les deux lectures échouent séparément, comme
 * les huit lignes du cockpit.
 */
describe('AccountsService.hygieneByAccount', () => {
  let repo: MockRepository<AccountEntity>
  let service: AccountsService

  const ia = { classifyContacts: jest.fn() }
  const workspaceContext = { resolveActiveWorkspace: jest.fn() }
  const esnProfile = { read: jest.fn() }

  beforeEach(() => {
    repo = createMockRepository<AccountEntity>()
    service = new AccountsService(repo as never, ia as never, workspaceContext as never, esnProfile as never)
  })

  it('désigne les comptes suivis sans prochaine action, et les contacts sans adresse compte par compte', async () => {
    repo.manager.query
      .mockResolvedValueOnce([{ id: 'acc-1' }, { id: 'acc-2' }])
      .mockResolvedValueOnce([{ id: 'acc-2', n: 3, total: 7 }])

    const result = await service.hygieneByAccount('w1')

    expect(result.withoutNextAction).toEqual({ ids: ['acc-1', 'acc-2'], truncated: false })
    expect(result.contactsWithoutEmail).toEqual({
      byAccount: { 'acc-2': { count: 3, total: 7 } },
      truncated: false,
    })
  })

  it('scope les deux lectures sur l’espace de travail', async () => {
    repo.manager.query.mockResolvedValue([])

    await service.hygieneByAccount('w1')

    for (const call of repo.manager.query.mock.calls) {
      const [sql, params] = call as [string, unknown[]]
      expect(sql).toContain('workspace_id = $1')
      expect(params[0]).toBe('w1')
    }
  })

  it('rend `null` — jamais un tableau vide — quand la lecture des comptes échoue', async () => {
    repo.manager.query.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce([])

    const result = await service.hygieneByAccount('w1')

    expect(result.withoutNextAction).toBeNull()
    // L'autre lecture a abouti : une requête cassée n'efface pas l'autre.
    expect(result.contactsWithoutEmail).toEqual({ byAccount: {}, truncated: false })
  })

  it('rend `null` sur les contacts quand SEULE cette lecture échoue', async () => {
    repo.manager.query.mockResolvedValueOnce([{ id: 'acc-1' }]).mockRejectedValueOnce(new Error('db down'))

    const result = await service.hygieneByAccount('w1')

    expect(result.withoutNextAction).toEqual({ ids: ['acc-1'], truncated: false })
    expect(result.contactsWithoutEmail).toBeNull()
  })

  it('dit quand la lecture a été BORNÉE — au-delà, l’absence d’un compte ne veut plus rien dire', async () => {
    const full = Array.from({ length: 2000 }, (_, index) => ({ id: `acc-${index}` }))
    repo.manager.query.mockResolvedValueOnce(full).mockResolvedValueOnce([])

    const result = await service.hygieneByAccount('w1')

    expect(result.withoutNextAction?.truncated).toBe(true)
    // La borne de l'une ne rend pas l'autre muette.
    expect(result.contactsWithoutEmail?.truncated).toBe(false)
  })

  it('ignore une ligne de contacts dont le compte n’est pas identifiable', async () => {
    repo.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: null, n: 2, total: 2 },
      { id: 'acc-3', n: 1, total: 4 },
    ])

    const result = await service.hygieneByAccount('w1')

    expect(result.contactsWithoutEmail?.byAccount).toEqual({ 'acc-3': { count: 1, total: 4 } })
  })
})
