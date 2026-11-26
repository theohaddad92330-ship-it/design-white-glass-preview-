import { buildTriggerEvent, triggerPeriodQualifier } from '@bellum/contracts'
import type { CanonicalTriggerEventEntity } from '../../database/entities/canonical-trigger-event.entity'
import { createMockRepository } from '../../database/test-utils'
import { TriggerRegistryService } from './trigger-registry.service'

/**
 * #2875 (#2402.1, #2402.9, dédoublonnage 27/09) — le registre unique, PAS
 * ENCORE le moteur. `record` ne CONSTRUIT rien : il persiste le `TriggerEvent`
 * que l'appelant a déjà construit via `buildTriggerEvent`, seul point de
 * construction attendu (#2402.2).
 */
describe('TriggerRegistryService (#2875)', () => {
  const event = buildTriggerEvent({
    type: 'duplicate_pair_detected',
    source: 'governance',
    subjectType: 'account',
    subjectId: 'p1',
    workspaceId: 'ws-1',
    ownerId: null,
    evidence: 'Même adresse',
    confidence: 'estimee',
    now: new Date('2026-09-27T00:00:00.000Z'),
  })

  it('persiste le TriggerEvent reçu, sans en recalculer la forme', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    const service = new TriggerRegistryService(events as never)
    await service.record(event, 'governance.service')
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        kind: 'duplicate_pair_detected',
        source_module: 'governance.service',
      }),
    )
  })

  it('un type hors du CHECK de cette table n’est pas persisté — émetteur pas encore migré ici', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    const service = new TriggerRegistryService(events as never)
    // #2402.1 (vague F/G 27/09) — les cinq émetteurs listés par l'issue sont
    // désormais tous migrés (voir canonical-trigger.test.ts), `signal_nouveau`
    // et `besoin_entrant` compris (lot R03, 29/09) ; `changement_decideur` l'est
    // aussi depuis le lot P (#2875, 01/10) et `referencement_detecte` depuis le
    // lot X54 (02/10) ; `silence_client` (alias catalogue de `submission_stalled`)
    // n'a pas sa propre valeur de CHECK, donc hors table.
    const unmigrated = buildTriggerEvent({
      type: 'silence_client',
      source: 'discover',
      subjectType: 'account',
      subjectId: 'p1',
      workspaceId: 'ws-1',
      ownerId: null,
      evidence: 'Silence client',
      now: new Date('2026-09-27T00:00:00.000Z'),
    })
    await service.record(unmigrated, 'test.unmigrated')
    expect(events.save).not.toHaveBeenCalled()
  })

  it('best-effort — une écriture en échec ne remonte jamais : le geste d’origine continue', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    events.save.mockRejectedValue(new Error('connexion perdue'))
    const service = new TriggerRegistryService(events as never)
    await expect(service.record(event, 'governance.service')).resolves.toBeUndefined()
  })

  // #3915.1 — le registre garde ce que le TriggerEvent porte déjà : sans
  // gravité, clé de dédup, expiration et statut persistés, nul lecteur
  // (alertes #3920, lecteur unique #3928) ne peut trier, dédoublonner ni
  // ignorer un événement périmé ou résolu.
  it('persiste gravité, clé de dédup, expiration et statut du TriggerEvent', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    const service = new TriggerRegistryService(events as never)
    // #4778 — dates RELATIVES, calculées UNE fois : une date absolue échoit un jour (le service écarte l'échu).
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const withExpiry = buildTriggerEvent({
      type: 'duplicate_pair_detected',
      source: 'governance',
      subjectType: 'account',
      subjectId: 'p2',
      workspaceId: 'ws-1',
      ownerId: null,
      evidence: 'Même adresse',
      expiresAt: expiresAt.toISOString(),
      now,
    })
    await service.record(withExpiry, 'governance.service', now)
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: withExpiry.severity,
        dedupe_key: 'ws-1:duplicate_pair_detected:p2',
        expires_at: expiresAt,
        status: 'open',
      }),
    )
  })

  it('une expiration absente reste NULL, jamais une date inventée', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    const service = new TriggerRegistryService(events as never)
    await service.record(event, 'governance.service')
    expect(events.save).toHaveBeenCalledWith(expect.objectContaining({ expires_at: null }))
  })

  // #2875 (lot E2) — severity / expires_at / status / dedupe_key : lus, plus seulement écrits.
  describe('lecteurs de status / expiresAt (#2875)', () => {
    const now = new Date('2026-10-13T10:00:00.000Z')

    it('record : un événement résolu ne déclenche plus rien, il n’est pas écrit', async () => {
      const events = createMockRepository<CanonicalTriggerEventEntity>()
      const service = new TriggerRegistryService(events as never)
      await service.record({ ...event, status: 'resolved' }, 'governance.service', now)
      expect(events.save).not.toHaveBeenCalled()
    })

    it('record : un événement échu ne déclenche plus rien', async () => {
      const events = createMockRepository<CanonicalTriggerEventEntity>()
      const service = new TriggerRegistryService(events as never)
      await service.record({ ...event, expiresAt: '2026-10-13T09:00:00.000Z' }, 'governance.service', now)
      expect(events.save).not.toHaveBeenCalled()
    })

    it('record : la gravité, la clé, l’échéance et le statut sont écrits avec le fait', async () => {
      const events = createMockRepository<CanonicalTriggerEventEntity>()
      const service = new TriggerRegistryService(events as never)
      await service.record({ ...event, expiresAt: '2026-10-20T00:00:00.000Z' }, 'governance.service', now)
      expect(events.save).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: event.severity,
          dedupe_key: event.dedupeKey,
          expires_at: new Date('2026-10-20T00:00:00.000Z'),
          status: 'open',
        }),
      )
    })
  })
})

