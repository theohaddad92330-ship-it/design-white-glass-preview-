import { HttpException } from '@nestjs/common'
import type { ArgumentsHost } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import type { DataSource } from 'typeorm'
import { GlobalExceptionFilter } from './global-exception.filter'
import { InsufficientRoleException } from './insufficient-role.exception'

/**
 * Épopée #2879 (#2442.14 / #2442.15) — le premier compteur de sécurité du
 * dépôt : chaque 401/403 qui traverse ce filtre (le SEUL chokepoint commun à
 * toute l'API) écrit une ligne `security_events`, lue ensuite par
 * `ObservabilityAlertsService` pour l'alerte « accès refusés ».
 *
 * Ce que ces tests défendent : l'écriture est BEST-EFFORT — elle ne doit
 * jamais retarder ni casser la réponse d'erreur déjà en cours (même
 * discipline que la persistance d'un tour de chat) — et elle ne compte QUE
 * les deux statuts qui désignent un accès refusé, jamais un 404 ou un 500.
 */
describe('GlobalExceptionFilter — épopée #2879, le compteur d’accès refusés', () => {
  const build = (query: jest.Mock) => {
    const dataSource = { query } as unknown as DataSource
    const filter = new GlobalExceptionFilter(dataSource)
    // `super.catch()` (BaseExceptionFilter) parle à Express directement ; on le
    // neutralise pour isoler ce que CE filtre ajoute, comme les tests voisins
    // de `all-exceptions.filter.spec.ts` neutralisent `httpAdapter.reply`.
    jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined)
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', originalUrl: '/auth/session?token=abc', route: { path: '/auth/session' } }),
        getResponse: () => ({}),
      }),
    } as unknown as ArgumentsHost
    return { filter, host, query }
  }

  afterEach(() => jest.restoreAllMocks())

  it('un 401 écrit une ligne — la ROUTE seule, jamais la query string', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    const { filter, host } = build(query)

    filter.catch(new HttpException('Unauthorized', 401), host)
    await Promise.resolve() // laisse le `.catch()` fire-and-forget se résoudre

    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO security_events'), [
      'authorization_denied',
      401,
      '/auth/session',
    ])
  })

  it('un 403 écrit aussi une ligne', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    const { filter, host } = build(query)

    filter.catch(new HttpException('Forbidden', 403), host)
    await Promise.resolve()

    expect(query.mock.calls[0]![1]).toEqual(['authorization_denied', 403, '/auth/session'])
  })

  it('#2442.14 — un 403 « rôle insuffisant » typé s’écrit permission_escalated, pas authorization_denied', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    const { filter, host } = build(query)

    filter.catch(new InsufficientRoleException(), host)
    await Promise.resolve()

    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]![1]).toEqual(['permission_escalated', 403, '/auth/session'])
  })

  it('#2442.14 — un 403 ordinaire reste authorization_denied', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    const { filter, host } = build(query)

    filter.catch(new HttpException('Forbidden', 403), host)
    await Promise.resolve()

    expect(query.mock.calls[0]![1][0]).toBe('authorization_denied')
  })

  it('un 404 n’écrit RIEN — ce compteur ne vise que l’accès refusé', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    const { filter, host } = build(query)

    filter.catch(new HttpException('Not Found', 404), host)
    await Promise.resolve()

    expect(query).not.toHaveBeenCalled()
  })

  it('un 500 n’écrit rien dans ce compteur — c’est une erreur, pas un refus d’accès', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    const { filter, host } = build(query)

    filter.catch(new Error('boom'), host)
    await Promise.resolve()

    expect(query).not.toHaveBeenCalled()
  })

  it('une écriture qui échoue ne fait PAS échouer la réponse déjà en cours', () => {
    const query = jest.fn().mockRejectedValue(new Error('connection refused'))
    const { filter, host } = build(query)

    expect(() => filter.catch(new HttpException('Unauthorized', 401), host)).not.toThrow()
  })
})
