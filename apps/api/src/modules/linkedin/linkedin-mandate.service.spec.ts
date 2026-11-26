import { Logger } from '@nestjs/common'
import { LinkedInMandateService } from './linkedin-mandate.service'
import { LinkedInTimeoutError, UnipileLinkedInSender } from './linkedin-sender'

const USER = '11111111-1111-1111-1111-111111111111'
const WS = '22222222-2222-2222-2222-222222222222'
const CONTACT = '33333333-3333-3333-3333-333333333333'
const BODY = 'CORPS-ECRIT-DANS-LE-TEST-9f2'
const NOW = new Date('2026-10-29T10:00:00.000Z')

/** Un dépôt en mémoire : assez pour que le service lise ce qu'il a écrit. */
function memoryRepo<T extends Record<string, unknown>>(seed: T[] = []) {
  const rows: T[] = [...seed]
  return {
    rows,
    create: (x: Partial<T>) => ({ ...x }) as T,
    save: jest.fn(async (x: T) => {
      if (!x['id']) x['id' as keyof T] = `id-${rows.length + 1}` as T[keyof T]
      const at = rows.findIndex(r => r['id'] === x['id'])
      if (at >= 0) rows[at] = x
      else rows.push(x)
      return x
    }),
    find: jest.fn(async (opts?: { where?: Record<string, unknown> }) =>
      rows.filter(r => Object.entries(opts?.where ?? {}).every(([k, v]) => r[k] === v)),
    ),
    findOne: jest.fn(
      async (opts: { where: Record<string, unknown> }) =>
        rows.find(r => Object.entries(opts.where).every(([k, v]) => r[k] === v)) ?? null,
    ),
  }
}

function build(
  opts: { token?: string; transport?: { send: jest.Mock } | null; demo?: boolean; linked?: boolean } = {},
) {
  const mandates = memoryRepo<Record<string, unknown>>()
  const log = memoryRepo<Record<string, unknown>>()
  const interactions = memoryRepo<Record<string, unknown>>()
  const contacts = memoryRepo<Record<string, unknown>>([
    { id: CONTACT, user_id: USER, linkedin_url: 'https://www.linkedin.com/in/x' },
  ])
  const transport =
    opts.transport === undefined ? { send: jest.fn().mockResolvedValue({ messageRef: 'ref-1' }) } : opts.transport
  const sender = new UnipileLinkedInSender({
    apiKey: opts.token,
    dsn: 'api1.example.invalid:13111',
    accountRefOf: async () => (opts.linked === false ? null : 'compte-1'),
    transport,
  })
  const workspace = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS }),
    isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false),
  }
  const service = new LinkedInMandateService(
    mandates as never,
    log as never,
    interactions as never,
    contacts as never,
    workspace as never,
    sender,
    () => NOW,
  )
  return { service, mandates, log, interactions, transport, sender }
}

const grant = { validUntil: '2026-11-28T00:00:00.000Z', dailyLimit: 2 }

