import { createMockRepository } from '../../database/test-utils'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import {
  BEHAVIORAL_EVENT_NAMES,
  ProductAnalyticsService,
  sanitizeBehavioralProperties,
  sanitizeProperties,
} from './product-analytics.service'

function makeService() {
  const repo = createMockRepository<ProductEventEntity>()
  const service = new ProductAnalyticsService(repo as never)
  return { service, repo }
}

describe('ProductAnalyticsService.track', () => {
  it('appends one product_events row with the expected shape', async () => {
    const { service, repo } = makeService()

    await service.track('analysis_started', {
      userId: 'user-1',
      workspaceId: 'ws-1',
      properties: { scope_mode: 'group' },
      sessionId: 'sess-9',
    })

    expect(repo.save).toHaveBeenCalledTimes(1)
    expect(repo.create).toHaveBeenCalledWith({
      event_name: 'analysis_started',
      user_id: 'user-1',
      workspace_id: 'ws-1',
      properties: { scope_mode: 'group' },
      session_id: 'sess-9',
    })
  })

  it('defaults workspace_id / session_id / properties when omitted', async () => {
    const { service, repo } = makeService()

    await service.track('onboarding_completed', { userId: 'user-2' })

    expect(repo.create).toHaveBeenCalledWith({
      event_name: 'onboarding_completed',
      user_id: 'user-2',
      workspace_id: null,
      properties: {},
      session_id: null,
    })
  })

  it('skips the write when there is no user to attribute (never a null user_id)', async () => {
    const { service, repo } = makeService()

    await service.track('message_sent', { userId: '' })

    expect(repo.save).not.toHaveBeenCalled()
  })

  it('is best-effort: a DB failure is swallowed, never thrown to the caller', async () => {
    const { service, repo } = makeService()
    repo.save.mockRejectedValueOnce(new Error('db down'))

    // The business flow that emitted the event must not see this reject.
    await expect(service.track('contact_enriched', { userId: 'user-3' })).resolves.toBeUndefined()
  })
})

describe('sanitizeProperties', () => {
  it('drops obviously-sensitive keys (token / email / password / phone)', () => {
    const out = sanitizeProperties({
      scope_mode: 'france',
      email: 'a@b.com',
      access_token: 'secret',
      userPassword: 'x',
      contactPhone: '0600',
      keep: 1,
    })
    expect(out).toEqual({ scope_mode: 'france', keep: 1 })
  })

  it('caps long string values and collapses non-objects to {}', () => {
    const long = 'x'.repeat(1000)
    const out = sanitizeProperties({ note: long })
    expect((out.note as string).length).toBe(500)
    expect(sanitizeProperties(undefined)).toEqual({})
  })
})

/**
 * #1681.4/#1682 — le flux COMPORTEMENTAL, séparé de `track()` ci-dessus.
 *
 * `trackBehavioral` est le pendant EXACT de `track()`, avec l'attribution
 * inversée : `track()` refuse d'écrire sans `userId` (jamais un acteur
 * inventé) ; `trackBehavioral` refuse d'écrire sans `sessionHash` (jamais une
 * session inventée), et écrit `user_id`/`workspace_id` à `null`
 * INCONDITIONNELLEMENT — ce n'est pas un défaut qu'on pourrait lire sur la
 * ligne, c'est la propriété qui rend la doctrine (règle 5, « rien par espace
 * client NOMMÉ ») vraie sans dépendre de la discipline de l'appelant.
 */
