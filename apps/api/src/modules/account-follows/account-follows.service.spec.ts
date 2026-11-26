import { ConflictException } from '@nestjs/common'
import { ACCOUNT_FOLLOW_CAP_REACHED, ACCOUNT_FOLLOW_MAX_PER_USER } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository } from '../../database/test-utils'
import type { AccountFollowEntity } from './account-follow.entity'
import { AccountFollowsService } from './account-follows.service'

/**
 * #4267 — le suivi explicite. Ce que ces tests doivent savoir dire NON :
 *  · le 4e suivi est REFUSÉ (409, code reconnaissable, message qui tutoie) et rien n'est écrit ;
 *  · un utilisateur qui ne suit rien reçoit SON compte analysé le plus récent, et pas de proposition
 *    dès qu'il suit quelque chose ;
 *  · « Ne plus suivre » archive, ne supprime pas.
 */
type Row = Partial<AccountFollowEntity> & { user_id: string; account_id: string }

function build(options: { active: number; existing?: Row | null }) {
  const follows = createMockRepository<AccountFollowEntity>()
  const accounts = createMockRepository<AccountEntity>()
  const repo = {
    findOne: jest.fn().mockResolvedValue(options.existing ?? null),
    save: jest.fn(async (row: Row) => row),
    create: jest.fn((row: Row) => row),
  }
  const manager = {
    query: jest.fn(async (sql: string) => (sql.includes('count(*)') ? [{ count: options.active }] : [])),
    getRepository: jest.fn(() => repo),
  }
  Object.assign(follows, { manager: { transaction: jest.fn(async (fn: (m: unknown) => unknown) => fn(manager)) } })
  const service = new AccountFollowsService(follows as never, accounts as never)
  return { service, follows, accounts, repo, manager }
}

