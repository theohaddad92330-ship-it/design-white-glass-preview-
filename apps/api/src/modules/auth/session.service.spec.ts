import { HttpException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { failure, unwrap } from '@bellum/utils'
import { AuthApiError, AuthRetryableFetchError, AuthUnknownError } from '@supabase/supabase-js'
import type { Request, Response } from 'express'
import { AuthController } from './auth.controller'
import type { AuthFailure } from './auth.types'
import { SessionService } from './session.service'
import type { SupabaseAuthGateway } from './supabase-auth.gateway'

/**
 * Session tenue 24 h (demande de Louis du 15/09/2026) — une PANNE du fournisseur
 * d'identité n'est pas un jeton invalide.
 *
 * `SessionService.refresh` rangeait TOUTE erreur de `refreshSession` sous
 * `invalid_refresh_token`, que le contrôleur rend en 401 — et un 401 sur
 * `/auth/refresh` est le seul verdict qui renvoie le navigateur à la connexion.
 * Un réseau qui hoquette au réveil, un 5xx ou un 429 du fournisseur (toutes les
 * rotations de l'API partent de la même adresse) déconnectaient donc
 * l'utilisateur. « Un timeout n'est pas un échec » : ces cas rendent 503, le
 * navigateur garde sa session et retente.
 */

type RefreshSessionResult = { data: { session: unknown; user: unknown }; error: unknown }

function serviceWith(refreshResult: RefreshSessionResult): SessionService {
  const gateway = {
    client: { auth: { refreshSession: jest.fn().mockResolvedValue(refreshResult) } },
  } as unknown as SupabaseAuthGateway
  return new SessionService(gateway, {} as never, {} as never)
}

async function failureOf(service: SessionService): Promise<AuthFailure> {
  const result = await service.refresh('rt-opaque')
  try {
    unwrap(result, (problem: AuthFailure) => {
      throw problem
    })
  } catch (problem) {
    return problem as AuthFailure
  }
  throw new Error('refresh a réussi alors qu’un échec était attendu')
}

const NO_SESSION = { session: null, user: null }

describe('SessionService.refresh — panne du fournisseur ≠ jeton invalide', () => {
  it.each([
    ['coupure réseau (AuthRetryableFetchError, statut 0)', new AuthRetryableFetchError('fetch failed', 0)],
    ['passerelle 503 (AuthRetryableFetchError)', new AuthRetryableFetchError('Service Unavailable', 503)],
    ['erreur 500 du fournisseur', new AuthApiError('Internal error', 500, 'unexpected_failure')],
    ['limitation de débit 429', new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit')],
    ['corps illisible (AuthUnknownError)', new AuthUnknownError('Unexpected token <', new Error('parse'))],
  ])('%s → auth_provider_unavailable', async (_label, error) => {
    const failure = await failureOf(serviceWith({ data: NO_SESSION, error }))
    expect(failure.code).toBe('auth_provider_unavailable')
  })

  it.each([
    ['jeton déjà utilisé', new AuthApiError('Invalid Refresh Token: Already Used', 400, 'refresh_token_already_used')],
    [
      'jeton introuvable',
      new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    ],
  ])('%s → invalid_refresh_token (le verdict qui déconnecte reste possible)', async (_label, error) => {
    const failure = await failureOf(serviceWith({ data: NO_SESSION, error }))
    expect(failure.code).toBe('invalid_refresh_token')
  })

  it('aucune erreur mais aucune session → invalid_refresh_token', async () => {
    const failure = await failureOf(serviceWith({ data: NO_SESSION, error: null }))
    expect(failure.code).toBe('invalid_refresh_token')
  })
})

describe('POST /auth/refresh — une panne du fournisseur rend 503, jamais 401', () => {
  function controllerWith(problem: AuthFailure): AuthController {
    const sessionService = { refresh: jest.fn().mockResolvedValue(failure(problem)) }
    const config = { get: () => undefined } as unknown as ConfigService
    return new AuthController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      sessionService as unknown as SessionService,
      { isRevoked: jest.fn().mockResolvedValue(false), registerAndEnforce: jest.fn() } as never,
      config,
    )
  }

  async function statusOf(controller: AuthController): Promise<number> {
    try {
      await controller.refresh({} as never, 'rt-opaque', { cookies: {}, headers: {} } as Request, {} as Response)
    } catch (error) {
      if (error instanceof HttpException) return error.getStatus()
      throw error
    }
    throw new Error('refresh a réussi alors qu’un échec était attendu')
  }

  it('auth_provider_unavailable → 503', async () => {
    // Le code vient du VRAI service, pas d'un littéral : le contrôleur et le
    // service doivent s'entendre sur le même nom.
    const service = serviceWith({ data: NO_SESSION, error: new AuthRetryableFetchError('fetch failed', 0) })
    const problem = await failureOf(service)
    expect(await statusOf(controllerWith(problem))).toBe(503)
  })

  it('invalid_refresh_token → 401 (inchangé)', async () => {
    expect(await statusOf(controllerWith({ code: 'invalid_refresh_token', message: 'x' }))).toBe(401)
  })
})
