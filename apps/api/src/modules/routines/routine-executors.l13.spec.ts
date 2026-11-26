import type { AgendaEvent, RoutineKey } from '@bellum/contracts'
import type { AgendaService } from '../agenda/agenda.service'
import { ROUTINE_CATALOG } from './routine-catalog'
import { RoutineExecutors } from './routine-executors'
import { familyOfRoutine } from './routine-role-order'
import type { TalentRoutinesService } from './talent-routines.service'

/**
 * #2843.1-.6 / #2102.45 (lot L13) — les routines qui manquaient aux rôles :
 * entretiens et feedbacks (recruteur), risques d'équipe et besoins bloqués
 * (manager), pièces et échéances (ADV), renouvellement et repositionnement,
 * rappel T-1 avant un rendez-vous. Chacune LIT une donnée réelle de l'espace,
 * NOTIFIE, n'écrit rien et n'envoie rien.
 */
const L13_KEYS = [
  'interview_upcoming',
  'interview_feedback_missing',
  'team_mission_risks',
  'blocked_needs',
  'mission_documents_pending',
  'mission_start_deadlines',
  'mission_renewal_to_engage',
  'consultant_repositioning',
  'meeting_reminder_t1',
] as const satisfies readonly RoutineKey[]

type Talent = Partial<Record<keyof TalentRoutinesService, jest.Mock>>

function executorOver(talent: Talent, agenda?: Partial<AgendaService>): RoutineExecutors {
  return new RoutineExecutors(
    undefined as never,
    undefined as never,
    (agenda ?? {}) as AgendaService,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    talent as unknown as TalentRoutinesService,
    undefined as never,
    undefined as never,
  )
}

const NOW = new Date('2026-11-02T09:00:00.000Z')

const READ_OF: Record<Exclude<(typeof L13_KEYS)[number], 'meeting_reminder_t1'>, keyof TalentRoutinesService> = {
  interview_upcoming: 'interviewsUpcoming',
  interview_feedback_missing: 'interviewsWithoutFeedback',
  team_mission_risks: 'missionsWithDeclaredRisks',
  blocked_needs: 'blockedNeeds',
  mission_documents_pending: 'pendingMissionDocuments',
  mission_start_deadlines: 'missionStartsWithoutSignedContract',
  mission_renewal_to_engage: 'renewalsToEngage',
  consultant_repositioning: 'consultantsToReposition',
}

describe('L13 — le catalogue couvre les rôles (#2843.1-.6, #2102.45)', () => {
  it.each(L13_KEYS)('%s est au catalogue', key => {
    expect(ROUTINE_CATALOG.find(routine => routine.key === key)).toBeDefined()
  })

  // #2843.25 — Louis 31/10 : niveau 0-1 par défaut pour les NOUVELLES routines.
  it.each(L13_KEYS)('%s naît au niveau le plus bas (N1) et éteinte', key => {
    const routine = ROUTINE_CATALOG.find(entry => entry.key === key)
    expect(routine?.automationLevel).toBe('n1_prepare')
    expect(routine?.defaultEnabled).toBe(false)
    expect(routine?.defaultChannel).toBe('in_app')
    expect(routine?.example).not.toBeNull()
  })

  // #2843.25 — … et les routines n4/n5 déjà actives en prod NE CHANGENT PAS.
  it.each([
    ['daily_briefing', 'n4_bounded_auto'],
    ['meeting_prep', 'n4_bounded_auto'],
    ['meeting_checklist', 'n4_bounded_auto'],
  ] as const)('%s garde son niveau %s', (key, level) => {
    expect(ROUTINE_CATALOG.find(entry => entry.key === key)?.automationLevel).toBe(level)
  })

  it('connector_health garde un niveau au-dessus de N1', () => {
    expect(ROUTINE_CATALOG.find(entry => entry.key === 'connector_health')?.automationLevel).not.toBe('n1_prepare')
  })

  it('chaque rôle reçoit ses routines manquantes', () => {
    expect(familyOfRoutine('interview_upcoming')).toBe('recruiter')
    expect(familyOfRoutine('interview_feedback_missing')).toBe('recruiter')
    expect(familyOfRoutine('team_mission_risks')).toBe('manager')
    expect(familyOfRoutine('blocked_needs')).toBe('manager')
    expect(familyOfRoutine('mission_documents_pending')).toBe('adv')
    expect(familyOfRoutine('mission_start_deadlines')).toBe('adv')
    expect(familyOfRoutine('mission_renewal_to_engage')).toBe('commercial')
    expect(familyOfRoutine('consultant_repositioning')).toBe('recruiter')
    expect(familyOfRoutine('meeting_reminder_t1')).toBe('commercial')
  })
})

