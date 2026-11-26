import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initProductTracker,
  notifyRouteViewed,
  resetProductTrackerForTests,
  trackActionAbandoned,
  trackActionCompleted,
  trackActionsCreated,
  trackActionStarted,
  trackAssistantAnswerJudged,
  trackAssistantQuestionSent,
  trackAssistantRedirectFollowed,
  trackBriefGenerated,
  trackBriefOpened,
  trackConnectorActivated,
  trackContradictionResolved,
  trackDataImported,
  trackDraftReused,
  trackErrorShown,
  trackFalseAssociationCorrected,
  trackFilterApplied,
  trackFollowupCreated,
  trackInterventionOutcome,
  trackInvitationSent,
  trackMeetingCompleted,
  trackMemoryAdded,
  trackNotesAdded,
  trackOnboardingAuditGenerated,
  trackOnboardingAuditValidated,
  trackOnboardingFirstValueViewed,
  trackOnboardingStepBack,
  trackPreparedActionStage,
  trackPrefillReviewed,
  trackPriorityAccepted,
  trackPriorityCorrected,
  trackPriorityRejected,
  trackPrioritySnoozed,
  trackPriorityViewed,
  trackQuestionUsed,
  trackSearchPerformed,
  trackSuggestionClicked,
  trackSummaryApproved,
  trackSummaryGenerated,
  trackTabOpened,
  trackTaskCompleted,
  trackCrmWritebackConfirmed,
  trackedMutation,
} from './product-tracker'

const ENV = import.meta.env as Record<string, unknown>

type SentEvent = { name: string; properties: Record<string, unknown>; occurredAt: string }
type SentPayload = { sessionSeed: string; events: SentEvent[] }

function enable(): void {
  ENV.VITE_PRODUCT_TRACKER_ENABLED = 'true'
}
function disable(): void {
  delete ENV.VITE_PRODUCT_TRACKER_ENABLED
}

function mockedFetch() {
  return fetch as unknown as ReturnType<typeof vi.fn>
}

function fetchPayloads(): SentPayload[] {
  return mockedFetch()
    .mock.calls.filter(call => typeof call[0] === 'string' && (call[0] as string).endsWith('/analytics/events'))
    .map(call => JSON.parse((call[1] as RequestInit).body as string) as SentPayload)
}

async function beaconPayloads(): Promise<SentPayload[]> {
  const spy = navigator.sendBeacon as unknown as ReturnType<typeof vi.fn>
  const out: SentPayload[] = []
  for (const call of spy.mock.calls) {
    const blob = call[1] as Blob
    out.push(JSON.parse(await blob.text()) as SentPayload)
  }
  return out
}

function fetchCallCount(): number {
  return mockedFetch().mock.calls.length
}

beforeEach(() => {
  disable()
  resetProductTrackerForTests()
  mockedFetch().mockClear()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(() => true), configurable: true, writable: true })
})

