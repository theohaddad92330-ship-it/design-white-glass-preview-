import type { Page } from '@playwright/test'

/**
 * Fixture partagée pour les recettes `/briefing` (#2097) — extraite de
 * `briefing-mobile-order.spec.ts` pour que `briefing-responsive-breakpoints.spec.ts`
 * (#2097.68) puisse la réutiliser : Playwright refuse qu'un fichier de test
 * en importe un autre (« should not import test file »), donc le patron
 * réseau partagé vit ici, dans un fichier qui n'est pas lui-même un test
 * (GA-26 — un seul endroit qui sait comment simuler cet écran).
 */

export const WEB_ORIGIN = 'http://127.0.0.1:4311'
export const USER_ID = '2097bf84-1111-4a11-9c33-briefing0001'

const NOW = Date.now()
export const EVENT_SUMMARY = 'Point besoin portail transporteurs'
const EVENT = {
  id: 'evt-2097',
  summary: EVENT_SUMMARY,
  description: null,
  location: null,
  start: new Date(NOW + 20 * 60_000).toISOString(),
  end: new Date(NOW + 80 * 60_000).toISOString(),
  organizer: null,
  attendees: [],
  conferenceUrl: null,
  webUrl: null,
  status: 'confirmed',
  isExternal: true,
  cancelled: false,
}

/** #2097.43 — une carte `meeting_prep` : c'est elle qui porte la position 4. */
const MEETING_PREP_ACTION = {
  id: 'meeting:evt-2097',
  kind: 'meeting_prep',
  labelKey: 'briefing.actions.meetingPrep',
  labelVars: { subject: EVENT_SUMMARY },
  href: null,
  priority: 1,
  fact: null,
  context: null,
  preparedArtifacts: [],
  expiresAt: null,
  businessObject: null,
  verdict: null,
  consequence: null,
  confidence: null,
  estimatedMinutes: null,
  rankingAxes: [],
  processingState: 'suggested',
}

/**
 * BEL-SC-227 (#3256) — « Tes décisions » promeut UNE carte par catégorie et la
 * retire des blocs du dessous (GA-26, jamais deux fois la même carte). La
 * préparation de priorité 1 devient donc une décision ; cette SECONDE
 * préparation, même catégorie et priorité plus basse, n'est pas promue : c'est
 * elle qui garde la position 4 (« Préparations ») du rendu mobile.
 */
const SECOND_MEETING_PREP_ACTION = {
  ...MEETING_PREP_ACTION,
  id: 'meeting:evt-2097-b',
  priority: 2,
}

const FOLLOW_UP_ACTION = {
  id: 'a1',
  kind: 'follow_up',
  labelKey: 'briefing.actions.followUp',
  labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
  href: '/mailbox?intent=no_reply&thread=t1',
  priority: 4,
  fact: null,
  context: null,
  preparedArtifacts: [],
  expiresAt: null,
  businessObject: null,
  verdict: null,
  consequence: null,
  confidence: null,
  estimatedMinutes: null,
  rankingAxes: [],
  processingState: 'suggested',
}

const BRIEFING_TODAY = {
  date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(NOW),
  timeZone: 'Europe/Paris',
  firstName: 'Louis',
  agenda: {
    state: 'ready',
    reason: null,
    readAt: new Date(NOW).toISOString(),
    events: [EVENT],
    conflicts: [],
    needsPreparation: [EVENT],
  },
  mail: {
    state: 'ready',
    reason: null,
    readAt: new Date(NOW).toISOString(),
    awaitingReply: [],
    positiveReplies: [],
    unread: [],
  },
  tasks: {
    state: 'ready',
    reason: null,
    readAt: new Date(NOW).toISOString(),
    tasks: [],
    overdueCount: 0,
    todayCount: 0,
  },
  accountsToWatch: [],
  chainBlockers: [],
  discoverAlerts: [],
  discoverAlertsLastEventAt: null,
  actions: [MEETING_PREP_ACTION, SECOND_MEETING_PREP_ACTION, FOLLOW_UP_ACTION],
  generatedAt: new Date(NOW).toISOString(),
}

function json(body: unknown) {
  return { contentType: 'application/json', body: JSON.stringify(body) }
}