/**
 * #3918.a (lot M01) — `recordOnce` : un balayage QUOTIDIEN ne réécrit pas
 * chaque matin le même signal, et le rattachement au compte posé APRÈS la
 * première écriture rattrape la ligne existante (doctrine « un correctif de
 * collecte rattrape l'existant », ciblé sur ce sujet).
 */
describe('TriggerRegistryService.recordOnce (#3918.a)', () => {
  const crmEvent = buildTriggerEvent({
    type: 'affaire_perdue',
    source: 'crm-deal-signals',
    subjectType: 'crm_deal',
    subjectId: 'deal-1',
    workspaceId: 'ws-1',
    ownerId: null,
    evidence: 'TMA AXA : affaire perdue il y a 3 mois.',
    now: new Date('2026-10-09T06:30:00.000Z'),
  })
  const context = { accountId: 'acc-1', factOccurredAt: '2026-07-01T00:00:00.000Z' }

  function build(existing: unknown[]) {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => (sql.includes('SELECT') ? existing : []))
    const events = { ...createMockRepository<CanonicalTriggerEventEntity>(), manager: { query } }
    return { service: new TriggerRegistryService(events as never), events, query }
  }

  it('écrit le sujet une seule fois, avec son compte et la date du FAIT', async () => {
    const { service, events } = build([])
    expect(await service.recordOnce(crmEvent, 'crm/crm-deal-signals.sweeper', context)).toBe(true)
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'affaire_perdue',
        payload: expect.objectContaining({ subjectId: 'deal-1', accountId: 'acc-1' }),
        occurred_at: new Date('2026-07-01T00:00:00.000Z'),
      }),
    )
  })

  it('le même sujet déjà consigné : rien de neuf, mais le compte rattaché après coup est reporté', async () => {
    const { service, events, query } = build([{ id: 'row-1' }])
    expect(await service.recordOnce(crmEvent, 'crm/crm-deal-signals.sweeper', context)).toBe(false)
    expect(events.save).not.toHaveBeenCalled()
    const update = query.mock.calls.find(([sql]) => String(sql).includes('UPDATE canonical_trigger_events'))
    expect(update?.[1]).toEqual(['row-1', JSON.stringify({ accountId: 'acc-1' })])
  })
})

/**
 * #2875 (lot E2) — `recordOnceByDedupeKey` : UNE ligne par `dedupeKey` (par
 * espace et par genre), sur la colonne réelle `dedupe_key` (#3915.1) — jamais
 * le sujet, qui reste partagé par plusieurs faits distincts.
 *
 * ⚠️ La lecture préalable n'est pas une garantie d'unicité sous concurrence
 * (aucun index unique sur cette table) : elle évite le doublon des passages
 * successifs, qui est le cas réel d'un balayage.
 */