afterEach(() => {
  resetProductTrackerForTests()
  disable()
  delete ENV.VITE_API_URL
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('#1682 — le traceur produit', () => {
  it('T3 — traceur désactivé : ZÉRO appel réseau', () => {
    // #1682 — sans VITE_PRODUCT_TRACKER_ENABLED, no-op strict : le chemin est
    // byte-identique à « le traceur n'existe pas ».
    disable()
    vi.useFakeTimers()
    initProductTracker()

    notifyRouteViewed('/dashboard', null)
    trackTabOpened('accounts', 'contacts')
    trackActionStarted('export', 'accounts')
    trackActionCompleted('export', 'accounts')
    trackActionAbandoned('import', 'accounts', 'mapping')
    trackFilterApplied('accounts', 'secteur')
    trackSearchPerformed('accounts', 7)
    trackErrorShown('accounts', 'E_TIMEOUT')
    // #1946 — les dix émetteurs ajoutés le 14/09 passent par le MÊME
    // interrupteur : un seul d'entre eux qui l'oublierait ferait un appel
    // réseau sur une instance où le traceur est censé ne pas exister.
    trackAssistantQuestionSent('/chat')
    trackSuggestionClicked('/chat', 1)
    trackAssistantAnswerJudged('/chat', 'utile')
    trackAssistantRedirectFollowed('/chat', '/accounts')
    trackPreparedActionStage('relance', 'preparee')
    trackDraftReused('/chat', 'reecrit')
    trackInterventionOutcome('compte_sans_prochaine_action', 'ignoree')
    trackMemoryAdded('/chat')
    // #2085 — les deux émetteurs du 15/09/2026 passent par le MÊME
    // interrupteur, comme les dix-neuf précédents.
    trackPrefillReviewed('/onboarding/$id/$stage/$slug', 'confirmed')
    trackOnboardingStepBack('/onboarding/$id/$stage/$slug')
    // #2985 — le Meeting OS passe par le MÊME interrupteur.
    trackBriefGenerated('/briefing/')
    trackBriefOpened('/briefing/')
    trackQuestionUsed('/briefing/', 1)
    trackNotesAdded('/briefing/')
    trackSummaryGenerated('/briefing/')
    trackSummaryApproved('/briefing/')
    trackActionsCreated('/briefing/')
    trackFollowupCreated('/briefing/')
    trackFalseAssociationCorrected('/briefing/')
    trackMeetingCompleted('/accounts/$id')
    // #2108.49-.53 — les cinq émetteurs de plus passent par le MÊME
    // interrupteur, comme les vingt-cinq précédents.
    trackPriorityViewed('/briefing/', 'account')
    trackPriorityAccepted('/briefing/', 'account')
    trackPrioritySnoozed('/briefing/', 'account')
    trackPriorityRejected('/briefing/', 'account')
    trackPriorityCorrected('/briefing/', 'account')

    vi.advanceTimersByTime(90_000)
    window.dispatchEvent(new Event('pagehide'))

    expect(fetchCallCount()).toBe(0)
    expect(navigator.sendBeacon as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it('T1 — balayage : aucun événement émis ne porte de valeur de champ', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    notifyRouteViewed('/accounts', null) // screen_viewed
    trackTabOpened('accounts', 'contacts') // tab_opened
    trackActionStarted('export', 'accounts')
    trackActionCompleted('export', 'accounts') // action_completed
    trackActionStarted('import', 'accounts')
    trackActionAbandoned('import', 'accounts', 'mapping') // action_abandoned
    trackFilterApplied('accounts', 'secteur') // filter_applied — jamais 'banque'
    trackSearchPerformed('accounts', 7) // search_performed — jamais la requête tapée
    trackErrorShown('accounts', 'E_TIMEOUT') // error_shown
    // #1946 — les dix formes ajoutées le 14/09. Chacune est appelée avec la
    // charge la plus tentante possible — un rang, un verdict, une étape — et
    // jamais un texte, parce que la signature n'en a pas.
    trackAssistantQuestionSent('/chat') // assistant_first_question_sent
    trackSuggestionClicked('/chat', 2) // suggestion_clicked
    trackAssistantAnswerJudged('/chat', 'utile') // assistant_answer_judged + assistant_first_useful_result
    trackAssistantAnswerJudged('/chat', 'pas_pertinent')
    trackAssistantRedirectFollowed('/chat', '/accounts') // assistant_redirect_followed
    trackPreparedActionStage('relance', 'preparee') // prepared_action_stage
    trackDraftReused('/chat', 'reecrit') // draft_reused
    trackInterventionOutcome('compte_sans_prochaine_action', 'ignoree') // intervention_outcome
    trackMemoryAdded('/chat') // memory_added
    // #2085 — les deux formes ajoutées le 15/09/2026, avec la charge la plus
    // tentante possible pour chacune : un verdict fermé, jamais une valeur.
    trackPrefillReviewed('/onboarding/$id/$stage/$slug', 'corrected') // onboarding_prefill_reviewed
    trackOnboardingStepBack('/onboarding/$id/$stage/$slug') // onboarding_step_back
    notifyRouteViewed('/contacts', null) // screen_left (nav) + screen_viewed

    vi.advanceTimersByTime(15_000)

    const events = fetchPayloads().flatMap(payload => payload.events)
    expect(events.length).toBeGreaterThanOrEqual(21)

    const ALLOWED_KEYS: Record<string, string[]> = {
      screen_viewed: ['route', 'previousViewDurationMs', 'provenance'],
      screen_left: ['route', 'durationMs', 'leaveMode'],
      tab_opened: ['screen', 'tab'],
      action_started: ['action', 'screen'],
      action_completed: ['action', 'durationMs'],
      action_abandoned: ['action', 'atStep'],
      filter_applied: ['screen', 'filterName'],
      search_performed: ['screen', 'resultCount'],
      error_shown: ['screen', 'errorCode'],
      assistant_first_question_sent: ['screen'],
      suggestion_clicked: ['screen', 'rank'],
      assistant_first_useful_result: ['screen', 'durationMs'],
      assistant_answer_judged: ['screen', 'verdict'],
      assistant_redirect_followed: ['fromScreen', 'toScreen'],
      prepared_action_stage: ['action', 'stage'],
      draft_reused: ['screen', 'extent'],
      intervention_outcome: ['intervention', 'outcome'],
      memory_added: ['screen'],
      onboarding_prefill_reviewed: ['screen', 'outcome'],
      onboarding_step_back: ['screen'],
    }

    const seenNames = new Set<string>()
    for (const event of events) {
      seenNames.add(event.name)
      const allowed = ALLOWED_KEYS[event.name]
      expect(allowed, `événement inconnu du contrat : ${event.name}`).toBeDefined()
      expect(Object.keys(event.properties).sort()).toEqual([...(allowed as string[])].sort())
    }
    // Les 21 du contrat sont bien tous atteints au moins une fois par le sweep.
    expect([...seenNames].sort()).toEqual(Object.keys(ALLOWED_KEYS).sort())

    // Aucune trace d'un terme générique de contenu, où que ce soit dans le lot.
    const raw = JSON.stringify(events)
    const forbidden =
      /\b(value|filterValue|searchValue|searchQuery|query|fieldValue|inputValue|content|clientX|clientY|pageX|pageY)\b/i
    expect(forbidden.test(raw)).toBe(false)
    // Jamais la valeur métier qu'on a fait mine de vouloir faire fuiter.
    expect(raw).not.toContain('banque')
  })

  it('T2 — onglet caché 90 s : la durée s’arrête à 60 s, jamais 90', async () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    notifyRouteViewed('/dashboard', null) // ouvre une vue, mark = 0

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    // 90 s d'horloge murale, SANS aucune activité — l'onglet est caché, un
    // clavier ou une souris réels ne produiraient de toute façon rien.
    await vi.advanceTimersByTimeAsync(90_000)

    // Force le dernier envoi, quel que soit le canal qui a expédié
    // l'événement d'inactivité (fetch périodique ou beacon de fermeture).
    window.dispatchEvent(new Event('pagehide'))

    const fetched = fetchPayloads().flatMap(payload => payload.events)
    const beaconed = (await beaconPayloads()).flatMap(payload => payload.events)
    const screenLeft = [...fetched, ...beaconed].find(
      event => event.name === 'screen_left' && (event.properties as { leaveMode: string }).leaveMode === 'inactivite',
    )

    expect(screenLeft).toBeDefined()
    expect((screenLeft?.properties as { durationMs: unknown }).durationMs).toBe(60_000)
  })

  it('T4 — échec d’envoi : silencieux, aucune reprise infinie', async () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedFetch().mockImplementationOnce(() => Promise.reject(new Error('network down')))

    trackTabOpened('accounts', 'contacts')
    await vi.advanceTimersByTimeAsync(15_000)

    expect(errorSpy).not.toHaveBeenCalled()
    expect(fetchCallCount()).toBe(1)

    // Rien à renvoyer : le lot en échec a été vidé du tampon avant l'envoi, il
    // n'est donc jamais reprogrammé.
    mockedFetch().mockClear()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchCallCount()).toBe(0)

    errorSpy.mockRestore()
  })

  it('ne rouvre pas de vue pour la MÊME route (changement de paramètres de recherche seul)', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    notifyRouteViewed('/accounts', null)
    notifyRouteViewed('/accounts', null)
    vi.advanceTimersByTime(15_000)

    const events = fetchPayloads().flatMap(payload => payload.events)
    expect(events.filter(event => event.name === 'screen_viewed')).toHaveLength(1)
  })

  it('un action_completed SANS action_started connu n’émet rien — non mesuré n’est jamais 0', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackActionCompleted('export', 'accounts')
    vi.advanceTimersByTime(15_000)

    const events = fetchPayloads().flatMap(payload => payload.events)
    expect(events.filter(event => event.name === 'action_completed')).toHaveLength(0)
  })

  it('accepte aussi "1" comme valeur d’activation', () => {
    ENV.VITE_PRODUCT_TRACKER_ENABLED = '1'
    vi.useFakeTimers()
    initProductTracker()

    trackTabOpened('accounts', 'contacts')
    vi.advanceTimersByTime(15_000)

    expect(fetchCallCount()).toBeGreaterThan(0)
  })
})

