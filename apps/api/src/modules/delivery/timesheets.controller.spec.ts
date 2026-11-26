import { TimesheetsController } from './timesheets.controller'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'a0000000-0000-4000-8000-000000000001'
const EXCEPTION = 'e0000000-0000-4000-8000-000000000001'

/**
 * #2196.31 — la pose et l'annulation d'une exception « non applicable » se
 * VOIENT au journal de la mission (l'historique du compte porteur) : qui (la
 * ligne porte l'auteur), quand, pourquoi (le motif).
 *
 * Le journal s'écrit dans le CONTRÔLEUR, la couche où un geste traverse deux
 * domaines (§3.2, GA-07) — jamais depuis le service des relevés.
 */
function makeController(trace: { accountId: string | null }, ingestFails = false) {
  const full = {
    id: EXCEPTION,
    missionId: MISSION,
    missionLabel: 'Run plateforme',
    periodMonth: '2026-07-01',
    reason: 'Congé sans solde',
    at: '2026-08-03T09:00:00.000Z',
    ...trace,
  }
  const timesheets = {
    markNotApplicable: jest.fn(async () => full),
    revokeNotApplicable: jest.fn(async () => full),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  const activities = {
    ingest: jest.fn(async () => {
      if (ingestFails) throw new Error('journal indisponible')
      return { ingested: 1, duplicates: 0 }
    }),
  }
  const controller = new TimesheetsController(timesheets as never, workspaceContext as never, activities as never)
  return { controller, timesheets, activities }
}

const user = { userId: USER } as never
const body = { missionId: MISSION, month: '2026-07', consultantId: null, reason: 'Congé sans solde' }

describe('TimesheetsController — l’exception « non applicable » au journal (#2196.31)', () => {
  it('la POSE écrit une ligne système sur le compte porteur, motif en corps, auteur = qui a marqué', async () => {
    const { controller, timesheets, activities } = makeController({ accountId: 'acc-1' })
    await controller.markNotApplicable(user, body as never)

    expect(timesheets.markNotApplicable).toHaveBeenCalledWith(WORKSPACE, USER, body)
    const [workspaceId, userId, inputs] = activities.ingest.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>[],
    ]
    expect(workspaceId).toBe(WORKSPACE)
    expect(userId).toBe(USER)
    expect(inputs[0]).toMatchObject({
      kind: 'workflow',
      source: 'system',
      accountId: 'acc-1',
      subject: 'Run plateforme · 2026-07 — timesheet_not_applicable',
      body: 'Congé sans solde',
      externalId: `timesheet-exception:${EXCEPTION}:timesheet_not_applicable`,
    })
  })

  it('l’ANNULATION écrit sa propre ligne — la pose reste au journal', async () => {
    const { controller, activities } = makeController({ accountId: 'acc-1' })
    await controller.revokeNotApplicable(user, EXCEPTION)

    const inputs = (activities.ingest.mock.calls[0] as unknown as [string, string, Record<string, unknown>[]])[2]
    expect(inputs[0]?.subject).toBe('Run plateforme · 2026-07 — timesheet_not_applicable_revoked')
  })

  it('une mission sans compte n’a pas de journal : le geste réussit, rien n’est inventé', async () => {
    const { controller, activities } = makeController({ accountId: null })
    await expect(controller.markNotApplicable(user, body as never)).resolves.toMatchObject({ id: EXCEPTION })
    expect(activities.ingest).not.toHaveBeenCalled()
  })

  it('un journal en panne ne défait pas l’exception — la trace qui/quand/pourquoi est déjà en base', async () => {
    const { controller } = makeController({ accountId: 'acc-1' }, true)
    await expect(controller.markNotApplicable(user, body as never)).resolves.toMatchObject({ id: EXCEPTION })
  })
})

/**
 * #2416.37 — la CINQUIÈME condition d'arrêt de la collecte CRA (l'opt-out)
 * traverse la porte PERSONNE ICI, dans le CONTRÔLEUR : `TimesheetsService`
 * n'importe pas `ContactStopService` (§3.2, garde GA-07 — un service
 * n'importe pas le service d'un voisin). Le contrôleur est la couche où un
 * geste utilisateur compose légitimement les deux modules.
 */
describe('TimesheetsController.reminders — l’opt-out coupe une relance CRA (#2416.37)', () => {
  const TIMESHEET = 't0000000-0000-4000-8000-000000000001'
  const CHANNEL = { kind: 'mail_draft' }

  function item(overrides: Record<string, unknown> = {}) {
    return {
      line: { timesheetId: TIMESHEET, missionId: MISSION, ...overrides },
      index: 1,
      overdueDays: 20,
      tone: 'neutral',
    }
  }

  function makeReminderController(opts: {
    items?: ReturnType<typeof item>[]
    contactByKey?: Record<string, string | null>
    stoppedContactIds?: Set<string>
    withContactStops?: boolean
  }) {
    const items = opts.items ?? [item()]
    const contactByKey = new Map(Object.entries(opts.contactByKey ?? {}))
    const timesheets = {
      dueReminders: jest.fn(async () => ({ channel: CHANNEL, items })),
      craContactIdsFor: jest.fn(async () => contactByKey),
    }
    const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
    const contactStops = { stoppedAmong: jest.fn(async () => opts.stoppedContactIds ?? new Set<string>()) }
    const controller = new TimesheetsController(
      timesheets as never,
      workspaceContext as never,
      undefined,
      opts.withContactStops === false ? undefined : (contactStops as never),
    )
    return { controller, timesheets, contactStops }
  }

  it('coupe une relance dont le contact CRA a demandé qu’on cesse', async () => {
    const { controller } = makeReminderController({
      contactByKey: { [TIMESHEET]: 'contact-a' },
      stoppedContactIds: new Set(['contact-a']),
    })
    const result = await controller.reminders(user, undefined)
    expect(result.items).toEqual([])
  })

  it('TÉMOIN — le contact CRA n’a pas demandé qu’on cesse, la relance reste due', async () => {
    const { controller } = makeReminderController({
      contactByKey: { [TIMESHEET]: 'contact-a' },
      stoppedContactIds: new Set(['contact-autre']),
    })
    const result = await controller.reminders(user, undefined)
    expect(result.items).toHaveLength(1)
  })

  it('sans contact CRA connu, rien à arrêter — la relance reste due', async () => {
    const { controller } = makeReminderController({ contactByKey: { [TIMESHEET]: null } })
    const result = await controller.reminders(user, undefined)
    expect(result.items).toHaveLength(1)
  })

  it('sans `ContactStopService` injecté, les relances restent dues telles quelles', async () => {
    const { controller, timesheets } = makeReminderController({ withContactStops: false })
    const result = await controller.reminders(user, undefined)
    expect(result.items).toHaveLength(1)
    expect(timesheets.craContactIdsFor).not.toHaveBeenCalled()
  })

  it('n’interroge pas la porte PERSONNE quand aucune relance n’est due', async () => {
    const { controller, timesheets, contactStops } = makeReminderController({ items: [] })
    await controller.reminders(user, undefined)
    expect(timesheets.craContactIdsFor).not.toHaveBeenCalled()
    expect(contactStops.stoppedAmong).not.toHaveBeenCalled()
  })

  it('interroge la porte PERSONNE avec les contacts réellement résolus, bornée à l’espace de travail', async () => {
    const { controller, contactStops } = makeReminderController({ contactByKey: { [TIMESHEET]: 'contact-a' } })
    await controller.reminders(user, undefined)
    expect(contactStops.stoppedAmong).toHaveBeenCalledWith(WORKSPACE, ['contact-a'])
  })
})