export async function mockBriefingScreen(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])

  // ─── Chrome authentifiée — même patron que account-detail-recette-visuelle.spec.ts ───
  await page.route('**/auth/session', route =>
    route.fulfill(
      json({
        user: {
          id: USER_ID,
          email: 'e2e-2097@bellum-ai.com',
          created_at: '2026-01-01T00:00:00.000Z',
          roles: ['customer'],
        },
      }),
    ),
  )
  await page.route('**/onboarding/state', route =>
    route.fulfill(
      json({
        id: USER_ID,
        status: 'completed',
        current_stage_code: null,
        stages: [],
        answers: {},
        skipped_at: null,
        inherited_answer_keys: [],
        active_import_session_id: null,
        joined_workspace: null,
        effectif_observed_at: {},
      }),
    ),
  )
  await page.route('**/workspaces/me', route =>
    route.fulfill(
      json({
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-2097af840001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    ),
  )
  await page.route('**/credits', route => route.fulfill(json({ features: [] })))

  // ─── L'écran lui-même ───
  await page.route('**/briefing/today**', route => route.fulfill(json(BRIEFING_TODAY)))
  await page.route('**/briefing/actions', route => route.fulfill(json({ actions: [] })))
  // #3414 (lot X42) — les deux blocs posés AU-DESSUS de la grille « À faire maintenant / Tes
  // tâches » : sans réponse mockée, leur échec arrivait après les reprises de TanStack Query
  // (délai variable) et faisait remonter tout l'écran en plein milieu d'une mesure.
  await page.route('**/onboarding/activation', route =>
    route.fulfill(
      json({
        profile_completed: true,
        analysis_launched: false,
        dossier_viewed: false,
        contact_enriched: false,
        message_prepared: false,
        tool_connected: true,
        correction_made: false,
        colleague_invited: 'not_applicable',
        completed_count: 2,
        is_complete: false,
      }),
    ),
  )
  await page.route('**/briefing/since-last-visit**', route =>
    route.fulfill(json({ since: new Date(NOW - 24 * 3600_000).toISOString(), lines: [] })),
  )
  await page.route('**/tasks**', route => route.fulfill(json({ items: [] })))
  await page.route('**/actions/mark-seen', route => route.fulfill(json({ since: null })))
  await page.route('**/actions/history**', route =>
    route.fulfill(
      json({
        data: [],
        pagination: { currentPage: 1, size: 20, totalItems: 0, totalPages: 0, hasNext: false, hasPrev: false },
      }),
    ),
  )

  // ─── L'agenda, monté pour de vrai par `AgendaBoard` ───
  await page.route('**/agenda/events**', route => route.fulfill(json({ events: [EVENT], unavailable: [] })))
  await page.route('**/agenda/free-slots**', route => route.fulfill(json([])))
  await page.route('**/agenda/status**', route =>
    route.fulfill(
      json({
        connected: true,
        provider: 'google',
        capabilities: { silentReschedule: false, customReminder: false, recurrence: false },
      }),
    ),
  )
  await page.route('**/agenda/calendars**', route =>
    route.fulfill(json({ calendars: [], selectedCalendars: [], readsAll: false, unavailable: [] })),
  )

  // ─── Le reste des blocs — leur SECTION est toujours rendue quel que soit
  // leur contenu ; un corps minimal suffit à ne pas laisser leur requête en
  // souffrance (ce test ne porte pas sur leur contenu, `*.test.tsx` le fait). ───
  await page.route('**/playbooks/interventions**', route => route.fulfill(json({ items: [] })))
  await page.route('**/delivery/finance/revenue**', route =>
    route.fulfill(
      json({
        periodMonth: new Date(NOW).toISOString().slice(0, 7),
        lines: [
          { kind: 'signed', amountCents: null, withoutAmount: 0, unavailableReason: 'no_source', sourceRows: null },
          { kind: 'produced', amountCents: null, withoutAmount: 0, unavailableReason: 'no_source', sourceRows: null },
          { kind: 'invoiced', amountCents: null, withoutAmount: 0, unavailableReason: 'no_source', sourceRows: null },
          { kind: 'collected', amountCents: null, withoutAmount: 0, unavailableReason: 'no_source', sourceRows: null },
        ],
      }),
    ),
  )
  await page.route('**/projects/pipeline**', route =>
    route.fulfill(
      json({
        columns: [],
        intake: 0,
        signals: 0,
        total_count: 0,
        total_amount_cents: 0,
        total_without_amount: 0,
        signed_count: 0,
        signed_amount_cents: 0,
        signed_without_amount: 0,
        scope: { requested: 'own', applied: 'own', outsideAnyPortfolioCount: 0 },
      }),
    ),
  )
  await page.route('**/delivery/missions**', route => route.fulfill(json({ missions: [], canReadFinance: true })))
  await page.route('**/delivery/finance/capacity**', route =>
    route.fulfill(
      json({
        periodMonth: new Date(NOW).toISOString().slice(0, 7),
        capacityDays: null,
        committedDays: null,
        availableDays: null,
        unmeasured: 0,
      }),
    ),
  )
}