describe('ProductAnalyticsService.trackBehavioral', () => {
  it('écrit une ligne SANS user_id ni workspace_id, portée par le hash de session', async () => {
    const { service, repo } = makeService()

    await service.trackBehavioral('screen_viewed', {
      sessionHash: 'hash-abc123',
      properties: { route: '/dashboard', previousViewDurationMs: 4200, provenance: '/login' },
    })

    expect(repo.save).toHaveBeenCalledTimes(1)
    expect(repo.create).toHaveBeenCalledWith({
      event_name: 'screen_viewed',
      user_id: null,
      workspace_id: null,
      properties: { route: '/dashboard', previousViewDurationMs: 4200, provenance: '/login' },
      session_id: 'hash-abc123',
    })
  })

  it('n’écrit RIEN sans hash de session — symétrique à « jamais un user_id null »', async () => {
    const { service, repo } = makeService()

    await service.trackBehavioral('screen_viewed', { sessionHash: '', properties: { route: '/x' } })

    expect(repo.save).not.toHaveBeenCalled()
  })

  it('est best-effort : un échec de la base est avalé, jamais renvoyé à l’appelant', async () => {
    const { service, repo } = makeService()
    repo.save.mockRejectedValueOnce(new Error('db down'))

    await expect(
      service.trackBehavioral('error_shown', { sessionHash: 'h1', properties: { screen: 'x', errorCode: 'E1' } }),
    ).resolves.toBeUndefined()
  })

  it('l’union des 37 événements comportementaux est FERMÉE et connue', () => {
    expect([...BEHAVIORAL_EVENT_NAMES].sort()).toEqual(
      [
        'screen_viewed',
        'screen_left',
        'tab_opened',
        'action_started',
        'action_completed',
        'action_abandoned',
        'filter_applied',
        'search_performed',
        'error_shown',
        // #1946 — décision Louis 14/09/2026 : l'union s'ÉLARGIT, aucune des
        // cinq règles ne se lève.
        'assistant_first_question_sent',
        'suggestion_clicked',
        'assistant_first_useful_result',
        'assistant_answer_judged',
        'assistant_redirect_followed',
        'prepared_action_stage',
        'draft_reused',
        'intervention_outcome',
        'memory_added',
        // #2085 — les frictions du parcours d'onboarding.
        'onboarding_prefill_reviewed',
        'onboarding_step_back',
        // #2985 — le Meeting OS (#2767 : jusqu'ici écrit par le navigateur et
        // jeté en silence à la réception, absent de cette liste blanche).
        'brief_generated',
        'brief_opened',
        'question_used',
        'notes_added',
        'summary_generated',
        'summary_approved',
        'actions_created',
        'followup_created',
        'false_association_corrected',
        // #2319.123 — trou du même jour que les neuf ci-dessus.
        'meeting_completed',
        // #2108.49-.53 — le geste accepter/reporter/rejeter/corriger sur une
        // carte de priorité (#2767, ce lot).
        'priority_viewed',
        'priority_accepted',
        'priority_snoozed',
        'priority_rejected',
        'priority_corrected',
        // #2108.54 — une tâche cochée (#2767, ce lot).
        'task_completed',
        'crm_writeback_confirmed',
      ].sort(),
    )
  })

  it('#1946 — les NEUF d’origine gardent leur place, les neuf nouveaux s’ajoutent à la fin (GA-08)', () => {
    // Un enum ne perd jamais de valeur et n'en insère jamais au milieu : la
    // liste voyage vers `event_name` en base et vers trois gardes qui la
    // recopient. Ce test dit NON à une insertion au milieu, pas seulement à une
    // suppression.
    expect([...BEHAVIORAL_EVENT_NAMES].slice(0, 9)).toEqual([
      'screen_viewed',
      'screen_left',
      'tab_opened',
      'action_started',
      'action_completed',
      'action_abandoned',
      'filter_applied',
      'search_performed',
      'error_shown',
    ])
    expect(BEHAVIORAL_EVENT_NAMES).toHaveLength(37)
  })

  it('#2085 — les deux formes du 15/09/2026 s’ajoutent à la fin, après les neuf de #1946', () => {
    expect([...BEHAVIORAL_EVENT_NAMES].slice(18, 20)).toEqual(['onboarding_prefill_reviewed', 'onboarding_step_back'])
  })

  it('#2985 — les neuf formes du Meeting OS s’ajoutent à la fin, après les deux de #2085 (#2767)', () => {
    expect([...BEHAVIORAL_EVENT_NAMES].slice(20, 29)).toEqual([
      'brief_generated',
      'brief_opened',
      'question_used',
      'notes_added',
      'summary_generated',
      'summary_approved',
      'actions_created',
      'followup_created',
      'false_association_corrected',
    ])
  })

  it('#2319.123 / #2108.49-.53 — meeting_completed puis les cinq mesures d’une carte de priorité s’ajoutent à la fin (#2767, 29/09/2026)', () => {
    expect([...BEHAVIORAL_EVENT_NAMES].slice(-8, -2)).toEqual([
      'meeting_completed',
      'priority_viewed',
      'priority_accepted',
      'priority_snoozed',
      'priority_rejected',
      'priority_corrected',
    ])
  })

  it('#2108.54 — task_completed s’ajoute à la fin, après les cinq mesures de carte (#2767, 30/09/2026)', () => {
    expect([...BEHAVIORAL_EVENT_NAMES].slice(-2, -1)).toEqual(['task_completed'])
  })

  it('#2319.129/.130 — crm_writeback_confirmed s’ajoute à la fin, sans rien déplacer (30/09/2026)', () => {
    expect([...BEHAVIORAL_EVENT_NAMES].slice(-1)).toEqual(['crm_writeback_confirmed'])
  })
})

