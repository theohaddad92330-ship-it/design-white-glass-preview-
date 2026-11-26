import { DiscoverAlertService } from './discover-alert.service'
import { createDiscoverAlertGate } from './discover-alert-gate'

const NOW = new Date('2026-09-15T08:00:00.000Z')
const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const OWNER = 'u0000000-0000-4000-8000-000000000001'

type Row = Record<string, unknown>

function row(overrides: Row = {}): Row {
  return {
    id: 'v1',
    workspace_id: WORKSPACE,
    owner_id: OWNER,
    name: 'Industrie Rhône-Alpes',
    objective: null,
    alert_frequency: 'weekly',
    alert_channel: 'email',
    // Consentement DATÉ — le seul qui vaut.
    alert_consent_at: new Date('2026-09-01T10:00:00.000Z'),
    last_run_at: null,
    is_demo: false,
    email: 'sarah@exemple.fr',
    email_language: 'fr',
    phone_e164: null,
    phone_verified_at: null,
    sms_consent_at: null,
    brand_email_from: null,
    ...overrides,
  }
}

function makeService(
  options: {
    rows?: Row[]
    env?: Record<string, string | undefined>
    emailKey?: boolean
    /** #2151.14 — ce que le registre d'événements rend. `[]` = rien n'est apparu. */
    pendingEvents?: Array<{ id: string; kind: string }>
    smsCountryAllowed?: boolean
  } = {},
) {
  const rows = options.rows ?? [row()]
  const updated: unknown[] = []
  const views = {
    manager: { query: jest.fn(async () => rows) },
    update: jest.fn(async (...args: unknown[]) => {
      updated.push(args)
      return { affected: 1 }
    }),
  }
  const notifications = { createNotification: jest.fn(async () => ({ id: 'n1' })) }
  const suppression = { isSuppressed: jest.fn(async () => false) }
  const sent: unknown[] = []
  const outbound = {
    configuredFor: jest.fn(() => options.emailKey !== false),
    allowsSmsRecipient: jest.fn(() => options.smsCountryAllowed !== false),
    send: jest.fn(async (message: unknown) => {
      sent.push(message)
    }),
  }
  const config = { get: jest.fn(() => 'https://app.bellum.test') }
  const gate = createDiscoverAlertGate({
    DISCOVER_ALERT_DISPATCH_ENABLED: 'true',
    SENTRY_ENVIRONMENT: 'production',
    ...options.env,
  })

  // #2151.14 — le registre des événements. Par défaut il en rend UN : sans
  // événement, l'émetteur ne délivre plus rien (c'est tout le point du lot), et
  // les cas d'envoi de cette suite testeraient alors le vide.
  const events = {
    undelivered: jest.fn(async () => options.pendingEvents ?? [{ id: 'evt-1', kind: 'new_relationship' }]),
    markDelivered: jest.fn(async () => 1),
  }

  const service = new DiscoverAlertService(
    views as never,
    notifications as never,
    suppression as never,
    outbound as never,
    gate,
    config as never,
    events as never,
  )
  return { service, views, notifications, suppression, outbound, gate, sent, updated, events }
}

describe('l’interrupteur ÉTEINT — rien ne part, et le chemin est byte-identique', () => {
  it('sans interrupteur, la base n’est même pas LUE', async () => {
    // « Éteint » ne veut pas dire « on lit tout puis on jette » : c'est le
    // chemin d'avant ce lot, à l'identique. Une lecture, c'est déjà une charge
    // et une trace.
    const { service, views, notifications, outbound } = makeService({
      env: { DISCOVER_ALERT_DISPATCH_ENABLED: undefined },
    })
    const counts = await service.run(NOW)
    expect(views.manager.query).not.toHaveBeenCalled()
    expect(notifications.createNotification).not.toHaveBeenCalled()
    expect(outbound.send).not.toHaveBeenCalled()
    expect(outbound.configuredFor).not.toHaveBeenCalled()
    expect(counts).toEqual({ scanned: 0, inApp: 0, outbound: 0, skipped: { switch_off: 1 } })
  })

  it('témoin du cas légitime voisin : interrupteur ALLUMÉ, l’alerte part', async () => {
    const { service, outbound, sent } = makeService()
    const counts = await service.run(NOW)
    expect(outbound.send).toHaveBeenCalledTimes(1)
    expect(sent[0]).toMatchObject({ channel: 'email', to: 'sarah@exemple.fr' })
    expect(counts.outbound).toBe(1)
  })
})