// #4016.8d (Louis 11/10/2026) — le traceur est ALLUMÉ dans un build de production : l'arrêt est un geste
// explicite (`false`/`0`). Hors production (test, dev) il reste éteint tant qu'on ne l'allume pas.
describe('#4016.8d — le traceur produit est allumé par défaut en production', () => {
  const wasProd = ENV.PROD
  afterEach(() => {
    ENV.PROD = wasProd
  })

  it('build de production, variable absente : il émet', () => {
    ENV.PROD = true
    vi.useFakeTimers()
    initProductTracker()
    trackTabOpened('accounts', 'contacts')
    vi.advanceTimersByTime(15_000)
    expect(fetchCallCount()).toBeGreaterThan(0)
  })

  it('SAIT DIRE NON : build de production, `false` ou `0` ⇒ no-op strict, zéro appel réseau', () => {
    for (const value of ['false', '0', 'FALSE']) {
      ENV.PROD = true
      ENV.VITE_PRODUCT_TRACKER_ENABLED = value
      mockedFetch().mockClear()
      resetProductTrackerForTests()
      vi.useFakeTimers()
      initProductTracker()
      trackTabOpened('accounts', 'contacts')
      vi.advanceTimersByTime(15_000)
      expect(fetchCallCount()).toBe(0)
      vi.useRealTimers()
    }
  })

  it('SAIT DIRE NON : hors production (test, dev), variable absente ⇒ éteint', () => {
    ENV.PROD = false
    vi.useFakeTimers()
    initProductTracker()
    trackTabOpened('accounts', 'contacts')
    vi.advanceTimersByTime(15_000)
    expect(fetchCallCount()).toBe(0)
  })
})