/**
 * #1682 — `sanitizeBehavioralProperties` est une LISTE BLANCHE par événement,
 * pas la liste noire de `sanitizeProperties` : `filter_applied` n'a jamais eu
 * de clé « autorisée » pour une valeur de filtre, donc aucun nom de clé,
 * anodin ou non, ne peut la faire passer — la protection ne dépend pas d'avoir
 * deviné le bon nom à interdire.
 */
describe('sanitizeBehavioralProperties', () => {
  it('ne garde que les clés du contrat de l’événement — tout le reste tombe', () => {
    const out = sanitizeBehavioralProperties('filter_applied', {
      screen: 'accounts',
      filterName: 'secteur',
      // #1682 — même sous un nom anodin, une VALEUR de filtre n'est jamais une
      // clé autorisée pour cet événement : une liste blanche n'a pas besoin
      // d'avoir deviné le nom pour la refuser.
      filterValue: 'banque',
      value: 'banque',
    })
    expect(out).toEqual({ screen: 'accounts', filterName: 'secteur' })
  })

  it('ne garde que les clés du contrat pour search_performed — jamais la requête', () => {
    const out = sanitizeBehavioralProperties('search_performed', {
      screen: 'contacts',
      resultCount: 12,
      query: 'directeur technique lyon',
    })
    expect(out).toEqual({ screen: 'contacts', resultCount: 12 })
  })

  it('rejette une valeur qui n’est ni chaîne ni nombre ni booléen', () => {
    const out = sanitizeBehavioralProperties('error_shown', {
      screen: 'accounts',
      errorCode: { nested: true } as unknown as string,
    })
    expect(out).toEqual({ screen: 'accounts' })
  })

  it('borne la longueur d’une chaîne — même une clé autorisée n’est pas un texte libre illimité', () => {
    const out = sanitizeBehavioralProperties('error_shown', { screen: 'x', errorCode: 'E'.repeat(500) })
    expect((out.errorCode as string).length).toBeLessThanOrEqual(200)
  })

  it('un objet vide ou non-objet s’effondre en {}', () => {
    expect(sanitizeBehavioralProperties('tab_opened', undefined)).toEqual({})
    expect(sanitizeBehavioralProperties('tab_opened', null as unknown as Record<string, unknown>)).toEqual({})
  })

  it('#1946.2 — un clic de suggestion garde son RANG et perd son libellé', () => {
    const out = sanitizeBehavioralProperties('suggestion_clicked', {
      screen: '/chat',
      rank: 2,
      // Le texte d'une suggestion de Laura est bâti sur le portefeuille du
      // client : c'est le pipe commercial, sous un nom anodin.
      label: 'Analyser Société Générale',
      suggestionText: 'Analyser Société Générale',
    })
    expect(out).toEqual({ screen: '/chat', rank: 2 })
  })

  it('#1946.16/.24 — un brouillon repris garde son DEGRÉ et perd les deux textes', () => {
    const out = sanitizeBehavioralProperties('draft_reused', {
      screen: '/chat',
      extent: 'reecrit',
      draftText: 'Bonjour Marc, suite à notre échange…',
      sentText: 'Bonjour Marc, comme convenu…',
    })
    expect(out).toEqual({ screen: '/chat', extent: 'reecrit' })
  })

  it('#1946.10 — une intervention garde sa NATURE et son sort, jamais son destinataire', () => {
    const out = sanitizeBehavioralProperties('intervention_outcome', {
      intervention: 'compte_sans_prochaine_action',
      outcome: 'ignoree',
      accountId: '3f1c9d2e-0000-4000-8000-000000000000',
      contactEmail: 'marc@exemple.fr',
    })
    expect(out).toEqual({ intervention: 'compte_sans_prochaine_action', outcome: 'ignoree' })
  })

  it('#1946.5-.8 — une action préparée garde son NOM et son étape, jamais sa cible', () => {
    const out = sanitizeBehavioralProperties('prepared_action_stage', {
      action: 'relance_compte',
      stage: 'executee',
      target: 'Société Générale',
      accountName: 'Société Générale',
    })
    expect(out).toEqual({ action: 'relance_compte', stage: 'executee' })
  })

  it('#1946.11 — mémoire ajoutée ne porte QUE l’écran', () => {
    expect(sanitizeBehavioralProperties('memory_added', { screen: '/chat', memory: 'le DSI part en mars' })).toEqual({
      screen: '/chat',
    })
  })

  it('#2085.5/.19/.20 — une suggestion préremplie garde son VERDICT, jamais la valeur devinée ni la valeur saisie', () => {
    const out = sanitizeBehavioralProperties('onboarding_prefill_reviewed', {
      screen: '/onboarding/$id/$stage/$slug',
      outcome: 'corrected',
      guessedValue: 'Société Générale',
      value: 'Société Générale — filiale IT',
    })
    expect(out).toEqual({ screen: '/onboarding/$id/$stage/$slug', outcome: 'corrected' })
  })

  it('#2085.17 — un retour arrière ne porte que l’écran', () => {
    expect(
      sanitizeBehavioralProperties('onboarding_step_back', {
        screen: '/onboarding/$id/$stage/$slug',
        fromStep: 'expertise_areas',
      }),
    ).toEqual({ screen: '/onboarding/$id/$stage/$slug' })
  })

  it('#2985 — une question cochée garde le RANG rendu, jamais son texte', () => {
    const out = sanitizeBehavioralProperties('question_used', {
      screen: '/briefing',
      rank: 2,
      question: 'Où en est le budget cybersécurité ?',
    })
    expect(out).toEqual({ screen: '/briefing', rank: 2 })
  })

  it('#2985 — les huit autres formes du Meeting OS ne portent que l’écran', () => {
    for (const name of [
      'brief_generated',
      'brief_opened',
      'notes_added',
      'summary_generated',
      'summary_approved',
      'actions_created',
      'followup_created',
      'false_association_corrected',
    ] as const) {
      expect(sanitizeBehavioralProperties(name, { screen: '/accounts/acc_1', notes: 'texte du compte rendu' })).toEqual(
        {
          screen: '/accounts/acc_1',
        },
      )
    }
  })
})

