import { RoutineExecutors } from './routine-executors'
import type { AgendaService } from '../agenda/agenda.service'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import type { Repository } from 'typeorm'

/**
 * #2390.18 (épopée #2926) — la CASCADE d'annulation, côté tâches de préparation.
 *
 * Une action du plan qui vise un rendez-vous (`target_kind = 'meeting'`,
 * `target_id` = l'identifiant de l'évènement d'agenda) devient CADUQUE
 * (`execution_status = 'obsolete'`) quand ce rendez-vous est annulé. Ce sont
 * des tâches INTERNES : rien n'est envoyé, rien n'est écrit dans un agenda
 * externe. Marquée, jamais supprimée ; une tâche déjà faite ne se touche pas.
 */

const NOW = new Date('2026-09-29T09:00:00.000Z')

const cancelledEvent = { id: 'evt-1', summary: 'Point — Client SA', isExternal: true, cancelled: true }

function planItemsRepo(affected: number, updateSpy: (where: unknown, patch: unknown) => void) {
  return {
    update: async (where: unknown, patch: unknown) => {
      updateSpy(where, patch)
      return { affected }
    },
  } as unknown as Repository<ActionPlanItemEntity>
}

function executorOver(agenda: Partial<AgendaService>, planItems?: Repository<ActionPlanItemEntity>) {
  const blanks: unknown[] = Array.from({ length: 14 }, () => undefined)
  blanks[2] = agenda
  const Ctor = RoutineExecutors as unknown as new (...args: unknown[]) => RoutineExecutors
  return new Ctor(...blanks, undefined /* userActions */, undefined /* credits */, planItems)
}

const agendaWith = (events: unknown[]) =>
  ({ listEvents: async () => events as never, freeSlots: async () => [] as never }) as Partial<AgendaService>

describe('rendez-vous annulé : tâches de préparation caduques (#2390.18)', () => {
  it('marque caduques les tâches ouvertes qui visent le rendez-vous annulé, jamais les faites', async () => {
    const updateSpy = jest.fn()
    const outcome = await executorOver(agendaWith([cancelledEvent]), planItemsRepo(2, updateSpy)).run(
      'meeting_cancelled',
      'u1',
      NOW,
    )

    expect(updateSpy).toHaveBeenCalledTimes(1)
    const [where, patch] = updateSpy.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(where['user_id']).toBe('u1')
    expect(where['target_kind']).toBe('meeting')
    expect(patch['execution_status']).toBe('obsolete')
    // Ni « done » ni supprimée : seules les tâches encore ouvertes sont visées.
    expect(JSON.stringify(where['execution_status'])).not.toContain('done')
    expect(outcome.outcome).toContain('2 tâche(s) de préparation caduque(s)')
  })

  it('aucune tâche liée : le compte-rendu ne mentionne rien (une absence ne fait aucune ligne)', async () => {
    const outcome = await executorOver(agendaWith([cancelledEvent]), planItemsRepo(0, jest.fn())).run(
      'meeting_cancelled',
      'u1',
      NOW,
    )
    expect(outcome.outcome).toBe('1 annulation(s).')
  })

  it('dépôt indisponible (@Optional) : comportement inchangé', async () => {
    const outcome = await executorOver(agendaWith([cancelledEvent]), undefined).run('meeting_cancelled', 'u1', NOW)
    expect(outcome.outcome).toBe('1 annulation(s).')
  })
})