describe('#1946 — mesurer la VALEUR, pas le volume', () => {
  function names(): string[] {
    return fetchPayloads().flatMap(payload => payload.events.map(event => event.name))
  }

  it('#1946.1/.17 — trois questions envoyées ne font QU’UN événement : le traceur ne sait pas compter les messages', () => {
    // « Ne pas optimiser uniquement le nombre de messages » (#1946.17) n'est
    // pas une consigne d'écran : ici c'est une propriété du traceur. Le
    // deuxième appel et le troisième n'émettent RIEN — il n'existe aucune
    // ligne à partir de laquelle reconstruire un volume de messages.
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackAssistantQuestionSent('/chat')
    trackAssistantQuestionSent('/chat')
    trackAssistantQuestionSent('/chat')
    vi.advanceTimersByTime(15_000)

    expect(names().filter(name => name === 'assistant_first_question_sent')).toHaveLength(1)
  })

  it('#1946.3 — le premier résultat jugé utile porte le délai depuis la première question, une seule fois', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackAssistantQuestionSent('/chat')
    vi.advanceTimersByTime(4_000) // 4 s d'horloge ACTIVE
    trackAssistantAnswerJudged('/chat', 'utile')
    trackAssistantAnswerJudged('/chat', 'utile')
    vi.advanceTimersByTime(15_000)

    const events = fetchPayloads().flatMap(payload => payload.events)
    const firstUseful = events.filter(event => event.name === 'assistant_first_useful_result')
    expect(firstUseful).toHaveLength(1)
    expect((firstUseful[0] as SentEvent).properties).toEqual({ screen: '/chat', durationMs: 4_000 })
    // Les deux jugements, eux, sortent bien : c'est le REPÈRE qui est unique.
    expect(names().filter(name => name === 'assistant_answer_judged')).toHaveLength(2)
  })

  it('#1946.3 — sans première question connue, aucun délai n’est fabriqué (non mesuré n’est jamais 0)', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackAssistantAnswerJudged('/chat', 'utile')
    vi.advanceTimersByTime(15_000)

    expect(names()).toContain('assistant_answer_judged')
    expect(names()).not.toContain('assistant_first_useful_result')
  })

  it('#1946.9 — un verdict « pas pertinent » ou « donnée fausse » ne compte JAMAIS comme un premier résultat utile', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackAssistantQuestionSent('/chat')
    trackAssistantAnswerJudged('/chat', 'pas_pertinent')
    trackAssistantAnswerJudged('/chat', 'donnee_fausse')
    vi.advanceTimersByTime(15_000)

    expect(names()).not.toContain('assistant_first_useful_result')
  })

  // D10 — décision Louis 14/09/2026 : la mesure connaît les six verdicts. Les
  // trois AJOUTÉS À LA FIN (`deja_fait`, `pas_maintenant`, `mauvaise_priorite`)
  // portent le MÊME nom que leur verdict de retour d'origine
  // (`REPLY_FEEDBACK_VERDICTS`, `@bellum/contracts`) — aucune case forcée.
  it('D10 — les trois verdicts ajoutés (deja_fait, pas_maintenant, mauvaise_priorite) s’émettent chacun sous leur propre nom, et ne comptent jamais comme un premier résultat utile', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackAssistantQuestionSent('/chat')
    trackAssistantAnswerJudged('/chat', 'deja_fait')
    trackAssistantAnswerJudged('/chat', 'pas_maintenant')
    trackAssistantAnswerJudged('/chat', 'mauvaise_priorite')
    vi.advanceTimersByTime(15_000)

    const judged = fetchPayloads()
      .flatMap(payload => payload.events)
      .filter(event => event.name === 'assistant_answer_judged')
    expect(judged.map(event => event.properties.verdict)).toEqual(['deja_fait', 'pas_maintenant', 'mauvaise_priorite'])
    expect(names()).not.toContain('assistant_first_useful_result')
  })

  it('#1946.2 — un rang qui n’est pas une position réelle n’émet rien, jamais un rang 0', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackSuggestionClicked('/chat', 0)
    trackSuggestionClicked('/chat', -1)
    trackSuggestionClicked('/chat', 1.5)
    trackSuggestionClicked('/chat', Number.NaN)
    vi.advanceTimersByTime(15_000)
    expect(names().filter(name => name === 'suggestion_clicked')).toHaveLength(0)

    trackSuggestionClicked('/chat', 3)
    vi.advanceTimersByTime(15_000)
    expect(names().filter(name => name === 'suggestion_clicked')).toHaveLength(1)
  })

  it('#1946.5-.8/.25 — les cinq étapes d’une action préparée sortent telles quelles, sans jamais nommer sa cible', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    for (const stage of ['preparee', 'validee', 'executee', 'corrigee', 'abandonnee'] as const) {
      trackPreparedActionStage('relance_compte', stage)
    }
    vi.advanceTimersByTime(15_000)

    const stages = fetchPayloads()
      .flatMap(payload => payload.events)
      .filter(event => event.name === 'prepared_action_stage')
      .map(event => event.properties.stage)
    expect(stages).toEqual(['preparee', 'validee', 'executee', 'corrigee', 'abandonnee'])
  })

  it('la remise à zéro des tests efface les repères de session — sinon le deuxième test hériterait du premier', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()
    trackAssistantQuestionSent('/chat')
    vi.advanceTimersByTime(15_000)
    expect(names().filter(name => name === 'assistant_first_question_sent')).toHaveLength(1)

    resetProductTrackerForTests()
    mockedFetch().mockClear()
    enable()
    initProductTracker()
    trackAssistantQuestionSent('/chat')
    vi.advanceTimersByTime(15_000)
    expect(names().filter(name => name === 'assistant_first_question_sent')).toHaveLength(1)
  })
})

