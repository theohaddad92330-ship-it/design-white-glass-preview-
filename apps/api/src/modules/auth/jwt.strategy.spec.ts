import { UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { DEVICE_COOKIE_NAME } from './device-cookie'
import { JwtStrategy } from './jwt.strategy'
import type { SessionRegistryService } from './session-registry.service'

const config = { get: (_k: string, d?: unknown) => d ?? '' } as unknown as ConfigService

function makeStrategy(isRevoked: jest.Mock) {
  const sessions = { isRevoked } as unknown as SessionRegistryService
  return new JwtStrategy(config, sessions)
}

function req(deviceId?: string): Request {
  return { cookies: deviceId ? { [DEVICE_COOKIE_NAME]: deviceId } : {} } as unknown as Request
}

const PAYLOAD = { sub: 'user-1', email: 'u@x.com', aud: 'authenticated' }

describe('JwtStrategy — révocation par requête (finding #6)', () => {
  const OLD = process.env['NODE_ENV']
  beforeAll(() => {
    process.env['NODE_ENV'] = 'test'
  })
  afterAll(() => {
    process.env['NODE_ENV'] = OLD
  })

  it('laisse passer une session non révoquée', async () => {
    const isRevoked = jest.fn().mockResolvedValue(false)
    const strategy = makeStrategy(isRevoked)
    await expect(strategy.validate(req('dev-1'), PAYLOAD)).resolves.toEqual({ userId: 'user-1', email: 'u@x.com' })
    expect(isRevoked).toHaveBeenCalledWith('user-1', 'dev-1', undefined)
  })

  it('SÉCURITÉ — refuse (401) une session révoquée, même avec un jeton valide', async () => {
    const isRevoked = jest.fn().mockResolvedValue(true)
    const strategy = makeStrategy(isRevoked)
    await expect(strategy.validate(req('dev-1'), PAYLOAD)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  // R15-7 (15/09/2026) — l'appareil révoqué doit pouvoir le DIRE : le client
  // reconnaît la révocation à ce code, jamais à la phrase, et ne relance pas de refresh.
  it('la 401 de révocation porte le code machine `session_revoked`', async () => {
    const isRevoked = jest.fn().mockResolvedValue(true)
    const strategy = makeStrategy(isRevoked)
    const error: unknown = await strategy.validate(req('dev-1'), PAYLOAD).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnauthorizedException)
    expect((error as UnauthorizedException).getResponse()).toMatchObject({ code: 'session_revoked' })
  })

  // Audit H2 : l'absence de cookie ne désactive plus la révocation ; elle se
  // rattache au jeton (iat) côté registre.
  it('SÉCURITÉ H2 — jeton d’un compte aux sessions révoquées, SANS cookie : 401 session_revoked', async () => {
    const isRevoked = jest.fn().mockResolvedValue(true)
    const strategy = makeStrategy(isRevoked)
    const error: unknown = await strategy.validate(req(), { ...PAYLOAD, iat: 1_780_000_000 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnauthorizedException)
    expect((error as UnauthorizedException).getResponse()).toMatchObject({ code: 'session_revoked' })
    expect(isRevoked).toHaveBeenCalledWith('user-1', null, new Date(1_780_000_000 * 1000))
  })

  it('jeton valide sans cookie (Bearer, mobile, MCP) : 200', async () => {
    const isRevoked = jest.fn().mockResolvedValue(false)
    const strategy = makeStrategy(isRevoked)
    await expect(strategy.validate(req(), { ...PAYLOAD, iat: 1_780_000_000 })).resolves.toEqual({
      userId: 'user-1',
      email: 'u@x.com',
    })
  })

  it('le cache des non-révoqués est borné (clé choisie par l’appelant)', async () => {
    const isRevoked = jest.fn().mockResolvedValue(false)
    const strategy = makeStrategy(isRevoked)
    for (let i = 0; i < 6000; i++) await strategy.validate(req(`dev-${i}`), PAYLOAD)
    expect((strategy as unknown as { notRevokedCache: Map<string, number> }).notRevokedCache.size).toBeLessThanOrEqual(
      5000,
    )
  })

  it('fail-open : une erreur base ne déconnecte pas (laisse passer)', async () => {
    const isRevoked = jest.fn().mockRejectedValue(new Error('db down'))
    const strategy = makeStrategy(isRevoked)
    await expect(strategy.validate(req('dev-1'), PAYLOAD)).resolves.toEqual({ userId: 'user-1', email: 'u@x.com' })
  })

  it('met en cache le résultat « non révoquée » (une seule lecture base par fenêtre)', async () => {
    const isRevoked = jest.fn().mockResolvedValue(false)
    const strategy = makeStrategy(isRevoked)
    await strategy.validate(req('dev-1'), PAYLOAD)
    await strategy.validate(req('dev-1'), PAYLOAD)
    expect(isRevoked).toHaveBeenCalledTimes(1)
  })
})