describe('LinkedInMandateService — le geste d’envoi', () => {
  it('sans mandat : refusé, aucun appel fournisseur', async () => {
    const { service, transport } = build({ token: 'jeton' })
    const out = await service.send(USER, { contactId: CONTACT, body: BODY })
    expect(out).toMatchObject({ status: 'refused', reason: 'no_mandate' })
    expect(transport?.send).not.toHaveBeenCalled()
  })

  it('avec mandat mais sans clé fournisseur : voie non ouverte, zéro appel, rien de supposé', async () => {
    const throwing = {
      send: jest.fn(() => {
        throw new Error('réseau interdit')
      }),
    }
    const { service, log } = build({ token: undefined, transport: throwing })
    await service.grant(USER, grant)
    const out = await service.send(USER, { contactId: CONTACT, body: BODY })
    expect(out).toMatchObject({ status: 'not_open', proofVerified: false })
    expect(throwing.send).not.toHaveBeenCalled()
    expect(log.rows.at(-1)).toMatchObject({ status: 'not_open', proof_ref: null })
  })

  it('un envoi réussi porte sa preuve, distincte du « fait » déclaratif', async () => {
    const { service, log, interactions } = build({ token: 'jeton' })
    await service.grant(USER, grant)
    const out = await service.send(USER, { contactId: CONTACT, body: BODY })
    expect(out).toMatchObject({ status: 'sent', proofVerified: true })
    expect(log.rows.at(-1)).toMatchObject({ status: 'sent', proof_ref: 'ref-1' })
    expect(interactions.rows).toHaveLength(0)
  })

  it('au-delà du volume du jour : refusé', async () => {
    const { service, transport } = build({ token: 'jeton' })
    await service.grant(USER, grant)
    await service.send(USER, { contactId: CONTACT, body: BODY })
    await service.send(USER, { contactId: CONTACT, body: BODY })
    const third = await service.send(USER, { contactId: CONTACT, body: BODY })
    expect(third).toMatchObject({ status: 'refused', reason: 'daily_limit_reached' })
    expect(transport?.send).toHaveBeenCalledTimes(2)
  })

  it('hors période : refusé', async () => {
    const { service } = build({ token: 'jeton' })
    await service.grant(USER, {
      validFrom: '2026-12-01T00:00:00.000Z',
      validUntil: '2026-12-31T00:00:00.000Z',
      dailyLimit: 2,
    })
    expect(await service.send(USER, { contactId: CONTACT, body: BODY })).toMatchObject({ reason: 'not_yet_valid' })
  })

  it('après révocation : refusé, immédiatement', async () => {
    const { service, transport } = build({ token: 'jeton' })
    const m = await service.grant(USER, grant)
    await service.revoke(USER, m.id)
    expect(await service.send(USER, { contactId: CONTACT, body: BODY })).toMatchObject({ reason: 'revoked' })
    expect(transport?.send).not.toHaveBeenCalled()
  })

  it('après une réponse du destinataire : la suite s’arrête', async () => {
    const { service, interactions, transport } = build({ token: 'jeton' })
    await service.grant(USER, grant)
    interactions.rows.push({
      user_id: USER,
      contact_id: CONTACT,
      kind: 'reply_received',
      occurred_at: new Date('2026-10-29T10:00:00.000Z'),
    })
    expect(await service.send(USER, { contactId: CONTACT, body: BODY })).toMatchObject({ reason: 'recipient_replied' })
    expect(transport?.send).not.toHaveBeenCalled()
  })

  it('un timeout reste « unknown » et la reprise s’arrête', async () => {
    const transport = { send: jest.fn().mockRejectedValue(new LinkedInTimeoutError()) }
    const { service } = build({ token: 'jeton', transport })
    await service.grant(USER, grant)
    expect(await service.send(USER, { contactId: CONTACT, body: BODY })).toMatchObject({
      status: 'unknown',
      proofVerified: false,
    })
    const again = await service.send(USER, { contactId: CONTACT, body: BODY })
    expect(again).toMatchObject({ status: 'refused', reason: 'previous_unknown' })
    expect(transport.send).toHaveBeenCalledTimes(1)
  })

  it('en démonstration : aucun envoi, aucun appel fournisseur, même avec mandat et jeton', async () => {
    const { service, transport } = build({ token: 'jeton', demo: true })
    await service.grant(USER, grant)
    expect(await service.send(USER, { contactId: CONTACT, body: BODY })).toMatchObject({
      status: 'refused',
      reason: 'demo',
    })
    expect(transport?.send).not.toHaveBeenCalled()
  })

  it('la fusion : le mandat vit dans outreach_delegations (portée linkedin_send), jamais dans une table à part', async () => {
    const { service, mandates } = build({ token: 'jeton' })
    await service.grant(USER, grant)
    expect(mandates.rows).toHaveLength(1)
    expect(mandates.rows[0]).toMatchObject({
      scope: 'linkedin_send',
      user_id: USER,
      workspace_id: WS,
      daily_limit: 2,
      channels: [],
      revoked_at: null,
    })
  })

  it('un mandat révoqué garde sa trace (archivé, jamais supprimé) et le nouveau le remplace', async () => {
    const { service, mandates } = build({ token: 'jeton' })
    const first = await service.grant(USER, grant)
    await service.grant(USER, grant)
    expect(mandates.rows).toHaveLength(2)
    expect(mandates.rows.find(r => r['id'] === first.id)?.['revoked_at']).toBeInstanceOf(Date)
  })

  it('un mandat d’un autre type (campagne e-mail) n’est ni lu ni révoqué par le geste LinkedIn', async () => {
    const { service, mandates } = build({ token: 'jeton' })
    mandates.rows.push({ id: 'camp', user_id: USER, scope: 'campaign', revoked_at: null })
    await service.grant(USER, grant)
    expect(mandates.rows.find(r => r['id'] === 'camp')?.['revoked_at']).toBeNull()
    expect(await service.current(USER)).not.toMatchObject({ id: 'camp' })
  })

  it('la borne est 25 par utilisateur : un mandat au-dessus est refusé, le défaut est 25', async () => {
    const { service } = build({ token: 'jeton' })
    await expect(service.grant(USER, { validUntil: grant.validUntil, dailyLimit: 26 })).rejects.toThrow()
    const view = await service.grant(USER, { validUntil: grant.validUntil })
    expect(view.dailyLimit).toBe(25)
  })

  it('la période est bornée comme tout mandat d’envoi : au-delà de 30 jours, refusé', async () => {
    const { service } = build({ token: 'jeton' })
    await expect(service.grant(USER, { validUntil: '2026-12-31T00:00:00.000Z' })).rejects.toThrow('30 jours')
  })

  it('le quota est PAR UTILISATEUR : révoquer puis re-signer ne remet pas le compteur à zéro', async () => {
    const { service, transport } = build({ token: 'jeton' })
    const first = await service.grant(USER, grant)
    await service.send(USER, { contactId: CONTACT, body: BODY })
    await service.send(USER, { contactId: CONTACT, body: BODY })
    await service.revoke(USER, first.id)
    await service.grant(USER, grant)
    const third = await service.send(USER, { contactId: CONTACT, body: BODY })
    expect(third).toMatchObject({ status: 'refused', reason: 'daily_limit_reached' })
    expect(transport?.send).toHaveBeenCalledTimes(2)
  })

  it('un envoi compté incrémente le compteur partagé de la délégation (sent_count)', async () => {
    const { service, mandates } = build({ token: 'jeton' })
    await service.grant(USER, grant)
    await service.send(USER, { contactId: CONTACT, body: BODY })
    expect(mandates.rows[0]?.['sent_count']).toBe(1)
  })

  it('l’état de l’écran : mandat, bornes, reste du jour, voie ouverte — et jamais le corps', async () => {
    const { service } = build({ token: 'jeton' })
    expect(await service.status(USER)).toMatchObject({
      mandate: null,
      dailyLimit: 25,
      sentToday: 0,
      remainingToday: 0,
      routeOpen: true,
    })
    await service.grant(USER, grant)
    await service.send(USER, { contactId: CONTACT, body: BODY })
    const status = await service.status(USER)
    expect(status).toMatchObject({ sentToday: 1, remainingToday: 1, routeOpen: true })
    expect(status.mandate).toMatchObject({ active: true, dailyLimit: 2 })
    expect(leaks(status)).toBe(false)
  })

  it('« voie d’envoi non ouverte » : sans clé, ou clé sans compte relié — l’écran ne promet rien', async () => {
    expect((await build({ token: undefined }).service.status(USER)).routeOpen).toBe(false)
    expect((await build({ token: 'jeton', linked: false }).service.status(USER)).routeOpen).toBe(false)
  })

  it('une clé posée mais un compte non relié : voie non ouverte, zéro appel, rien de supposé', async () => {
    const { service, transport } = build({ token: 'jeton', linked: false })
    await service.grant(USER, grant)
    expect(await service.send(USER, { contactId: CONTACT, body: BODY })).toMatchObject({ status: 'not_open' })
    expect(transport?.send).not.toHaveBeenCalled()
  })

  it('un contact qui n’est pas à l’utilisateur : introuvable', async () => {
    const { service } = build({ token: 'jeton' })
    await service.grant(USER, grant)
    await expect(service.send('autre', { contactId: CONTACT, body: BODY })).rejects.toThrow()
  })
})