describe('L13 — les exécuteurs lisent, notifient, n’inventent rien', () => {
  it.each(Object.entries(READ_OF))('%s sans espace résolu : se tait et le dit', async key => {
    const outcome = await executorOver({}).run(key as RoutineKey, 'u1', NOW, '')
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('Aucun espace de travail résolu')
  })

  // « non mesuré » n'est jamais « 0 » (GA-18/19).
  it.each(Object.entries(READ_OF))('%s lecture en échec : « non mesuré », jamais « aucun »', async (key, read) => {
    const outcome = await executorOver({ [read]: jest.fn().mockResolvedValue({ measured: false, rows: [] }) }).run(
      key as RoutineKey,
      'u1',
      NOW,
      'w1',
    )
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('rien n’a été mesuré')
    expect(outcome.outcome).not.toMatch(/^Aucun/)
  })

  it.each(Object.entries(READ_OF))('%s rien à signaler : se tait sur un fait mesuré', async (key, read) => {
    const outcome = await executorOver({ [read]: jest.fn().mockResolvedValue({ measured: true, rows: [] }) }).run(
      key as RoutineKey,
      'u1',
      NOW,
      'w1',
    )
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toMatch(/^Aucun/)
  })

  it.each(Object.entries(READ_OF))('%s une ligne : une notification qui nomme l’objet', async (key, read) => {
    const row = {
      id: 'x1',
      label: 'Mission Alpha',
      full_name: 'Ada Lovelace',
      title: 'Besoin Data',
      name: 'Contrat cadre',
      days: 12,
      scheduled_at: '2026-11-02T14:00:00.000Z',
    }
    const outcome = await executorOver({ [read]: jest.fn().mockResolvedValue({ measured: true, rows: [row] }) }).run(
      key as RoutineKey,
      'u1',
      NOW,
      'w1',
    )
    expect(outcome.notified).toBe(true)
    expect(outcome.notification?.title).toMatch(/^1 /)
    expect(outcome.notification?.body).toMatch(/Mission Alpha|Ada Lovelace|Besoin Data|Contrat cadre/)
    expect(outcome.notification?.link).toMatch(/^\//)
  })
})

describe('L13 — rappel T-1 avant un rendez-vous (#2102.45)', () => {
  const event = (over: Partial<AgendaEvent>): AgendaEvent =>
    ({
      id: 'e1',
      summary: 'Point Acme',
      start: '2026-11-03T10:00:00.000Z',
      end: '2026-11-03T11:00:00.000Z',
      isExternal: true,
      cancelled: false,
      attendees: [],
      ...over,
    }) as AgendaEvent

  it('lit le lendemain dans l’agenda, ne garde que les rendez-vous externes non annulés', async () => {
    const listEvents = jest
      .fn()
      .mockResolvedValue([
        event({}),
        event({ id: 'e2', isExternal: false }),
        event({ id: 'e3', cancelled: true, summary: 'Annulé' }),
      ])
    const outcome = await executorOver({}, { listEvents }).run('meeting_reminder_t1', 'u1', NOW, 'w1')
    const [, range] = listEvents.mock.calls[0]
    expect(new Date(range.from).getTime()).toBeGreaterThan(NOW.getTime())
    expect(outcome.notified).toBe(true)
    expect(outcome.notification?.title).toMatch(/^1 rendez-vous demain/)
    expect(outcome.notification?.body).toContain('Point Acme')
  })

  it('aucun rendez-vous externe demain : se tait', async () => {
    const outcome = await executorOver({}, { listEvents: jest.fn().mockResolvedValue([]) }).run(
      'meeting_reminder_t1',
      'u1',
      NOW,
      'w1',
    )
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('Aucun rendez-vous externe demain')
  })
})
