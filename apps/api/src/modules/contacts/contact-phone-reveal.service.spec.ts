import { ContactPhoneRevealService, phoneFromApolloWebhook } from './contact-phone-reveal.service'
import { verifyPhoneRevealToken } from './phone-reveal-token'

/**
 * E1 (07/10/2026, #3698 — décision Louis) — la révélation du mobile Apollo :
 * la DEMANDE (URL de retour signée) et la LIVRAISON (webhook public).
 * Ce qui doit savoir dire NON : un nonce périmé ou rejoué, une fiche dont le
 * téléphone a été posé entre-temps (correction humaine), un second débit.
 */
const SECRET = 'x'.repeat(48)
const CONTACT_ID = '11111111-1111-4111-8111-111111111111'
const TARGET = { id: CONTACT_ID, workspace_id: 'ws-1' }
const SIGNED = { contactId: CONTACT_ID, workspaceId: 'ws-1', nonce: 'n-1' }

function qb(affected: number[]) {
  const calls: Array<{ set: unknown; where: string[]; params?: unknown }> = []
  let current: { set: unknown; where: string[]; params?: unknown } = { set: null, where: [] }
  const builder = {
    update: jest.fn(() => {
      current = { set: null, where: [] }
      return builder
    }),
    set: jest.fn((value: unknown) => {
      current.set = value
      return builder
    }),
    where: jest.fn((clause: string) => {
      current.where.push(clause)
      return builder
    }),
    andWhere: jest.fn((clause: string) => {
      current.where.push(clause)
      return builder
    }),
    setParameters: jest.fn((params: unknown) => {
      current.params = params
      return builder
    }),
    execute: jest.fn(async () => {
      calls.push(current)
      return { affected: affected.shift() ?? 1 }
    }),
  }
  return { builder, calls }
}

function build(options: { contact?: Record<string, unknown> | null; affected?: number[]; publicUrl?: string } = {}) {
  const { builder, calls } = qb(options.affected ?? [])
  const contacts = {
    findOne: jest.fn().mockResolvedValue(options.contact === undefined ? null : options.contact),
    createQueryBuilder: jest.fn(() => builder),
  }
  const ia = { revealContactPhone: jest.fn() }
  const credits = { consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 9 }) }
  const config = {
    get: jest.fn((key: string) =>
      key === 'internalApiSecret'
        ? SECRET
        : key === 'apiPublicUrl'
          ? (options.publicUrl ?? 'https://api.example.test')
          : undefined,
    ),
  }
  const service = new ContactPhoneRevealService(
    contacts as never,
    ia as never,
    config as never,
    credits.consumeEnrichmentCredit as never,
  )
  return { service, contacts, ia, credits, calls }
}

const pendingContact = (overrides: Record<string, unknown> = {}) => ({
  id: CONTACT_ID,
  user_id: 'user-1',
  account_id: 'acc-1',
  full_name: 'Jean Dupont',
  email: 'jean@acme.fr',
  phone: null,
  linkedin_url: null,
  enrichment_coordinates: { email: { state: 'found', sources_queried: 1, at: '2026-10-07T09:00:00.000Z' } },
  enrichment_trace: {
    attempts: [
      { source: 'apollo', coordinate: 'phone', outcome: 'pending', at: '2026-10-07T09:00:00.000Z' },
      { source: 'fullenrich', coordinate: 'phone', outcome: 'not_found', at: '2026-10-07T09:00:00.000Z' },
    ],
    phone_reveal: { nonce: 'n-1', requested_at: '2026-10-07T09:00:00.000Z', debited: false, free: false },
  },
  ...overrides,
})

const apolloPayload = (numbers: unknown[]) => ({
  status: 'success',
  people: [{ id: 'p1', status: 'success', phone_numbers: numbers }],
})

describe('phoneFromApolloWebhook', () => {
  it('prend le mobile valide, au format E.164', () => {
    expect(
      phoneFromApolloWebhook(
        apolloPayload([
          {
            raw_number: '+33 1 00 00 00 00',
            sanitized_number: '+33100000000',
            type_cd: 'work_hq',
            status_cd: 'valid_number',
          },
          {
            raw_number: '+33 6 12 34 56 78',
            sanitized_number: '+33612345678',
            type_cd: 'mobile',
            status_cd: 'valid_number',
          },
        ]),
      ),
    ).toBe('+33612345678')
  })

  it('NON : un numéro invalide ou une charge vide', () => {
    expect(phoneFromApolloWebhook(apolloPayload([{ sanitized_number: '+336', type_cd: 'mobile' }]))).toBeNull()
    expect(
      phoneFromApolloWebhook(apolloPayload([{ sanitized_number: '+33612345678', status_cd: 'invalid_number' }])),
    ).toBeNull()
    expect(phoneFromApolloWebhook({ people: [] })).toBeNull()
    expect(phoneFromApolloWebhook(null)).toBeNull()
  })
})

