import {
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { failure, success } from '@bellum/utils'
import type { Request, Response } from 'express'
import type { BackofficeAlertDispatchService } from '../backoffice-alerts/backoffice-alert-dispatch.service'
import { DEVICE_COOKIE_NAME } from '../auth/device-cookie'
import type { SessionRegistryService } from '../auth/session-registry.service'
import type { DemoLeadEntity } from '../../database/entities/demo-lead.entity'
import type { DemoLeadService } from './demo-lead.service'
import { DemoController } from './demo.controller'
import type { DemoLinkService } from './demo-link.service'

const session = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_at: 1_800_000_000,
  user: { id: 'demo-user', email: 'demo@bellum-ai.com' },
}

const config = { get: jest.fn(() => undefined) } as unknown as ConfigService

function fakeDemoLead(overrides: Partial<DemoLeadService> = {}) {
  return {
    registerOrTouch: jest.fn(),
    touchByDevice: jest.fn(),
    ...overrides,
  } as unknown as DemoLeadService
}

function fakeAlerts(overrides: Partial<BackofficeAlertDispatchService> = {}) {
  return {
    dispatch: jest.fn(async () => ({ action: 'send' as const, reason: 'first_time', channel: 'email' as const })),
    ...overrides,
  } as unknown as BackofficeAlertDispatchService
}

function controller(
  redeem: jest.Mock,
  isEnabled = jest.fn(() => true),
  demoLead: DemoLeadService = fakeDemoLead(),
  alerts: BackofficeAlertDispatchService = fakeAlerts(),
  registry: SessionRegistryService = {
    registerAndEnforce: jest.fn(async () => undefined),
  } as unknown as SessionRegistryService,
) {
  return new DemoController({ redeem, isEnabled } as unknown as DemoLinkService, config, demoLead, alerts, registry)
}

/** Navigateur : `cookies` en entrée, `cookie()` en sortie. */
function browser(existingDeviceId?: string) {
  const setCookies: { name: string; value: string }[] = []
  const req = {
    cookies: existingDeviceId ? { [DEVICE_COOKIE_NAME]: existingDeviceId } : {},
    headers: {},
  } as unknown as Request
  const res = {
    cookie: jest.fn((name: string, value: string) => {
      setCookies.push({ name, value })
    }),
  } as unknown as Response
  return { req, res, setCookies }
}

