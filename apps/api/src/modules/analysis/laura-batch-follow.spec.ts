import { LauraBatchFollowService, MemoryBatchStore, batchRankingBody, rankBatch } from './laura-batch-follow.service'
import type { PortfolioPriorities } from '../accounts/portfolio-priorities'

/**
 * #4462.9 — au retour des analyses lancées par Laura depuis une liste de noms, quand la DERNIÈRE se termine, le
 * classement « par où commencer » (celui du portefeuille, `portfolioPriorities`) des comptes du lot est posté.
 */
const item = (id: string, companyName: string, bucket: string, reason: string) => ({
  id,
  companyName,
  bucket,
  reason,
  stopCondition: '',
  lastActionAt: null,
  headquarters: null,
})
const priorities = {
  now: [item('a2', 'Guerbet', 'now', 'Recrute en DSI.')],
  toVerify: [item('a3', 'Théa', 'toVerify', 'Un contact manque.')],
  toWatch: [item('zz', 'Hors lot', 'toWatch', 'x')],
  notNow: [item('a1', 'Infovista', 'notNow', 'Coût trop élevé.')],
} as unknown as PortfolioPriorities

describe('rankBatch / batchRankingBody — le classement existant, restreint au lot', () => {
  it('garde l’ordre du classement du portefeuille (maintenant d’abord) et ne garde que le lot', () => {
    const lines = rankBatch(priorities, new Set(['a1', 'a2', 'a3']))
    expect(lines.map(line => line.companyName)).toEqual(['Guerbet', 'Théa', 'Infovista'])
  })

  it('le texte tutoie, numérote, et ne parle d’aucun crédit', () => {
    const body = batchRankingBody(rankBatch(priorities, new Set(['a1', 'a2', 'a3'])))
    expect(body).toContain('1. Guerbet — Recrute en DSI.')
    expect(body).toContain('3. Infovista')
    expect(body.toLowerCase()).not.toContain('crédit')
  })
})

describe('LauraBatchFollowService — la fin du lot est la fin de la DERNIÈRE analyse', () => {
  const make = () => {
    const notifications = { createNotification: jest.fn().mockResolvedValue({}) }
    const accounts = { portfolioPriorities: jest.fn().mockResolvedValue(priorities) }
    const workspaces = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1' }) }
    const service = new LauraBatchFollowService(
      new MemoryBatchStore(),
      accounts as never,
      notifications as never,
      workspaces as never,
    )
    return { service, notifications, accounts }
  }

  it('ne poste rien tant qu’une analyse du lot tourne, puis poste UNE fois à la dernière', async () => {
    const { service, notifications } = make()
    await service.follow('u1', ['a1', 'a2'], ['a3'])

    await service.settled('a1', 'u1')
    expect(notifications.createNotification).not.toHaveBeenCalled()

    await service.settled('a2', 'u1')
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
    const [userId, input] = notifications.createNotification.mock.calls[0]
    expect(userId).toBe('u1')
    expect(input.body).toContain('Guerbet')
    expect(input.body).toContain('Théa') // un compte déjà connu fait partie du lot

    await service.settled('a2', 'u1') // un événement rejoué ne poste pas deux fois
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
  })

  it('une analyse hors lot ne déclenche rien, et un lot sans analyse lancée n’attend rien', async () => {
    const { service, notifications } = make()
    await service.settled('inconnu', 'u1')
    await service.follow('u1', [], ['a3'])
    expect(notifications.createNotification).not.toHaveBeenCalled()
  })

  it('un classement illisible ne jette jamais (le worker ne doit pas échouer pour ça)', async () => {
    const { service, accounts, notifications } = make()
    accounts.portfolioPriorities.mockRejectedValue(new Error('boom'))
    await service.follow('u1', ['a1'], [])
    await expect(service.settled('a1', 'u1')).resolves.toBeUndefined()
    expect(notifications.createNotification).not.toHaveBeenCalled()
  })
})