describe('#2085 — les frictions du parcours d’onboarding', () => {
  function events(): { name: string; properties: Record<string, unknown> }[] {
    return fetchPayloads().flatMap(payload => payload.events)
  }

  it('#2085.19/.20/.5 — un préremplissage confirmé, corrigé ou ignoré porte le verdict, jamais la valeur', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackPrefillReviewed('/onboarding/$id/$stage/$slug', 'confirmed')
    trackPrefillReviewed('/onboarding/$id/$stage/$slug', 'corrected')
    trackPrefillReviewed('/onboarding/$id/$stage/$slug', 'ignored')
    vi.advanceTimersByTime(15_000)

    const reviewed = events().filter(event => event.name === 'onboarding_prefill_reviewed')
    expect(reviewed.map(event => event.properties.outcome)).toEqual(['confirmed', 'corrected', 'ignored'])
    for (const event of reviewed) {
      expect(Object.keys(event.properties).sort()).toEqual(['outcome', 'screen'])
    }
  })

  it('#2085.17 — une étape reprise en arrière ne porte que l’écran', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackOnboardingStepBack('/onboarding/$id/$stage/$slug')
    vi.advanceTimersByTime(15_000)

    const back = events().filter(event => event.name === 'onboarding_step_back')
    expect(back).toHaveLength(1)
    expect(back[0]?.properties).toEqual({ screen: '/onboarding/$id/$stage/$slug' })
  })

  it('désactivé : ni le préremplissage revu ni le retour arrière n’émettent quoi que ce soit', () => {
    disable()
    vi.useFakeTimers()
    initProductTracker()

    trackPrefillReviewed('/onboarding/$id/$stage/$slug', 'confirmed')
    trackOnboardingStepBack('/onboarding/$id/$stage/$slug')
    vi.advanceTimersByTime(15_000)

    expect(fetchCallCount()).toBe(0)
  })
})

