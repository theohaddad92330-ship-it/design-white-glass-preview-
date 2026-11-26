import { UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { success } from '@bellum/utils'
import type { Request, Response } from 'express'
import { AuthController } from './auth.controller'
import { DEVICE_COOKIE_NAME } from './device-cookie'

const config = { get: (_k: string, d?: unknown) => d } as unknown as ConfigService

const SESSION = { user: { id: 'user-1' }, expires_at: 1 }

function makeController(isRevoked: jest.Mock) {
  const sessionService = { refresh: jest.fn().mockResolvedValue(success(SESSION)) }
  const registry = { isRevoked, registerAndEnforce: jest.fn().mockResolvedValue(undefined) }
  const controller = new AuthController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    sessionService as never,
    registry as never,
    config,
  )
  return { controller, registry }
}

const req = { cookies: { [DEVICE_COOKIE_NAME]: 'dev-1' }, headers: {}, ip: null } as unknown as Request
const res = { cookie: jest.fn() } as unknown as Response

/**
 * R15-7 (15/09/2026) — le refresh d'un appareil RÉVOQUÉ (plafond d'appareils,
 * ou « déconnecter cet appareil » depuis un autre) rend une 401 qui porte le
 * code machine `session_revoked`. Sans lui, le client ne distinguait pas la
 * révocation d'un jeton expiré et l'onglet restait une coquille vide.
 */
describe('AuthController.refresh — appareil révoqué', () => {
  it('rend une 401 `session_revoked` et ne ré-enregistre PAS l’appareil', async () => {
    const { controller, registry } = makeController(jest.fn().mockResolvedValue(true))

    const error: unknown = await controller.refresh({}, 'refresh-token', req, res).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UnauthorizedException)
    expect((error as UnauthorizedException).getResponse()).toMatchObject({ code: 'session_revoked' })
    expect(registry.registerAndEnforce).not.toHaveBeenCalled()
  })

  it('NON — un appareil non révoqué obtient sa session et reste enregistré', async () => {
    const { controller, registry } = makeController(jest.fn().mockResolvedValue(false))

    await expect(controller.refresh({}, 'refresh-token', req, res)).resolves.toEqual(SESSION)
    expect(registry.registerAndEnforce).toHaveBeenCalledWith('user-1', 'dev-1', null, null)
  })

  it('fail-open conservé : une erreur base au contrôle de révocation ne déconnecte pas', async () => {
    const { controller } = makeController(jest.fn().mockRejectedValue(new Error('db down')))

    await expect(controller.refresh({}, 'refresh-token', req, res)).resolves.toEqual(SESSION)
  })
})