describe('AccountFollowsService.follow — le plafond par utilisateur (4267.3)', () => {
  it('suit un compte sous le plafond, sous verrou transactionnel PAR UTILISATEUR', async () => {
    const { service, repo, manager } = build({ active: ACCOUNT_FOLLOW_MAX_PER_USER - 1 })

    const state = await service.follow('u1', 'ws-1', 'acc-9')

    expect(state).toEqual({ account_id: 'acc-9', followed: true, followed_count: ACCOUNT_FOLLOW_MAX_PER_USER })
    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['account_follows:u1'])
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', workspace_id: 'ws-1', account_id: 'acc-9' }),
    )
  })

  it('REFUSE le 4e suivi : 409, code reconnaissable, message qui tutoie — et rien n’est écrit', async () => {
    const { service, repo } = build({ active: ACCOUNT_FOLLOW_MAX_PER_USER })

    const refusal = await service.follow('u1', 'ws-1', 'acc-4').catch((err: unknown) => err)

    expect(refusal).toBeInstanceOf(ConflictException)
    expect((refusal as ConflictException).getResponse()).toEqual({
      code: ACCOUNT_FOLLOW_CAP_REACHED,
      message: '3 comptes suivis au maximum — retire-en un pour suivre celui-ci.',
    })
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('re-suivre un compte DÉJÀ suivi n’est pas un 4e suivi (idempotent, même au plafond)', async () => {
    const { service, repo } = build({
      active: ACCOUNT_FOLLOW_MAX_PER_USER,
      existing: { user_id: 'u1', account_id: 'acc-1', archived_at: null },
    })

    await expect(service.follow('u1', 'ws-1', 'acc-1')).resolves.toEqual({
      account_id: 'acc-1',
      followed: true,
      followed_count: ACCOUNT_FOLLOW_MAX_PER_USER,
    })
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('re-suivre un compte archivé RÉACTIVE sa ligne (un clic), sans en créer une seconde', async () => {
    const archived: Row = {
      id: 'f-1',
      user_id: 'u1',
      account_id: 'acc-2',
      archived_at: new Date('2026-10-18T00:00:00Z'),
      archived_reason: 'migration_cap',
    }
    const { service, repo } = build({ active: 1, existing: archived })

    await service.follow('u1', 'ws-1', 'acc-2')

    expect(repo.create).not.toHaveBeenCalled()
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f-1', archived_at: null, archived_reason: null }),
    )
  })
})

describe('AccountFollowsService.unfollow — on archive, on ne supprime pas', () => {
  it('pose archived_at + `unfollowed` sur la ligne active, jamais un DELETE', async () => {
    const { service, follows } = build({ active: 0 })
    ;(follows.query as jest.Mock).mockResolvedValue([{ count: 0 }])

    const state = await service.unfollow('u1', 'acc-1')

    expect(state).toEqual({ account_id: 'acc-1', followed: false, followed_count: 0 })
    expect(follows._qb.update).toHaveBeenCalled()
    expect(follows._qb.set).toHaveBeenCalledWith(expect.objectContaining({ archived_reason: 'unfollowed' }))
    expect(follows._qb.delete).not.toHaveBeenCalled()
  })
})

describe('AccountFollowsService.list — personne n’est suivi par défaut (4267.1 / 4267.2 / 4267.4)', () => {
  const row = (over: Record<string, unknown>) => ({
    account_id: 'acc-1',
    company_name: 'Nordia',
    sector: 'Services',
    followed_at: new Date('2026-10-10T00:00:00Z'),
    archived_at: null,
    archived_reason: null,
    notice_seen_at: null,
    ...over,
  })

  it('ne suit rien → propose SON compte analysé le plus récent (une carte), dans l’espace actif', async () => {
    const { service, accounts } = build({ active: 0 })
    ;(accounts.findOne as jest.Mock).mockResolvedValue({
      id: 'acc-7',
      company_name: 'Velmore',
      sector: null,
      created_at: new Date('2026-10-17T09:00:00Z'),
    })

    const view = await service.list('u1', 'ws-1')

    expect(view.followed).toEqual([])
    expect(view.suggestion).toEqual({
      account_id: 'acc-7',
      company_name: 'Velmore',
      sector: null,
      analyzed_at: '2026-10-17T09:00:00.000Z',
    })
    expect(accounts.findOne).toHaveBeenCalledWith({
      where: { user_id: 'u1', workspace_id: 'ws-1', status: 'completed' },
      order: { created_at: 'DESC' },
    })
  })

  it('ne suit rien ET n’a aucun compte analysé → aucune proposition (l’écran renvoie vers l’analyse)', async () => {
    const { service, accounts } = build({ active: 0 })
    ;(accounts.findOne as jest.Mock).mockResolvedValue(null)

    expect((await service.list('u1', 'ws-1')).suggestion).toBeNull()
  })

  it('suit déjà un compte → aucune proposition, et la base n’est même pas relue pour elle', async () => {
    const { service, follows, accounts } = build({ active: 1 })
    follows._qb.getRawMany.mockResolvedValueOnce([row({})])

    const view = await service.list('u1', 'ws-1')

    expect(view.followed.map(item => item.account_id)).toEqual(['acc-1'])
    expect(view.suggestion).toBeNull()
    expect(accounts.findOne).not.toHaveBeenCalled()
  })

  it('la reprise se dit UNE fois : notice tant qu’un archivage `migration_cap` n’a pas été lu', async () => {
    const { service, follows } = build({ active: 1 })
    follows._qb.getRawMany.mockResolvedValueOnce([
      row({}),
      row({ account_id: 'acc-2', archived_at: new Date(), archived_reason: 'migration_cap' }),
    ])
    const unread = await service.list('u1', 'ws-1')
    expect(unread.migration_notice).toBe(true)
    expect(unread.archived.map(item => item.account_id)).toEqual(['acc-2'])

    follows._qb.getRawMany.mockResolvedValueOnce([
      row({}),
      row({
        account_id: 'acc-2',
        archived_at: new Date(),
        archived_reason: 'migration_cap',
        notice_seen_at: new Date(),
      }),
    ])
    expect((await service.list('u1', 'ws-1')).migration_notice).toBe(false)
  })

  it('ne lit que les lignes de l’appelant', async () => {
    const { service, follows } = build({ active: 0 })
    await service.list('u1', 'ws-1')
    expect(follows._qb.where).toHaveBeenCalledWith('follow.user_id = :userId', { userId: 'u1' })
  })

  // N-SUIVIS (#4538) — le suivi est PAR UTILISATEUR : un collègue du même espace obtient SA liste, jamais celle du premier.
  it('un second utilisateur du même espace est lu par SON identifiant, jamais par celui du premier', async () => {
    const { service, follows } = build({ active: 0 })
    await service.list('u1', 'ws-1')
    await service.list('u2', 'ws-1')
    const calls = follows._qb.where.mock.calls.filter(([clause]: [string]) => clause === 'follow.user_id = :userId')
    expect(calls.map(([, params]: [string, { userId: string }]) => params.userId)).toEqual(['u1', 'u2'])
  })

  // #4283.8 — chaque compte suivi dit sa dernière analyse et la prochaine, calculées du VRAI champ.
  it('chaque suivi porte sa dernière analyse et la date de la prochaine (15 jours, jour de Paris)', async () => {
    const { service, follows } = build({ active: 1 })
    follows._qb.getRawMany.mockResolvedValueOnce([row({ last_analysis_at: new Date('2026-10-10T08:00:00Z') })])
    const { followed } = await service.list('u1', 'ws-1')
    expect(followed[0]).toMatchObject({
      last_analyzed_at: '2026-10-10T08:00:00.000Z',
      next_reanalysis_at: '2026-10-25',
      next_reanalysis_reason: null,
    })
  })

  it('SAIT DIRE NON : jamais analysé ⇒ aucune date inventée, et la raison est dite', async () => {
    const { service, follows } = build({ active: 1 })
    follows._qb.getRawMany.mockResolvedValueOnce([row({ last_analysis_at: null })])
    const { followed } = await service.list('u1', 'ws-1')
    expect(followed[0]).toMatchObject({
      last_analyzed_at: null,
      next_reanalysis_at: null,
      next_reanalysis_reason: 'never_analyzed',
    })
  })
})
