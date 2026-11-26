import type { Repository } from 'typeorm'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import type { PersonErasureEntity } from '../../database/entities/person-erasure.entity'
import { EmailEstimateService } from './email-estimate.service'
import type { EmailEstimatePorts, EmailEstimateProbe } from './module-tokens'

/**
 * #4016 L4.1 (décision Louis 11/10/2026) — l'e-mail déduit du motif de
 * l'entreprise, PUIS vérifié. Ce que la spec tient :
 *  - écrit en provenance `inferred`, jamais `email_verified` ;
 *  - jamais pour une personne effacée, opposée, ou une adresse en opposition ;
 *  - jamais par-dessus une valeur existante ; invérifiable ⇒ rien n'est écrit.
 */
const WS = '00000000-0000-0000-0000-0000000000aa'
const ACCOUNT = '00000000-0000-0000-0000-0000000000bb'
const CONTACT_ID = '00000000-0000-0000-0000-0000000000cc'

type Row = Partial<ContactEntity>

function target(overrides: Row = {}): Row {
  return {
    id: CONTACT_ID,
    workspace_id: WS,
    account_id: ACCOUNT,
    full_name: 'Sophie Leroy',
    email: null,
    email_verified: false,
    deleted_at: null,
    anonymized_at: null,
    linkedin_url: null,
    ...overrides,
  }
}

const VERIFIED_PEERS: Row[] = [
  { full_name: 'Claire Perrin', email: 'claire.perrin@acme.fr', email_verified: true },
  { full_name: 'Marc Olivier', email: 'marc.olivier@acme.fr', email_verified: true },
]

function setup(options: {
  contact?: Row | null
  peers?: Row[]
  stopped?: boolean
  suppressed?: boolean
  erasedFingerprints?: string[]
  verdict?: Awaited<ReturnType<EmailEstimateProbe>>
  sources?: Record<string, string>
  updated?: number
  demo?: boolean
}) {
  const execute = jest.fn(async () => ({ affected: options.updated ?? 1 }))
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute,
  }
  const contacts = {
    findOne: jest.fn(async () => (options.contact === undefined ? target() : options.contact)),
    find: jest.fn(async () => options.peers ?? VERIFIED_PEERS),
    count: jest.fn(async () => 0),
    query: jest.fn(async () => [{ is_demo: options.demo === true }]),
    createQueryBuilder: jest.fn(() => qb),
  }
  const erasures = {
    find: jest.fn(async () => (options.erasedFingerprints ? [{ fingerprints: options.erasedFingerprints }] : [])),
  }
  const stops = { findOne: jest.fn(async () => (options.stopped ? { reason: 'do_not_contact' } : null)) }
  const ports: EmailEstimatePorts = {
    isSuppressed: jest.fn(async () => options.suppressed ?? false),
    currentSources: jest.fn(async () => (options.sources ?? {}) as never),
    commitEstimate: jest.fn(async () => undefined),
  }
  const probe = jest.fn(async () => options.verdict ?? 'deliverable')
  const service = new EmailEstimateService(
    contacts as unknown as Repository<ContactEntity>,
    erasures as unknown as Repository<PersonErasureEntity>,
    stops as unknown as Repository<ContactStopEntity>,
    ports,
    probe,
  )
  return { service, contacts, qb, ports, probe }
}

describe('EmailEstimateService.estimateFor', () => {
  it('déduit prenom.nom@ des adresses vérifiées du compte, le VÉRIFIE, puis l’écrit en `inferred`', async () => {
    const { service, qb, ports, probe } = setup({})
    const outcome = await service.estimateFor(WS, CONTACT_ID)

    expect(probe).toHaveBeenCalledWith('sophie.leroy@acme.fr')
    expect(outcome).toEqual(expect.objectContaining({ kind: 'estimated', email: 'sophie.leroy@acme.fr' }))
    // `email` seul — JAMAIS `email_verified` : une estimation n'est pas une preuve.
    expect(qb.set).toHaveBeenCalledWith({ email: 'sophie.leroy@acme.fr' })
    expect(JSON.stringify(qb.set.mock.calls)).not.toContain('email_verified')
    expect(ports.commitEstimate).toHaveBeenCalledWith({
      workspaceId: WS,
      contactId: CONTACT_ID,
      email: 'sophie.leroy@acme.fr',
      rule: 'email_pattern:first.last',
    })
  })

  it('invérifiable (catch-all, port fermé, délai) ⇒ RIEN n’est écrit', async () => {
    for (const verdict of ['unverifiable', 'undeliverable'] as const) {
      const { service, qb, ports } = setup({ verdict })
      await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: verdict })
      expect(qb.execute).not.toHaveBeenCalled()
      expect(ports.commitEstimate).not.toHaveBeenCalled()
    }
  })

  it('n’estime jamais par-dessus une adresse déjà connue', async () => {
    const { service, probe } = setup({ contact: target({ email: 'sophie@perso.fr' }) })
    await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: 'has_email' })
    expect(probe).not.toHaveBeenCalled()
  })

  it('une personne qui a demandé qu’on cesse (c69) n’est jamais estimée — et la sonde ne part pas', async () => {
    const { service, probe } = setup({ stopped: true })
    await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: 'opposed' })
    expect(probe).not.toHaveBeenCalled()
  })

  it('une adresse en opposition (`email_suppressions`) n’est jamais estimée', async () => {
    const { service, probe } = setup({ suppressed: true })
    await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: 'suppressed' })
    expect(probe).not.toHaveBeenCalled()
  })

  it('une fiche anonymisée ou supprimée n’est jamais estimée', async () => {
    for (const contact of [target({ anonymized_at: new Date() }), target({ deleted_at: new Date() })]) {
      const { service, probe } = setup({ contact })
      await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: 'unavailable' })
      expect(probe).not.toHaveBeenCalled()
    }
  })

  it('un espace qui porte des effacements, sans clé d’empreinte, se TAIT plutôt que de deviner', async () => {
    const previous = process.env.PERSON_ERASURE_HMAC_KEY
    delete process.env.PERSON_ERASURE_HMAC_KEY
    try {
      const { service, probe } = setup({ erasedFingerprints: ['a'.repeat(64)] })
      await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: 'erased' })
      expect(probe).not.toHaveBeenCalled()
    } finally {
      if (previous !== undefined) process.env.PERSON_ERASURE_HMAC_KEY = previous
    }
  })

  it('sans motif appris (une seule adresse vérifiée, ou aucune) ⇒ aucune estimation', async () => {
    const { service, probe } = setup({ peers: VERIFIED_PEERS.slice(0, 1) })
    await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: 'no_pattern' })
    expect(probe).not.toHaveBeenCalled()
  })

  it('une salle de démonstration ne sonde jamais le réseau réel — l’estimé y est SEMÉ', async () => {
    const { service, probe } = setup({ demo: true })
    await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: 'demo' })
    expect(probe).not.toHaveBeenCalled()
  })

  it('un prénom seul ne s’estime pas', async () => {
    const { service } = setup({ contact: target({ full_name: 'Sophie' }) })
    await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: 'no_name' })
  })

  it('une écriture concurrente (adresse posée entre-temps) gagne : rien n’est journalisé', async () => {
    const { service, ports } = setup({ updated: 0 })
    await expect(service.estimateFor(WS, CONTACT_ID)).resolves.toEqual({ kind: 'skipped', reason: 'protected' })
    expect(ports.commitEstimate).not.toHaveBeenCalled()
  })
})
