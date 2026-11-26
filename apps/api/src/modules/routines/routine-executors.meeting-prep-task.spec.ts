import { RoutineExecutors } from './routine-executors'
import type { AgendaService } from '../agenda/agenda.service'
import type { BriefingService } from '../briefing/briefing.service'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import type { Repository } from 'typeorm'

/**
 * #2390.4/#2390.17 (épopée #2926) — l'ABSENCE de préparation d'un rendez-vous
 * externe devient une proposition d'action, jamais un second rappel muet.
 *
 * Un rendez-vous externe rattaché à un compte par DOMAINE (preuve) et sans
 * tâche de préparation encore ouverte (`action_plan_items`, `target_kind =
 * 'meeting'`) en reçoit UNE — jamais deux (dédupliqué par `target_id`), et
 * jamais sur un rendez-vous que rien ne rattache à un compte (un titre qui se
 * ressemble n'est pas une preuve).
 */

const NOW = new Date('2026-09-29T09:00:00.000Z')

const externalEvent = {
  id: 'evt-1',
  summary: 'Point avant-vente',
  start: '2026-09-30T10:00:00.000Z',
  end: '2026-09-30T11:00:00.000Z',
  isExternal: true,
  cancelled: false,
  attendees: [{ email: 'j.morvan@acme.fr', displayName: null, responseStatus: null, external: true }],
}

const account = { id: 'acc-1', company_name: 'ACME', website: 'https://acme.fr' }

function briefingWith(accounts: (typeof account)[]): Partial<BriefingService> {
  return { accountsForMeetingDomainMatch: async () => accounts }
}

function agendaWith(events: unknown[]): Partial<AgendaService> {
  return { listEvents: async () => events as never, freeSlots: async () => [] as never }
}

function planItemsRepo(existing: unknown | null, saveSpy: (row: unknown) => void) {
  return {
    findOne: async () => existing,
    create: (row: unknown) => row,
    save: async (row: unknown) => {
      saveSpy(row)
      return row
    },
  } as unknown as Repository<ActionPlanItemEntity>
}

function executorOver(
  briefing: Partial<BriefingService>,
  agenda: Partial<AgendaService>,
  planItems?: Repository<ActionPlanItemEntity>,
) {
  const blanks: unknown[] = Array.from({ length: 14 }, () => undefined)
  blanks[0] = briefing
  blanks[2] = agenda
  const Ctor = RoutineExecutors as unknown as new (...args: unknown[]) => RoutineExecutors
  return new Ctor(...blanks, undefined /* userActions */, undefined /* credits */, planItems)
}

describe('rendez-vous sans préparation : proposition d’action (#2390.4/#2390.17)', () => {
  it('propose une tâche de préparation pour un rendez-vous rattaché par domaine, sans tâche déjà ouverte', async () => {
    const saveSpy = jest.fn()
    const outcome = await executorOver(
      briefingWith([account]),
      agendaWith([externalEvent]),
      planItemsRepo(null, saveSpy),
    ).run('meeting_prep', 'u1', NOW, 'ws-1')

    expect(saveSpy).toHaveBeenCalledTimes(1)
    const row = saveSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(row['account_id']).toBe('acc-1')
    expect(row['target_kind']).toBe('meeting')
    expect(row['target_id']).toBe('evt-1')
    expect(row['execution_status']).toBe('todo')
    expect(row['source']).toBe('pipeline')
    expect(row['label']).toContain('ACME')
    expect(outcome.outcome).toContain('1 tâche(s) de préparation proposée(s)')
  })

  it('une tâche déjà ouverte pour ce rendez-vous : aucune seconde tâche', async () => {
    const saveSpy = jest.fn()
    const outcome = await executorOver(
      briefingWith([account]),
      agendaWith([externalEvent]),
      planItemsRepo({ id: 'existing' }, saveSpy),
    ).run('meeting_prep', 'u1', NOW, 'ws-1')

    expect(saveSpy).not.toHaveBeenCalled()
    expect(outcome.outcome).not.toContain('tâche(s) de préparation proposée')
  })

  it('aucun compte rattaché par domaine : aucune tâche inventée', async () => {
    const saveSpy = jest.fn()
    const outcome = await executorOver(briefingWith([]), agendaWith([externalEvent]), planItemsRepo(null, saveSpy)).run(
      'meeting_prep',
      'u1',
      NOW,
      'ws-1',
    )

    expect(saveSpy).not.toHaveBeenCalled()
    expect(outcome.outcome).not.toContain('tâche(s) de préparation proposée')
  })

  it('dépôt indisponible (@Optional) : comportement inchangé, aucune erreur', async () => {
    const outcome = await executorOver(briefingWith([account]), agendaWith([externalEvent]), undefined).run(
      'meeting_prep',
      'u1',
      NOW,
      'ws-1',
    )
    expect(outcome.outcome).toBe('1 rendez-vous client à préparer.')
  })
})