/**
 * #1682 — le point d'ENTRÉE du traceur front : un lot d'événements, sans JWT
 * (`sendBeacon` ne porte pas d'en-tête). `ingestBehavioralBatch` est donc le
 * SEUL endroit qui valide une forme non fiable — c'est un batch reçu du
 * navigateur, jamais un service interne.
 */
describe('ProductAnalyticsService.ingestBehavioralBatch', () => {
  it('hache le germe de session et écrit chaque événement valide', async () => {
    const { service, repo } = makeService()

    const result = await service.ingestBehavioralBatch({
      sessionSeed: 'seed-xyz',
      events: [
        {
          name: 'tab_opened',
          occurredAt: '2026-09-09T10:00:00.000Z',
          properties: { screen: 'accounts', tab: 'contacts' },
        },
        {
          name: 'error_shown',
          occurredAt: '2026-09-09T10:00:01.000Z',
          properties: { screen: 'accounts', errorCode: 'E1' },
        },
      ],
    })

    expect(result).toEqual({ accepted: 2 })
    // BELLUM-API-1/4/3/C — UN seul INSERT multi-lignes pour le lot, pas une transaction par événement.
    expect(repo.save).not.toHaveBeenCalled()
    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.insert.mock.calls[0]?.[0]).toHaveLength(2)
    const firstRow = repo.create.mock.calls[0]?.[0] as ProductEventEntity
    expect(firstRow.event_name).toBe('tab_opened')
    expect(firstRow.user_id).toBeNull()
    expect(firstRow.workspace_id).toBeNull()
    expect(typeof firstRow.session_id).toBe('string')
    expect((firstRow.session_id as string).length).toBeGreaterThan(0)
  })

  it('le même germe, la même minute, donne le même hash sur les deux lignes du lot', async () => {
    const { service, repo } = makeService()

    await service.ingestBehavioralBatch({
      sessionSeed: 'seed-same',
      events: [
        { name: 'tab_opened', occurredAt: '2026-09-09T10:00:00.000Z', properties: { screen: 'a', tab: 'b' } },
        { name: 'tab_opened', occurredAt: '2026-09-09T10:00:05.000Z', properties: { screen: 'a', tab: 'c' } },
      ],
    })

    const first = repo.create.mock.calls[0]?.[0] as ProductEventEntity
    const second = repo.create.mock.calls[1]?.[0] as ProductEventEntity
    expect(first.session_id).toBe(second.session_id)
  })

  it('rejette un lot sans germe de session — aucune écriture', async () => {
    const { service, repo } = makeService()

    const result = await service.ingestBehavioralBatch({
      sessionSeed: '',
      events: [{ name: 'tab_opened', occurredAt: '2026-09-09T10:00:00.000Z', properties: {} }],
    })

    expect(result).toEqual({ accepted: 0 })
    expect(repo.insert).not.toHaveBeenCalled()
  })

  it('rejette silencieusement un nom d’événement hors de l’union fermée', async () => {
    const { service, repo } = makeService()

    const result = await service.ingestBehavioralBatch({
      sessionSeed: 'seed-1',
      events: [{ name: 'member_removed', occurredAt: '2026-09-09T10:00:00.000Z', properties: {} }],
    })

    expect(result).toEqual({ accepted: 0 })
    expect(repo.insert).not.toHaveBeenCalled()
  })

  it('borne la taille d’un lot — un navigateur compromis ne peut pas écrire un lot illimité', async () => {
    const { service, repo } = makeService()
    const events = Array.from({ length: 500 }, () => ({
      name: 'tab_opened' as const,
      occurredAt: '2026-09-09T10:00:00.000Z',
      properties: { screen: 'a', tab: 'b' },
    }))

    const result = await service.ingestBehavioralBatch({ sessionSeed: 'seed-1', events })

    expect(result.accepted).toBeLessThan(500)
    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.insert.mock.calls[0]?.[0]).toHaveLength(result.accepted)
  })

  it('ne lève JAMAIS sur une charge complètement inattendue', async () => {
    const { service } = makeService()

    await expect(service.ingestBehavioralBatch(null)).resolves.toEqual({ accepted: 0 })
    await expect(service.ingestBehavioralBatch('garbage')).resolves.toEqual({ accepted: 0 })
    await expect(service.ingestBehavioralBatch({})).resolves.toEqual({ accepted: 0 })
    await expect(service.ingestBehavioralBatch({ events: 'nope' })).resolves.toEqual({ accepted: 0 })
  })
})