describe('#2085 (16/09/2026) — six émetteurs de plus, chacun un ÉCRAN seul', () => {
  function events(): { name: string; properties: Record<string, unknown> }[] {
    return fetchPayloads().flatMap(payload => payload.events)
  }

  it('#2085.7 — audit généré porte l’écran seul', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackOnboardingAuditGenerated('/onboarding/$id/generating')
    vi.advanceTimersByTime(15_000)

    const seen = events().filter(event => event.name === 'onboarding_audit_generated')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.properties).toEqual({ screen: '/onboarding/$id/generating' })
  })

  it('#2085.8 — audit validé porte l’écran seul', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackOnboardingAuditValidated('/settings/profile/audit')
    vi.advanceTimersByTime(15_000)

    const seen = events().filter(event => event.name === 'onboarding_audit_validated')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.properties).toEqual({ screen: '/settings/profile/audit' })
  })

  it('#2085.9 — première valeur vue ne s’émet qu’UNE fois par session', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackOnboardingFirstValueViewed('/welcome')
    trackOnboardingFirstValueViewed('/welcome')
    vi.advanceTimersByTime(15_000)

    const seen = events().filter(event => event.name === 'onboarding_first_value_viewed')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.properties).toEqual({ screen: '/welcome' })
  })

  it('#2085.11 — connecteur activé porte l’écran seul, jamais le NOM du connecteur', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackConnectorActivated('/integrations')
    vi.advanceTimersByTime(15_000)

    const seen = events().filter(event => event.name === 'connector_activated')
    expect(seen).toHaveLength(1)
    expect(Object.keys(seen[0]?.properties ?? {})).toEqual(['screen'])
  })

  it('#2085.12 — import porte l’écran seul', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackDataImported('/settings/import')
    vi.advanceTimersByTime(15_000)

    const seen = events().filter(event => event.name === 'data_imported')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.properties).toEqual({ screen: '/settings/import' })
  })

  it('#2085.13 — invitation envoyée porte l’écran seul, jamais l’e-mail invité', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackInvitationSent('/settings/team')
    vi.advanceTimersByTime(15_000)

    const seen = events().filter(event => event.name === 'invitation_sent')
    expect(seen).toHaveLength(1)
    expect(Object.keys(seen[0]?.properties ?? {})).toEqual(['screen'])
  })

  it('#2085.6 — contradiction résolue porte l’écran et le geste (corrigée / maintenue), jamais la réponse', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackContradictionResolved('/onboarding/$id/review', 'corrected')
    trackContradictionResolved('/onboarding/$id/review', 'keptBoth')
    vi.advanceTimersByTime(15_000)

    const seen = events().filter(event => event.name === 'onboarding_contradiction_resolved')
    expect(seen).toHaveLength(2)
    expect(seen.map(event => event.properties)).toEqual([
      { screen: '/onboarding/$id/review', outcome: 'corrected' },
      { screen: '/onboarding/$id/review', outcome: 'keptBoth' },
    ])
  })

  it('désactivé : aucun des sept n’émet quoi que ce soit', () => {
    disable()
    vi.useFakeTimers()
    initProductTracker()

    trackOnboardingAuditGenerated('/onboarding/$id/generating')
    trackOnboardingAuditValidated('/settings/profile/audit')
    trackOnboardingFirstValueViewed('/welcome')
    trackConnectorActivated('/integrations')
    trackDataImported('/settings/import')
    trackInvitationSent('/settings/team')
    trackContradictionResolved('/onboarding/$id/review', 'corrected')
    vi.advanceTimersByTime(15_000)

    expect(fetchCallCount()).toBe(0)
  })
})

