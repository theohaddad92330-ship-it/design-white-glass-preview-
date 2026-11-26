import { RoutineExecutors } from './routine-executors'
import type { AgendaService } from '../agenda/agenda.service'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { Repository } from 'typeorm'

/**
 * #2390.18 (épopée #2926) — une annulation ferme le SEUL objet qui référence
 * réellement l'évènement annulé dans ce dépôt : la ligne `user_actions` que le
 * routeur d'actions écrit avec `calendar_event_id` (`action-router.service.ts`)
 * au moment où un rappel ou un événement est posé pour ce rendez-vous. Aucun
 * brief/tâche/notification n'a de lien équivalent ailleurs — un cascade plus
 * large inventerait un lien qui n'existe pas.
 *
 * On ARCHIVE (statut `Annulé` dans les métadonnées), jamais de suppression de
 * ligne (doctrine « on archive, on ne supprime pas »).
 */

type Row = { id: string; user_id: string; metadata: Record<string, unknown> }

function queryBuilderReturning(rows: Row[]) {
  const qb = {
    where: () => qb,
    andWhere: () => qb,
    getMany: async () => rows,
  }
  return qb
}

function userActionsRepo(rows: Row[], saveSpy: (row: Row) => void) {
  return {
    createQueryBuilder: () => queryBuilderReturning(rows),
    save: async (row: Row) => {
      saveSpy(row)
      return row
    },
  } as unknown as Repository<UserActionEntity>
}

const NOW = new Date('2026-09-28T09:00:00.000Z')

const cancelledEvent = {
  id: 'evt-1',
  summary: 'Point avancement — Client SA',
  isExternal: true,
  cancelled: true,
}

function executorOver(agenda: Partial<AgendaService>, userActions?: Repository<UserActionEntity>): RoutineExecutors {
  return new RoutineExecutors(
    undefined as never,
    undefined as never,
    agenda as AgendaService,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined,
    undefined,
    undefined,
    undefined,
    userActions,
  )
}

describe('rendez-vous annulé : fermeture du rappel/événement lié (#2390.18)', () => {
  it('aucun user_actions lié : le compte-rendu ne mentionne aucune fermeture (comportement inchangé)', async () => {
    const saveSpy = jest.fn()
    const outcome = await executorOver(
      {
        listEvents: async () => [cancelledEvent] as never,
        freeSlots: async () => [] as never,
      },
      userActionsRepo([], saveSpy),
    ).run('meeting_cancelled', 'u1', NOW)

    expect(outcome.outcome).toBe('1 annulation(s).')
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it("un rappel posé sur l'évènement annulé (calendar_event_id) : il passe Annulé, jamais supprimé", async () => {
    const saveSpy = jest.fn()
    const linked: Row = {
      id: 'action-1',
      user_id: 'u1',
      metadata: { label: 'Rappel programmé', status: 'Programmé', calendar_event_id: 'evt-1' },
    }
    const outcome = await executorOver(
      {
        listEvents: async () => [cancelledEvent] as never,
        freeSlots: async () => [] as never,
      },
      userActionsRepo([linked], saveSpy),
    ).run('meeting_cancelled', 'u1', NOW)

    expect(outcome.outcome).toContain('1 rappel(s)/événement(s) lié(s) clôturé(s)')
    expect(saveSpy).toHaveBeenCalledTimes(1)
    const saved = saveSpy.mock.calls[0]?.[0] as Row
    expect(saved.metadata['status']).toBe('Annulé')
    // La ligne existante n'est jamais effacée — elle est réécrite, pas retirée.
    expect(saved.metadata['label']).toBe('Rappel programmé')
  })

  it('un rappel déjà marqué Annulé ne se réécrit pas une seconde fois (idempotence)', async () => {
    const saveSpy = jest.fn()
    const linked: Row = {
      id: 'action-1',
      user_id: 'u1',
      metadata: { status: 'Annulé', calendar_event_id: 'evt-1' },
    }
    await executorOver(
      {
        listEvents: async () => [cancelledEvent] as never,
        freeSlots: async () => [] as never,
      },
      userActionsRepo([linked], saveSpy),
    ).run('meeting_cancelled', 'u1', NOW)

    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('le dépôt user_actions est indisponible (@Optional) : la routine fonctionne comme avant', async () => {
    const outcome = await executorOver(
      {
        listEvents: async () => [cancelledEvent] as never,
        freeSlots: async () => [] as never,
      },
      undefined,
    ).run('meeting_cancelled', 'u1', NOW)

    expect(outcome.outcome).toBe('1 annulation(s).')
  })
})