/** Le détecteur de fuite : il doit savoir dire NON sur une donnée écrite ici. */
function leaks(value: unknown): boolean {
  return JSON.stringify(value).includes(BODY)
}

describe('le corps du message ne sort jamais', () => {
  it('le détecteur sait dire non : il attrape un corps volontairement exposé', () => {
    expect(leaks({ status: 'sent', body: BODY })).toBe(true)
    expect(leaks({ status: 'sent' })).toBe(false)
  })

  it('aucune réponse d’API, aucun log, pour chaque issue possible', async () => {
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(m => jest.spyOn(Logger.prototype, m))
    const outputs: unknown[] = []
    const timeout = { send: jest.fn().mockRejectedValue(new LinkedInTimeoutError()) }
    const failing = { send: jest.fn().mockRejectedValue(new Error(`boom ${BODY}`)) }
    for (const cfg of [
      { token: 'jeton' },
      { token: undefined },
      { token: 'jeton', transport: timeout },
      { token: 'jeton', transport: failing },
    ]) {
      const { service } = build(cfg)
      outputs.push(await service.send(USER, { contactId: CONTACT, body: BODY }).catch(e => String(e)))
      const m = await service.grant(USER, grant)
      outputs.push(m, await service.current(USER))
      outputs.push(await service.send(USER, { contactId: CONTACT, body: BODY }))
      outputs.push(await service.listSends(USER, CONTACT))
    }
    expect(outputs.some(leaks)).toBe(false)
    for (const spy of spies) expect(spy.mock.calls.some(leaks)).toBe(false)
    spies.forEach(s => s.mockRestore())
  })
})