describe('#2985 (26/09/2026) — le Meeting OS (#2319), neuf émetteurs de plus', () => {
  function events(): { name: string; properties: Record<string, unknown> }[] {
    return fetchPayloads().flatMap(payload => payload.events)
  }

  it('brief généré et ouvert portent l’écran seul', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackBriefGenerated('/briefing/')
    trackBriefOpened('/briefing/')
    vi.advanceTimersByTime(15_000)

    expect(events().find(event => event.name === 'brief_generated')?.properties).toEqual({ screen: '/briefing/' })
    expect(events().find(event => event.name === 'brief_opened')?.properties).toEqual({ screen: '/briefing/' })
  })

  it('question utilisée porte l’écran et le RANG, jamais le texte — un rang invalide n’émet rien', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackQuestionUsed('/briefing/', 1)
    trackQuestionUsed('/briefing/', 0)
    trackQuestionUsed('/briefing/', -1)
    trackQuestionUsed('/briefing/', 1.5)
    vi.advanceTimersByTime(15_000)

    const seen = events().filter(event => event.name === 'question_used')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.properties).toEqual({ screen: '/briefing/', rank: 1 })
  })

  it('notes ajoutées, résumé généré, résumé validé, actions créées, suivi créé, association corrigée : l’écran seul', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackNotesAdded('/accounts/$id')
    trackSummaryGenerated('/accounts/$id')
    trackSummaryApproved('/accounts/$id')
    trackActionsCreated('/accounts/$id')
    trackFollowupCreated('/accounts/$id')
    trackFalseAssociationCorrected('/briefing/')
    vi.advanceTimersByTime(15_000)

    for (const name of [
      'notes_added',
      'summary_generated',
      'summary_approved',
      'actions_created',
      'followup_created',
    ]) {
      const seen = events().filter(event => event.name === name)
      expect(seen).toHaveLength(1)
      expect(seen[0]?.properties).toEqual({ screen: '/accounts/$id' })
    }
    expect(events().find(event => event.name === 'false_association_corrected')?.properties).toEqual({
      screen: '/briefing/',
    })
  })

  it('désactivé : aucun des neuf n’émet quoi que ce soit', () => {
    disable()
    vi.useFakeTimers()
    initProductTracker()

    trackBriefGenerated('/briefing/')
    trackBriefOpened('/briefing/')
    trackQuestionUsed('/briefing/', 1)
    trackNotesAdded('/accounts/$id')
    trackSummaryGenerated('/accounts/$id')
    trackSummaryApproved('/accounts/$id')
    trackActionsCreated('/accounts/$id')
    trackFollowupCreated('/accounts/$id')
    trackFalseAssociationCorrected('/briefing/')
    vi.advanceTimersByTime(15_000)

    expect(fetchCallCount()).toBe(0)
  })
})

describe('#2985 / #2319.123 — meeting_completed, tranché sans Louis (29/09/2026)', () => {
  function events(): { name: string; properties: Record<string, unknown> }[] {
    return fetchPayloads().flatMap(payload => payload.events)
  }

  it('porte l’écran seul, au même geste que le résumé validé (MeetingNotesCard.onApprove)', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackMeetingCompleted('/accounts/$id')
    vi.advanceTimersByTime(15_000)

    expect(events().find(event => event.name === 'meeting_completed')?.properties).toEqual({
      screen: '/accounts/$id',
    })
  })

  it('désactivé : n’émet rien', () => {
    disable()
    vi.useFakeTimers()
    initProductTracker()

    trackMeetingCompleted('/accounts/$id')
    vi.advanceTimersByTime(15_000)

    expect(fetchCallCount()).toBe(0)
  })
})