describe('DemoController', () => {
  // 30/09 : navigateur déconnecté de la salle → ligne (salle, appareil) révoquée ;
  // la salle réutilisée rendait un jeton rejeté par « Session révoquée sur cet
  // appareil ». Une NOUVELLE session démo ré-enregistre l'appareil (lève
  // revoked_at) ; l'ancien refresh token reste mort.
  it('re-registers the device for the demo user, lifting a stale revocation', async () => {
    const registerAndEnforce = jest.fn(async () => undefined)
    const registry = { registerAndEnforce } as unknown as SessionRegistryService
    const { req, res } = browser('device-A')

    await controller(
      jest.fn(async () => success(session)),
      undefined,
      undefined,
      undefined,
      registry,
    ).session({ token: 'tok' }, req, res)

    expect(registerAndEnforce).toHaveBeenCalledWith(session.user.id, 'device-A', null, null)
  })

  it('still signs in when the registry fails (best-effort)', async () => {
    const registry = {
      registerAndEnforce: jest.fn(async () => {
        throw new Error('db')
      }),
    } as unknown as SessionRegistryService
    const { req, res } = browser('device-A')

    const result = await controller(
      jest.fn(async () => success(session)),
      undefined,
      undefined,
      undefined,
      registry,
    ).session({ token: 'tok' }, req, res)

    expect(result).toEqual(session)
  })

  it('returns the minted session so the cookie interceptor can write it', async () => {
    const redeem = jest.fn(async () => success(session))
    const { req, res } = browser('device-A')

    const result = await controller(redeem).session({ token: 'tok' }, req, res)

    expect(redeem).toHaveBeenCalledWith('tok', 'device-A', 'staffing')
    expect(result).toEqual(session)
  })

  it('#4291 J — « Lancer la démo forfait / conseil » : même jeton, même appareil, la variante forfait', async () => {
    const redeem = jest.fn(async () => success(session))
    const { req, res } = browser('device-A')

    await controller(redeem).session({ token: 'tok', profile: 'forfait_conseil' }, req, res)

    expect(redeem).toHaveBeenCalledWith('tok', 'device-A', 'forfait_conseil')
  })

  it('mints a device cookie for a first-time visitor — that is what pins them to a room', async () => {
    const redeem = jest.fn(async () => success(session))
    const { req, res, setCookies } = browser()

    await controller(redeem).session({ token: 'tok' }, req, res)

    expect(setCookies[0]?.name).toBe(DEVICE_COOKIE_NAME)
    expect(redeem).toHaveBeenCalledWith('tok', setCookies[0]?.value, 'staffing')
  })

  it('404s when the demo is not configured — probing reveals nothing', async () => {
    const redeem = jest.fn(async () => failure({ code: 'demo_disabled', message: 'nope' }))
    const { req, res } = browser()

    await expect(controller(redeem).session({ token: 'tok' }, req, res)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('401s on a wrong token', async () => {
    const redeem = jest.fn(async () => failure({ code: 'invalid_token', message: 'nope' }))
    const { req, res } = browser()

    await expect(controller(redeem).session({ token: 'bad' }, req, res)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('503s when no demo workspace has been provisioned', async () => {
    const redeem = jest.fn(async () => failure({ code: 'no_demo_workspace', message: 'nope' }))
    const { req, res } = browser()

    await expect(controller(redeem).session({ token: 'tok' }, req, res)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })

  it('#3578 — « la démo se prépare » : 503 NOMMÉ (code + délai), jamais une 500', async () => {
    const redeem = jest.fn(async () =>
      failure({ code: 'demo_preparing' as const, message: 'se prépare', retryAfterSeconds: 15 }),
    )
    const { req, res } = browser()

    const error = await controller(redeem)
      .session({ token: 'tok' }, req, res)
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ServiceUnavailableException)
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'demo_preparing',
      retryAfterSeconds: 15,
    })
  })

  it('500s when the session could not be minted', async () => {
    const redeem = jest.fn(async () => failure({ code: 'session_failed', message: 'nope' }))
    const { req, res } = browser()

    await expect(controller(redeem).session({ token: 'tok' }, req, res)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    )
  })

  it('reports whether the demo entry point exists on this deployment', () => {
    expect(
      controller(
        jest.fn(),
        jest.fn(() => false),
      ).status(),
    ).toEqual({ enabled: false })
    expect(
      controller(
        jest.fn(),
        jest.fn(() => true),
      ).status(),
    ).toEqual({ enabled: true })
  })
})

const LEAD_DTO = {
  firstName: 'Marie',
  lastName: 'Dupont',
  email: 'marie.dupont@acme.fr',
  jobTitle: 'sales_director' as const,
  company: 'Acme',
}

const LEAD = {
  id: 'lead-1',
  first_name: 'Marie',
  last_name: 'Dupont',
  email: 'marie.dupont@acme.fr',
  company: 'Acme',
  job_title: 'sales_director',
  phone: null,
  device_id: 'device-1',
  source: 'demo',
  first_access_at: new Date('2026-09-22T10:00:00.000Z'),
  last_access_at: new Date('2026-09-22T10:00:00.000Z'),
  access_count: 1,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_term: null,
  utm_content: null,
} as unknown as DemoLeadEntity

// #2705.4/#2707.2 — POST /demo/lead : enregistre le lead, et déclenche
// l'alerte #2707 SEULEMENT à la création.
describe('DemoController.createLead', () => {
  it('enregistre le lead et déclenche l’alerte à la création', async () => {
    const registerOrTouch = jest.fn(async () => ({ created: true, lead: LEAD }))
    const dispatch = jest.fn(async (_input: Parameters<BackofficeAlertDispatchService['dispatch']>[0]) => ({
      action: 'send' as const,
      reason: 'first_time',
      channel: 'email' as const,
    }))
    const { req, res } = browser()

    const result = await controller(jest.fn(), jest.fn(), fakeDemoLead({ registerOrTouch }), fakeAlerts({ dispatch }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .createLead(LEAD_DTO as any, req, res)

    expect(registerOrTouch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ kind: 'nouveau_prospect_demo', resolved: false })
    expect(result).toEqual({ firstName: 'Marie' })
  })

  // « La nouvelle nature n'ajoute personne aux dix alertes existantes… » et
  // « Le même prospect qui revient ⇒ AUCUN e-mail supplémentaire » (#2707).
  it('ne déclenche AUCUNE alerte quand le lead existait déjà (mise à jour)', async () => {
    const registerOrTouch = jest.fn(async () => ({ created: false, lead: LEAD }))
    const dispatch = jest.fn()
    const { req, res } = browser('device-existing')

    await controller(jest.fn(), jest.fn(), fakeDemoLead({ registerOrTouch }), fakeAlerts({ dispatch })).createLead(
      LEAD_DTO as any,
      req,
      res,
    )

    expect(dispatch).not.toHaveBeenCalled()
  })

  // #2707.5/#2707 — « Une panne du canal n'empêche ni l'enregistrement du
  // lead ni l'entrée en démo. » Ce test sait dire NON : sans le try/catch
  // autour de `dispatch`, cette promesse rejetée remonterait et l'appel
  // échouerait alors même que le lead est déjà enregistré.
  it('une panne de l’alerte n’empêche pas la réponse de succès', async () => {
    const registerOrTouch = jest.fn(async () => ({ created: true, lead: LEAD }))
    const dispatch = jest.fn(async () => {
      throw new Error('Redis indisponible')
    })
    const { req, res } = browser()

    const result = await controller(jest.fn(), jest.fn(), fakeDemoLead({ registerOrTouch }), fakeAlerts({ dispatch }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .createLead(LEAD_DTO as any, req, res)

    expect(result).toEqual({ firstName: 'Marie' })
  })
})

// #2705.6 — POST /demo/lead/touch : le visiteur qui revient saute le formulaire.
describe('DemoController.touchLead', () => {
  it('sans cookie d’appareil, ne cherche rien et répond « non trouvé »', async () => {
    const touchByDevice = jest.fn()
    const { req } = browser()

    const result = await controller(jest.fn(), jest.fn(), fakeDemoLead({ touchByDevice })).touchLead(req)

    expect(touchByDevice).not.toHaveBeenCalled()
    expect(result).toEqual({ found: false })
  })

  it('cookie connu, aucun lead — le formulaire doit se réafficher', async () => {
    const touchByDevice = jest.fn(async () => null)
    const { req } = browser('device-inconnu')

    const result = await controller(jest.fn(), jest.fn(), fakeDemoLead({ touchByDevice })).touchLead(req)

    expect(touchByDevice).toHaveBeenCalledWith('device-inconnu')
    expect(result).toEqual({ found: false })
  })

  it('cookie connu, lead trouvé — saute le formulaire', async () => {
    const touchByDevice = jest.fn(async () => ({ firstName: 'Marie' }))
    const { req } = browser('device-1')

    const result = await controller(jest.fn(), jest.fn(), fakeDemoLead({ touchByDevice })).touchLead(req)

    expect(result).toEqual({ found: true, firstName: 'Marie' })
  })
})

describe('DemoController.renew (#3511 — la session démo ne met pas dehors celui qui navigue)', () => {
  const build = (renew: jest.Mock, registerAndEnforce = jest.fn(async () => undefined)) =>
    new DemoController(
      { renew, isEnabled: jest.fn(() => true) } as unknown as DemoLinkService,
      config,
      fakeDemoLead(),
      fakeAlerts(),
      { registerAndEnforce } as unknown as SessionRegistryService,
    )

  it('renews from the device cookie alone — no token, no new room', async () => {
    const renew = jest.fn(async () => success(session))
    const registerAndEnforce = jest.fn(async () => undefined)
    const { req } = browser('device-A')

    const out = await build(renew, registerAndEnforce).session({ renew: true }, req, browser().res)

    expect(renew).toHaveBeenCalledWith('device-A')
    expect(out).toBe(session)
    expect(registerAndEnforce).toHaveBeenCalledWith('demo-user', 'device-A', null, null)
  })

  it('answers 401 when the browser no longer holds a room (a real expiry stays an expiry)', async () => {
    const renew = jest.fn(async () => failure({ code: 'no_lease' as const, message: 'plus la vôtre' }))
    const { req } = browser('device-A')

    await expect(build(renew).session({ renew: true }, req, browser().res)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('refuses a browser with no device cookie at all', async () => {
    const renew = jest.fn(async () => failure({ code: 'no_lease' as const, message: 'x' }))
    const { req } = browser()

    await expect(build(renew).session({ renew: true }, req, browser().res)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(renew).toHaveBeenCalledWith(null)
  })
})
