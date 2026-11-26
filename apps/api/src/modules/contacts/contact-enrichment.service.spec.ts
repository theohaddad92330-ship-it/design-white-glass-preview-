import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import { isFailure, isSuccess } from '@bellum/utils'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ContactEnrichmentService } from './contact-enrichment.service'
import { contactEnrichmentJobId, type ContactEnrichmentJobResult } from './contact-enrichment.queue'
import type { ContactFailure, ContactsService } from './contacts.service'

const USER = '11111111-1111-1111-1111-111111111111'
const CONTACT = '22222222-2222-2222-2222-222222222222'

const DTO = { first_name: 'Owen', last_name: 'Renard', organization_name: 'Dirigo' }

type FakeJob = {
  id: string
  state: string
  returnvalue?: ContactEnrichmentJobResult
  remove: jest.Mock
}

function makeJob(over: Partial<FakeJob> = {}): FakeJob {
  return {
    id: contactEnrichmentJobId(CONTACT),
    state: 'waiting',
    remove: jest.fn(async () => undefined),
    ...over,
  }
}

function makeQueue(job: FakeJob | null = null) {
  const added: { name: string; data: unknown; opts: unknown }[] = []
  return {
    added,
    getJob: jest.fn(async () => (job ? { ...job, getState: async () => job.state } : null)),
    add: jest.fn(async (name: string, data: unknown, opts: unknown) => {
      added.push({ name, data, opts })
      return { id: (opts as { jobId?: string }).jobId }
    }),
  }
}

type Preflight = Awaited<ReturnType<ContactsService['preflightEnrichment']>>

function makeContacts(preflight: Preflight, readable = true) {
  return {
    preflightEnrichment: jest.fn(async () => preflight),
    canReadContact: jest.fn(async () => readable),
  } as unknown as ContactsService
}

function makeRepo(row: Partial<ContactEntity> | null) {
  // Honore le `where` (OU de #4803) : un repo qui rend la ligne quoi qu'on lui demande ne sait pas dire NON.
  return {
    findOne: jest.fn(async ({ where }: { where?: { user_id?: string }[] } = {}) =>
      row && where && !where.some(w => w.user_id === undefined || w.user_id === row.user_id) ? null : row,
    ),
  } as unknown as Repository<ContactEntity>
}

const OK_PREFLIGHT: Preflight = { type: 'success', output: { id: CONTACT } as ContactEntity }