describe('TriggerRegistryService.recordOnceByDedupeKey (#2875 E2)', () => {
  const event = buildTriggerEvent({
    type: 'duplicate_pair_detected',
    source: 'governance',
    subjectType: 'account',
    subjectId: 'p1',
    workspaceId: 'ws-1',
    ownerId: null,
    evidence: 'Même adresse',
    confidence: 'estimee',
    now: new Date('2026-09-27T00:00:00.000Z'),
  })
  const now = new Date('2026-10-13T10:00:00.000Z')

  it('même dedupe_key déjà connue : aucune nouvelle ligne', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    events.manager.query.mockResolvedValue([{ one: 1 }])
    const service = new TriggerRegistryService(events as never)
    await expect(service.recordOnceByDedupeKey(event, 'governance.service', now)).resolves.toBe('duplicate')
    expect(events.save).not.toHaveBeenCalled()
    expect(events.manager.query).toHaveBeenCalledWith(expect.stringContaining('dedupe_key'), [
      'ws-1',
      'duplicate_pair_detected',
      event.dedupeKey,
    ])
  })

  it('dedupe_key inconnue : une ligne', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    const service = new TriggerRegistryService(events as never)
    await expect(service.recordOnceByDedupeKey(event, 'governance.service', now)).resolves.toBe('recorded')
    expect(events.save).toHaveBeenCalledTimes(1)
  })

  it('même sujet, dedupe_key différentes : deux lignes (la clé décide, pas le sujet)', async () => {
    const stored = new Set<string>()
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    events.manager.query.mockImplementation(async (_sql: string, params?: unknown[]) =>
      stored.has(String(params?.[2])) ? [{ one: 1 }] : [],
    )
    events.save.mockImplementation(async (row: CanonicalTriggerEventEntity) => {
      stored.add(String(row.dedupe_key))
      return row
    })
    const service = new TriggerRegistryService(events as never)
    const a = { ...event, dedupeKey: 'ws-1:duplicate_pair_detected:p1:2026-10-12' }
    const b = { ...event, dedupeKey: 'ws-1:duplicate_pair_detected:p1:2026-10-13' }
    expect(await service.recordOnceByDedupeKey(a, 'governance.service', now)).toBe('recorded')
    expect(await service.recordOnceByDedupeKey(b, 'governance.service', now)).toBe('recorded')
    expect(await service.recordOnceByDedupeKey(a, 'governance.service', now)).toBe('duplicate')
    expect(events.save).toHaveBeenCalledTimes(2)
  })

  it('un événement résolu n’est ni écrit ni cherché', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    const service = new TriggerRegistryService(events as never)
    await expect(
      service.recordOnceByDedupeKey({ ...event, status: 'resolved' }, 'governance.service', now),
    ).resolves.toBe('inactive')
    expect(events.manager.query).not.toHaveBeenCalled()
    expect(events.save).not.toHaveBeenCalled()
  })

  it('un genre hors CHECK est ignoré sans erreur', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    const service = new TriggerRegistryService(events as never)
    const unmigrated = { ...event, type: 'silence_client' as const }
    await expect(service.recordOnceByDedupeKey(unmigrated, 'test', now)).resolves.toBe('skipped')
  })

  it('best-effort — la lecture en échec ne remonte pas et n’écrit rien', async () => {
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    events.manager.query.mockRejectedValue(new Error('connexion perdue'))
    const service = new TriggerRegistryService(events as never)
    await expect(service.recordOnceByDedupeKey(event, 'governance.service', now)).resolves.toBe('skipped')
    expect(events.save).not.toHaveBeenCalled()
  })

  it('deux émissions identiques → une ligne ; même émetteur à une autre date → deux (clé datée)', async () => {
    const rows = new Set<string>()
    const events = createMockRepository<CanonicalTriggerEventEntity>()
    events.manager.query.mockImplementation(async (_sql: string, params: string[]) =>
      rows.has(params[2]) ? [{ one: 1 }] : [],
    )
    events.save.mockImplementation(async (row: { dedupe_key: string }) => {
      rows.add(row.dedupe_key)
      return row
    })
    const service = new TriggerRegistryService(events as never)
    const emit = (day: string) => {
      const at = new Date(`${day}T08:00:00.000Z`)
      return buildTriggerEvent({
        type: 'deadline_ao',
        source: 'discover',
        subjectType: 'project_need',
        subjectId: 'need-1',
        workspaceId: 'ws-1',
        ownerId: null,
        evidence: 'AO',
        now: at,
        dedupeQualifier: triggerPeriodQualifier(at, 'day'),
      })
    }
    const now = new Date('2026-10-15T10:00:00.000Z')
    await service.recordOnceByDedupeKey(emit('2026-10-15'), 'sweeper', now)
    await service.recordOnceByDedupeKey(emit('2026-10-15'), 'sweeper', now)
    expect(rows.size).toBe(1)
    await service.recordOnceByDedupeKey(emit('2026-10-16'), 'sweeper', now)
    expect(rows.size).toBe(2)
  })
})