describe('#2108.49-.53 (épopée #2767, 29/09/2026) — les cinq mesures d’une carte de priorité', () => {
  function events(): { name: string; properties: Record<string, unknown> }[] {
    return fetchPayloads().flatMap(payload => payload.events)
  }

  it('chacune porte l’écran et le GENRE de la carte, jamais son libellé', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackPriorityViewed('/briefing/', 'account')
    trackPriorityAccepted('/briefing/', 'account')
    trackPrioritySnoozed('/briefing/', 'meeting_prep')
    trackPriorityRejected('/briefing/', 'contact')
    trackPriorityCorrected('/briefing/', 'mission')
    vi.advanceTimersByTime(15_000)

    expect(events().find(event => event.name === 'priority_viewed')?.properties).toEqual({
      screen: '/briefing/',
      kind: 'account',
    })
    expect(events().find(event => event.name === 'priority_accepted')?.properties).toEqual({
      screen: '/briefing/',
      kind: 'account',
    })
    expect(events().find(event => event.name === 'priority_snoozed')?.properties).toEqual({
      screen: '/briefing/',
      kind: 'meeting_prep',
    })
    expect(events().find(event => event.name === 'priority_rejected')?.properties).toEqual({
      screen: '/briefing/',
      kind: 'contact',
    })
    expect(events().find(event => event.name === 'priority_corrected')?.properties).toEqual({
      screen: '/briefing/',
      kind: 'mission',
    })
  })

  it('désactivé : aucune des cinq n’émet quoi que ce soit', () => {
    disable()
    vi.useFakeTimers()
    initProductTracker()

    trackPriorityViewed('/briefing/', 'account')
    trackPriorityAccepted('/briefing/', 'account')
    trackPrioritySnoozed('/briefing/', 'account')
    trackPriorityRejected('/briefing/', 'account')
    trackPriorityCorrected('/briefing/', 'account')
    vi.advanceTimersByTime(15_000)

    expect(fetchCallCount()).toBe(0)
  })
})

describe('#2108.54 (épopée #2767, 30/09/2026) — une tâche cochée', () => {
  function events(): { name: string; properties: Record<string, unknown> }[] {
    return fetchPayloads().flatMap(payload => payload.events)
  }

  it('porte l’écran, jamais le titre de la tâche', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackTaskCompleted('/briefing/')
    vi.advanceTimersByTime(15_000)

    expect(events().find(event => event.name === 'task_completed')?.properties).toEqual({ screen: '/briefing/' })
  })

  it('désactivé : n’émet rien', () => {
    disable()
    vi.useFakeTimers()
    initProductTracker()

    trackTaskCompleted('/briefing/')
    vi.advanceTimersByTime(15_000)

    expect(fetchCallCount()).toBe(0)
  })
})

describe('#2319.129/.130 (épopée #2985, 30/09/2026) — écriture CRM de compte rendu confirmée', () => {
  function events(): { name: string; properties: Record<string, unknown> }[] {
    return fetchPayloads().flatMap(payload => payload.events)
  }

  it('porte l’écran seul — jamais le stade, l’affaire ni la source', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    trackCrmWritebackConfirmed('/actions')
    vi.advanceTimersByTime(15_000)

    expect(events().find(event => event.name === 'crm_writeback_confirmed')?.properties).toEqual({
      screen: '/actions',
    })
  })

  it('désactivé : n’émet rien', () => {
    disable()
    vi.useFakeTimers()
    initProductTracker()

    trackCrmWritebackConfirmed('/actions')
    vi.advanceTimersByTime(15_000)

    expect(fetchCallCount()).toBe(0)
  })
})

describe('#2154.30 / #2958.85-.89 — trackedMutation : début, succès, échec d’une écriture, par écran', () => {
  function events(): { name: string; properties: Record<string, unknown> }[] {
    return fetchPayloads().flatMap(payload => payload.events)
  }

  it('succès : action_started puis action_completed, rattachés à l’écran, jamais à la personne', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    const callbacks = trackedMutation('project_created', '/projects')
    callbacks.onSuccess()
    vi.advanceTimersByTime(15_000)

    const names = events().map(event => event.name)
    expect(names).toContain('action_started')
    expect(names).toContain('action_completed')
    expect(events().find(event => event.name === 'action_started')?.properties).toEqual({
      action: 'project_created',
      screen: '/projects',
    })
    expect(JSON.stringify(events())).not.toMatch(/user|email|person/i)
  })

  it('échec : action_abandoned à l’étape `error`, pas de action_completed', () => {
    enable()
    vi.useFakeTimers()
    initProductTracker()

    const callbacks = trackedMutation('account_assigned', '/accounts')
    callbacks.onError()
    vi.advanceTimersByTime(15_000)

    const names = events().map(event => event.name)
    expect(names).toContain('action_abandoned')
    expect(names).not.toContain('action_completed')
    expect(events().find(event => event.name === 'action_abandoned')?.properties).toEqual({
      action: 'account_assigned',
      atStep: 'error',
    })
  })

  it('désactivé : n’émet rien', () => {
    disable()
    vi.useFakeTimers()
    initProductTracker()

    const callbacks = trackedMutation('project_created', '/projects')
    callbacks.onSuccess()
    vi.advanceTimersByTime(15_000)

    expect(fetchCallCount()).toBe(0)
  })
})