function makeService(opts: {
  queue?: ReturnType<typeof makeQueue>
  preflight?: Preflight
  row?: Partial<ContactEntity> | null
}) {
  const queue = opts.queue ?? makeQueue()
  const service = new ContactEnrichmentService(
    queue as unknown as Queue,
    makeRepo(opts.row === undefined ? { id: CONTACT, user_id: USER } : opts.row),
    makeContacts(opts.preflight ?? OK_PREFLIGHT, opts.row !== null),
    { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1' })) } as unknown as WorkspaceContextService,
  )
  return { service, queue }
}

describe('ContactEnrichmentService — mise en file (le clic rend la main)', () => {
  it('met en file et renvoie un id de job déterminé par le contact', async () => {
    const { service, queue } = makeService({})

    const result = await service.enqueue(CONTACT, USER, DTO)

    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return
    expect(result.output).toEqual({ job_id: contactEnrichmentJobId(CONTACT), state: 'queued' })
    expect(queue.added).toHaveLength(1)
    expect(queue.added[0]!.data).toEqual({ contactId: CONTACT, userId: USER, ...DTO })
  })

  // #2988 — le filtre par coordonnée doit traverser TOUT le pipeline, pas
  // rester un champ de schéma mort : le worker n'a que les données du job pour
  // savoir quelle coordonnée ne pas enrichir (et ne pas débiter).
  it('#2988 — propage `only` (email | phone) dans les données du job', async () => {
    const { service, queue } = makeService({})

    const result = await service.enqueue(CONTACT, USER, { ...DTO, only: 'email' })

    expect(isSuccess(result)).toBe(true)
    expect(queue.added[0]!.data).toEqual({ contactId: CONTACT, userId: USER, ...DTO, only: 'email' })
  })

  it('#2988 — sans `only`, le job ne porte aucune clé `only` (comportement historique)', async () => {
    const { service, queue } = makeService({})

    await service.enqueue(CONTACT, USER, DTO)

    expect(queue.added[0]!.data).not.toHaveProperty('only')
  })

  it('refuse AVANT la file quand le préflight refuse — aucun job, aucun fournisseur appelé', async () => {
    const failure: ContactFailure = { code: 'insufficient_credits', message: 'plus de crédits' }
    const { service, queue } = makeService({ preflight: { type: 'failure', problem: failure } })

    const result = await service.enqueue(CONTACT, USER, DTO)

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.code).toBe('insufficient_credits')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('deux clics rapprochés partagent le même job — jamais deux cascades payées', async () => {
    const inflight = makeJob({ state: 'active' })
    const { service, queue } = makeService({ queue: makeQueue(inflight) })

    const result = await service.enqueue(CONTACT, USER, DTO)

    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return
    expect(result.output.state).toBe('running')
    expect(queue.add).not.toHaveBeenCalled()
    expect(inflight.remove).not.toHaveBeenCalled()
  })

  it('un job TERMINÉ est retiré avant la relance — sinon le clic suivant relit l’ancien résultat', async () => {
    const stale = makeJob({ state: 'completed' })
    const { service, queue } = makeService({ queue: makeQueue(stale) })

    const result = await service.enqueue(CONTACT, USER, DTO)

    expect(isSuccess(result)).toBe(true)
    expect(stale.remove).toHaveBeenCalledTimes(1)
    expect(queue.add).toHaveBeenCalledTimes(1)
  })
})

describe('ContactEnrichmentService — vérification en masse (#2296.38 à .41)', () => {
  const CONTACT_2 = '33333333-3333-3333-3333-333333333333'
  const CONTACT_3 = '44444444-4444-4444-4444-444444444444'

  function makeMultiRepo(rows: Record<string, Partial<ContactEntity> | undefined>) {
    return {
      findOne: jest.fn(async ({ where }: { where: { id: string }[] }) => rows[where[0]!.id] ?? null),
    } as unknown as Repository<ContactEntity>
  }

  function makeBulkService(opts: {
    rows: Record<string, Partial<ContactEntity> | undefined>
    preflight?: Preflight
    queue?: ReturnType<typeof makeQueue>
  }) {
    const queue = opts.queue ?? makeQueue()
    const service = new ContactEnrichmentService(
      queue as unknown as Queue,
      makeMultiRepo(opts.rows),
      makeContacts(opts.preflight ?? OK_PREFLIGHT),
      { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1' })) } as unknown as WorkspaceContextService,
    )
    return { service, queue }
  }

  it('met chaque contact en file séparément et rend un statut PAR CONTACT (#2296.39)', async () => {
    const { service, queue } = makeBulkService({
      rows: {
        [CONTACT]: { id: CONTACT, full_name: 'Owen Renard', entity: 'Direction Technique' },
        [CONTACT_2]: { id: CONTACT_2, full_name: 'Ada Lovelace', entity: 'Direction Data' },
      },
    })

    const outcomes = await service.enqueueBulk([CONTACT, CONTACT_2], USER)

    expect(outcomes).toHaveLength(2)
    expect(outcomes[0]).toMatchObject({ contact_id: CONTACT, ok: true })
    expect(outcomes[1]).toMatchObject({ contact_id: CONTACT_2, ok: true })
    expect(queue.added).toHaveLength(2)
    expect(queue.added[0]!.data).toMatchObject({
      first_name: 'Owen',
      last_name: 'Renard',
      organization_name: 'Direction Technique',
    })
    expect(queue.added[1]!.data).toMatchObject({
      first_name: 'Ada',
      last_name: 'Lovelace',
      organization_name: 'Direction Data',
    })
  })

  it('un contact introuvable ne bloque pas les autres — #2296.40 (ne pas invalider le lot)', async () => {
    const { service, queue } = makeBulkService({
      rows: { [CONTACT_2]: { id: CONTACT_2, full_name: 'Ada Lovelace', entity: 'Direction Data' } },
    })

    const outcomes = await service.enqueueBulk([CONTACT, CONTACT_2, CONTACT_3], USER)

    expect(outcomes).toEqual([
      { contact_id: CONTACT, ok: false, code: 'not_found' },
      { contact_id: CONTACT_2, ok: true, job_id: expect.any(String), state: 'queued' },
      { contact_id: CONTACT_3, ok: false, code: 'not_found' },
    ])
    // Un seul job réellement mis en file, pour le seul contact trouvé.
    expect(queue.added).toHaveLength(1)
  })

  it('un préflight refusé (crédits épuisés) sur PLUSIEURS contacts continue le lot jusqu’au bout', async () => {
    const failure: ContactFailure = { code: 'insufficient_credits', message: 'plus de crédits' }
    const { service, queue } = makeBulkService({
      rows: {
        [CONTACT]: { id: CONTACT, full_name: 'Owen Renard', entity: 'Direction Technique' },
        [CONTACT_2]: { id: CONTACT_2, full_name: 'Ada Lovelace', entity: 'Direction Data' },
      },
      preflight: { type: 'failure', problem: failure },
    })

    const outcomes = await service.enqueueBulk([CONTACT, CONTACT_2], USER)

    expect(outcomes).toEqual([
      { contact_id: CONTACT, ok: false, code: 'insufficient_credits' },
      { contact_id: CONTACT_2, ok: false, code: 'insufficient_credits' },
    ])
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('accepte cinquante contacts sans règle spéciale pour un poste mondial (#2296.38 / #2296.41)', async () => {
    const rows: Record<string, Partial<ContactEntity>> = {}
    const ids = Array.from({ length: 50 }, (_, i) => {
      const id = `55555555-5555-5555-5555-${String(i).padStart(12, '0')}`
      rows[id] = { id, full_name: `Contact ${i}`, entity: i === 0 ? 'Direction Groupe Monde' : 'Direction Locale' }
      return id
    })
    const { service, queue } = makeBulkService({ rows })

    const outcomes = await service.enqueueBulk(ids, USER)

    expect(outcomes).toHaveLength(50)
    expect(outcomes.every(o => o.ok)).toBe(true)
    // Le contact au périmètre mondial (le premier) suit exactement le même
    // chemin que les autres — aucune branche ne lit `entity` pour le traiter à part.
    expect(queue.added[0]!.data).toMatchObject({ organization_name: 'Direction Groupe Monde' })
    expect(queue.added).toHaveLength(50)
  })
})

describe('ContactEnrichmentService — suivi du job', () => {
  it('contact d’un autre utilisateur ⇒ not_found (le job n’est même pas consulté)', async () => {
    const { service, queue } = makeService({ row: null, queue: makeQueue(makeJob()) })

    const result = await service.status(CONTACT, USER)

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.code).toBe('not_found')
    expect(queue.getJob).not.toHaveBeenCalled()
  })

  // #4609.3 — l'écran liste les contacts PAR ESPACE : le contact d'un collègue se lit, son suivi aussi.
  it('#4609.3 — le contact d’un collègue de l’espace se lit : pas de 404', async () => {
    const { service } = makeService({ row: { id: CONTACT, user_id: 'un-collegue' } })

    const result = await service.status(CONTACT, USER)

    expect(isSuccess(result)).toBe(true)
  })

  it('en file → queued, en cours → running', async () => {
    for (const [state, expected] of [
      ['waiting', 'queued'],
      ['delayed', 'queued'],
      ['prioritized', 'queued'],
      ['active', 'running'],
    ] as const) {
      const { service } = makeService({ queue: makeQueue(makeJob({ state })) })
      const result = await service.status(CONTACT, USER)
      expect(isSuccess(result)).toBe(true)
      if (!isSuccess(result)) return
      expect(result.output.state).toBe(expected)
    }
  })

  it('terminé avec succès → done + la charge utile du contact enrichi', async () => {
    const payload = { id: CONTACT, email: 'owen@dirigo.fr', credits_remaining: 390 }
    const job = makeJob({
      state: 'completed',
      returnvalue: { ok: true, contact: payload as never },
    })
    const { service } = makeService({ queue: makeQueue(job) })

    const result = await service.status(CONTACT, USER)

    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return
    expect(result.output).toEqual({ state: 'done', job_id: job.id, result: payload })
  })

  it('échec MÉTIER → l’échec typé d’origine (le client garde ses messages localisés)', async () => {
    const job = makeJob({
      state: 'completed',
      returnvalue: {
        ok: false,
        failure: { code: 'enrichment_unavailable', message: 'fournisseur indisponible', reason: 'rate_limited' },
      },
    })
    const { service } = makeService({ queue: makeQueue(job) })

    const result = await service.status(CONTACT, USER)

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem).toEqual({
      code: 'enrichment_unavailable',
      message: 'fournisseur indisponible',
      reason: 'rate_limited',
    })
  })

  it('job planté (exception) → « fournisseur indisponible », jamais « rien trouvé »', async () => {
    const { service } = makeService({ queue: makeQueue(makeJob({ state: 'failed' })) })

    const result = await service.status(CONTACT, USER)

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.code).toBe('enrichment_unavailable')
    expect(result.problem.reason).toBe('upstream_error')
  })

  it('plus de trace du job → unknown (on a perdu la réponse, ce n’est pas une absence de données)', async () => {
    const { service } = makeService({ queue: makeQueue(null) })

    const result = await service.status(CONTACT, USER)

    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return
    expect(result.output.state).toBe('unknown')
  })
})