describe('sans clé — zéro appel réseau, et jamais un faux succès', () => {
  it('canal non configuré : rien n’est tenté, et le refus est NOMMÉ', async () => {
    const { service, outbound } = makeService({ emailKey: false })
    const counts = await service.run(NOW)
    expect(outbound.send).not.toHaveBeenCalled()
    expect(counts.skipped['no_provider']).toBe(1)
    expect(counts.outbound).toBe(0)
  })

  it('ZÉRO appel réseau : le client HTTP global est espionné et n’est jamais touché', async () => {
    const realFetch = globalThis.fetch
    const networkCalls = jest.fn()
    globalThis.fetch = (async (...args: unknown[]) => {
      networkCalls(...args)
      throw new Error('aucun appel réseau ne devait avoir lieu')
    }) as unknown as typeof fetch
    try {
      const { service } = makeService({ emailKey: false })
      await service.run(NOW)
      expect(networkCalls).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('le consentement — un `true` non qualifié vaut REFUS', () => {
  it('sans DATE de consentement, rien ne sort, interrupteur allumé et clé présente', async () => {
    const { service, outbound, notifications } = makeService({ rows: [row({ alert_consent_at: null })] })
    const result = await service.run(NOW)
    expect(outbound.send).not.toHaveBeenCalled()
    expect(result.skipped['no_consent']).toBe(1)
    // L'alerte existe quand même DANS l'application : refuser un envoi n'est
    // pas retirer une fonction à quelqu'un.
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
  })

  it('une date à VENIR ne qualifie pas non plus', async () => {
    const { service, outbound } = makeService({
      rows: [row({ alert_consent_at: new Date('2026-09-20T10:00:00.000Z') })],
    })
    const result = await service.run(NOW)
    expect(outbound.send).not.toHaveBeenCalled()
    expect(result.skipped['no_consent']).toBe(1)
  })

  it('témoin du cas légitime voisin : une date passée qualifie et l’envoi part', async () => {
    const { service, outbound } = makeService({ rows: [row({ alert_consent_at: '2026-01-02T00:00:00.000Z' })] })
    await service.run(NOW)
    expect(outbound.send).toHaveBeenCalledTimes(1)
  })

  it('le SMS demande EN PLUS un numéro vérifié et un consentement de canal daté', async () => {
    const withoutNumber = makeService({ rows: [row({ alert_channel: 'sms' })] })
    expect((await withoutNumber.service.run(NOW)).skipped['no_address']).toBe(1)
    expect(withoutNumber.outbound.send).not.toHaveBeenCalled()

    const unverified = makeService({
      rows: [row({ alert_channel: 'sms', phone_e164: '+33612345678', sms_consent_at: new Date('2026-09-01') })],
    })
    expect((await unverified.service.run(NOW)).skipped['no_address']).toBe(1)

    const ready = makeService({
      rows: [
        row({
          alert_channel: 'sms',
          phone_e164: '+33612345678',
          phone_verified_at: new Date('2026-09-01'),
          sms_consent_at: new Date('2026-09-01'),
        }),
      ],
    })
    await ready.service.run(NOW)
    expect(ready.outbound.send).toHaveBeenCalledWith(expect.objectContaining({ channel: 'sms', to: '+33612345678' }))
  })
})

describe('#4016 L12 — SMS : le pays est vérifié à chaque envoi, avant le fournisseur', () => {
  const smsRow = (): ReturnType<typeof row> =>
    row({
      alert_channel: 'sms',
      phone_e164: '+32475123456',
      phone_verified_at: new Date('2026-09-01'),
      sms_consent_at: new Date('2026-09-01'),
    })

  it('un numéro belge dans la liste de l’opérateur : l’envoi part', async () => {
    const { service, outbound } = makeService({ rows: [smsRow()] })
    await service.run(NOW)
    expect(outbound.allowsSmsRecipient).toHaveBeenCalledWith('+32475123456')
    expect(outbound.send).toHaveBeenCalledWith(expect.objectContaining({ channel: 'sms', to: '+32475123456' }))
  })

  it('pays hors liste : refus NOMMÉ, aucun envoi, et l’alerte reste dans l’application', async () => {
    const { service, outbound, notifications } = makeService({ rows: [smsRow()], smsCountryAllowed: false })
    const counts = await service.run(NOW)
    expect(outbound.send).not.toHaveBeenCalled()
    expect(counts.skipped['country_not_allowed']).toBe(1)
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
  })
})

describe('la liste bornée — un essai ne part jamais à tout le monde', () => {
  it('hors production sans liste : refusé, et le refus est NOMMÉ', async () => {
    const { service, outbound } = makeService({ env: { SENTRY_ENVIRONMENT: 'preview' } })
    const result = await service.run(NOW)
    expect(outbound.send).not.toHaveBeenCalled()
    expect(result.skipped['not_allowlisted']).toBe(1)
  })

  it('hors production, un destinataire HORS liste est refusé', async () => {
    const { service, outbound } = makeService({
      env: { SENTRY_ENVIRONMENT: 'preview', DISCOVER_ALERT_RECIPIENT_ALLOWLIST: 'quelquun.dautre@exemple.fr' },
    })
    const result = await service.run(NOW)
    expect(outbound.send).not.toHaveBeenCalled()
    expect(result.skipped['not_allowlisted']).toBe(1)
  })

  it('témoin du cas légitime voisin : un destinataire INSCRIT reçoit', async () => {
    const { service, outbound } = makeService({
      env: { SENTRY_ENVIRONMENT: 'preview', DISCOVER_ALERT_RECIPIENT_ALLOWLIST: 'sarah@exemple.fr' },
    })
    await service.run(NOW)
    expect(outbound.send).toHaveBeenCalledTimes(1)
  })
})

describe('la cadence, la démonstration et le reste', () => {
  it('un périmètre PAS ENCORE dû ne déclenche rien', async () => {
    const { service, outbound, notifications } = makeService({
      rows: [row({ last_run_at: new Date('2026-09-14T08:00:00.000Z') })],
    })
    const result = await service.run(NOW)
    expect(result.skipped['not_due']).toBe(1)
    expect(outbound.send).not.toHaveBeenCalled()
    expect(notifications.createNotification).not.toHaveBeenCalled()
  })

  it('RIEN ne part jamais d’une salle de démonstration', async () => {
    const { service, outbound, notifications } = makeService({ rows: [row({ is_demo: true })] })
    const result = await service.run(NOW)
    expect(result.skipped['demo']).toBe(1)
    expect(outbound.send).not.toHaveBeenCalled()
    expect(notifications.createNotification).not.toHaveBeenCalled()
  })

  it('un désabonnement de courrier ferme le canal e-mail', async () => {
    const { service, suppression, outbound } = makeService()
    suppression.isSuppressed.mockResolvedValue(true as never)
    const result = await service.run(NOW)
    expect(outbound.send).not.toHaveBeenCalled()
    expect(result.skipped['opted_out']).toBe(1)
  })

  it('la dernière exécution est HORODATÉE avant l’envoi — un échec ne rejoue pas en rafale', async () => {
    const { service, views, outbound } = makeService()
    outbound.send.mockRejectedValue(new Error('le fournisseur a refusé') as never)
    const result = await service.run(NOW)
    expect(views.update).toHaveBeenCalledWith('v1', { last_run_at: NOW })
    expect(result.skipped['failed']).toBe(1)
  })

  it('un échec d’envoi ne fait pas échouer le passage entier', async () => {
    const { service, outbound } = makeService({ rows: [row(), row({ id: 'v2', email: 'autre@exemple.fr' })] })
    outbound.send.mockRejectedValueOnce(new Error('refusé') as never)
    const result = await service.run(NOW)
    expect(result.scanned).toBe(2)
    expect(result.outbound).toBe(1)
    expect(result.skipped['failed']).toBe(1)
  })

  it('le canal « dans l’application » ne tente AUCUN envoi sortant', async () => {
    const { service, outbound, notifications } = makeService({ rows: [row({ alert_channel: 'in_app' })] })
    const result = await service.run(NOW)
    expect(outbound.configuredFor).not.toHaveBeenCalled()
    expect(outbound.send).not.toHaveBeenCalled()
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
    expect(result.inApp).toBe(1)
  })

  it('la requête ne ramasse QUE des recherches de Découvrir à cadence non manuelle', async () => {
    const { service, views } = makeService()
    await service.run(NOW)
    const sql = String((views.manager.query.mock.calls[0] as unknown[])[0])
    expect(sql).toContain("scope = 'discover'")
    expect(sql).toContain("alert_frequency <> 'manual'")
    expect(sql).toContain('alert_channel IS NOT NULL')
  })
})