describe('ContactPhoneRevealService.request', () => {
  it('pose le nonce AVANT d’appeler, puis demande avec une URL de retour signée pour CE contact', async () => {
    const { service, ia, calls } = build()
    ia.revealContactPhone.mockResolvedValue({ requested: true, matched: true })

    const out = await service.request(TARGET, { apolloId: 'p1', firstName: 'Jean' }, { debited: false, free: false })

    expect(out.state).toBe('pending')
    const { webhookUrl } = ia.revealContactPhone.mock.calls[0][0] as { webhookUrl: string }
    expect(webhookUrl.startsWith('https://api.example.test/webhooks/enrichment/phone/')).toBe(true)
    const token = webhookUrl.split('/').pop() as string
    const verified = verifyPhoneRevealToken(token, SECRET)
    expect(verified?.contactId).toBe(CONTACT_ID)
    // Le nonce signé est celui écrit sur la fiche, et il l'a été AVANT l'appel.
    expect(JSON.stringify(calls[0])).toContain(verified?.nonce as string)
  })

  it('sans URL publique : rien ne part (no-op strict)', async () => {
    const { service, ia } = build({ publicUrl: '' })
    expect((await service.request(TARGET, { apolloId: 'p1' }, { debited: false, free: false })).state).toBe(
      'not_requested',
    )
    expect(ia.revealContactPhone).not.toHaveBeenCalled()
  })

  it('Apollo ne trouve personne : la demande est retirée, le mobile est « introuvable » chez cette source', async () => {
    const { service, ia, calls } = build()
    ia.revealContactPhone.mockResolvedValue({ requested: false, matched: false, reason: 'no_match' })
    const out = await service.request(TARGET, { apolloId: 'p1' }, { debited: false, free: false })
    expect(out.state).toBe('not_found')
    expect(JSON.stringify(calls.at(-1))).toContain('phone_reveal')
  })

  it('panne amont : « erreur », jamais « introuvable »', async () => {
    const { service, ia } = build()
    ia.revealContactPhone.mockRejectedValue(new Error('down'))
    expect((await service.request(TARGET, { apolloId: 'p1' }, { debited: false, free: false })).state).toBe('error')
  })
})

describe('ContactPhoneRevealService.applyWebhook', () => {
  const MOBILE = [{ sanitized_number: '+33612345678', type_cd: 'mobile', status_cd: 'valid_number' }]

  it('écrit le mobile sur une fiche SANS téléphone et débite UNE fois', async () => {
    const { service, credits, calls } = build({ contact: pendingContact() })
    const out = await service.applyWebhook(SIGNED, apolloPayload(MOBILE))
    expect(out).toEqual({ accepted: true, outcome: 'found' })
    const phoneWrite = calls.find(call => JSON.stringify(call.set).includes('+33612345678'))
    expect(phoneWrite?.where.join(' ')).toMatch(/phone IS NULL/)
    expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
    const states = calls.at(-1)?.set as { enrichment_coordinates: { phone: { state: string } } }
    expect(states.enrichment_coordinates.phone.state).toBe('found')
  })

  it('NON : un nonce qui n’est pas celui attendu (demande remplacée) — rien écrit, rien débité', async () => {
    const { service, credits, calls } = build({ contact: pendingContact() })
    expect(await service.applyWebhook({ ...SIGNED, nonce: 'autre' }, apolloPayload(MOBILE))).toEqual({
      accepted: false,
    })
    expect(calls).toHaveLength(0)
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('NON : une seconde livraison concurrente (le nonce a déjà été consommé) — pas de double débit', async () => {
    const { service, credits } = build({ contact: pendingContact(), affected: [0] })
    expect(await service.applyWebhook(SIGNED, apolloPayload(MOBILE))).toEqual({ accepted: false })
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('NON : le téléphone a été posé entre-temps (correction humaine) — jamais écrasé, jamais débité', async () => {
    // L'écriture conditionnelle ne touche aucune ligne : quelqu'un a posé un numéro.
    const { service, credits } = build({ contact: pendingContact(), affected: [1, 0] })
    const out = await service.applyWebhook(SIGNED, apolloPayload(MOBILE))
    expect(out.accepted).toBe(true)
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('pas de second débit quand la tentative synchrone a déjà débité', async () => {
    const contact = pendingContact()
    ;(contact.enrichment_trace as { phone_reveal: { debited: boolean } }).phone_reveal.debited = true
    const { service, credits } = build({ contact })
    await service.applyWebhook(SIGNED, apolloPayload(MOBILE))
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('rattrapage gratuit : jamais de débit', async () => {
    const contact = pendingContact()
    ;(contact.enrichment_trace as { phone_reveal: { free: boolean } }).phone_reveal.free = true
    const { service, credits } = build({ contact })
    await service.applyWebhook(SIGNED, apolloPayload(MOBILE))
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('aucun mobile : « introuvable chez N sources » (Apollo + FullEnrich = 2), aucun débit', async () => {
    const { service, credits, calls } = build({ contact: pendingContact() })
    const out = await service.applyWebhook(SIGNED, apolloPayload([]))
    expect(out).toEqual({ accepted: true, outcome: 'not_found' })
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    const states = calls.at(-1)?.set as {
      enrichment_coordinates: Record<string, { state: string; sources_queried: number }>
    }
    expect(states.enrichment_coordinates.phone).toMatchObject({ state: 'not_found', sources_queried: 2 })
    // L'état des autres coordonnées n'est pas touché.
    expect(states.enrichment_coordinates.email?.state).toBe('found')
  })

  it('contact inconnu : refusé sans bruit', async () => {
    const { service } = build({ contact: null })
    expect(await service.applyWebhook(SIGNED, apolloPayload(MOBILE))).toEqual({ accepted: false })
  })
})
