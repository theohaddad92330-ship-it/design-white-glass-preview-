import { findRoutine } from './routine-catalog'
import { RoutineExecutors } from './routine-executors'
import { CrmRoutinesService } from './crm-routines.service'

/**
 * #3061 / #2374.19 — le seul reste de l'épopée après le point d'ancrage
 * (`CrmRoutinesService.notNowDeferredsDue`, `outreach.service.ts`) : rien ne
 * faisait RESSURGIR d'elle-même une pause « pas maintenant » à échéance, sans
 * qu'un humain ouvre la fiche contact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS DÉFENDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Même motif que `availability-reconfirm.spec.ts` : une routine que le
 * `switch` ne route pas, ou dont la sortie ne correspond pas à sa cadence
 * déclarée, tourne sans jamais parler. Et cette routine porte un risque
 * supplémentaire, propre à #3061 : elle ne doit JAMAIS reprendre une séquence
 * ni envoyer un message — seule `resume()` (geste humain, #2381.8) le fait.
 */
function executorsWith(notNowDeferredsDue: jest.Mock): RoutineExecutors {
  const crmRoutines = { notNowDeferredsDue } as unknown as CrmRoutinesService
  return new RoutineExecutors(
    null as never, // briefing
    null as never, // mailbox
    null as never, // agenda
    null as never, // ats
    null as never, // crm
    null as never, // delivery
    crmRoutines,
    null as never, // talentRoutines
    null as never, // territories
    null as never, // territorySnapshots
  )
}

describe('l’exécuteur de la revérification des pauses « pas maintenant »', () => {
  it('est ATTEINT par sa clé — une routine que le `switch` ne route pas est morte', async () => {
    const notNowDeferredsDue = jest.fn().mockResolvedValue({ measured: true, rows: [] })
    const executors = executorsWith(notNowDeferredsDue)

    await executors.run('not_now_revalidation', 'u1', new Date('2026-09-28T07:00:00Z'), 'ws-1')

    expect(notNowDeferredsDue).toHaveBeenCalledWith('ws-1')
  })

  it('NOMME la plus ancienne — un compteur nu ne dit pas laquelle revoir en premier', async () => {
    const notNowDeferredsDue = jest.fn().mockResolvedValue({
      measured: true,
      rows: [
        { sequence_id: 'seq-1', full_name: 'Nadia Berrada', poste_still_valid: true, days: 74 },
        { sequence_id: 'seq-2', full_name: 'Paul Renaud', poste_still_valid: false, days: 61 },
      ],
    })
    const executors = executorsWith(notNowDeferredsDue)

    const outcome = await executors.run('not_now_revalidation', 'u1', new Date('2026-09-28T07:00:00Z'), 'ws-1')

    expect(outcome.notified).toBe(true)
    expect(outcome.notification?.title).toBe('2 pauses « pas maintenant » à revérifier')
    expect(outcome.notification?.body).toContain('Nadia Berrada')
    expect(outcome.notification?.body).toContain('74')
    expect(outcome.notification?.link).toBe('/contacts')
  })

  it('nomme un poste changé — jamais une reprise devinée', async () => {
    const notNowDeferredsDue = jest.fn().mockResolvedValue({
      measured: true,
      rows: [{ sequence_id: 'seq-2', full_name: 'Paul Renaud', poste_still_valid: false, days: 61 }],
    })
    const executors = executorsWith(notNowDeferredsDue)

    const outcome = await executors.run('not_now_revalidation', 'u1', new Date('2026-09-28T07:00:00Z'), 'ws-1')

    expect(outcome.notification?.body).toContain('poste changé depuis')
  })

  it('accorde le singulier — « 1 pauses » se lit comme un bogue', async () => {
    const notNowDeferredsDue = jest.fn().mockResolvedValue({
      measured: true,
      rows: [{ sequence_id: 'seq-1', full_name: 'Nadia Berrada', poste_still_valid: true, days: 61 }],
    })
    const executors = executorsWith(notNowDeferredsDue)

    const outcome = await executors.run('not_now_revalidation', 'u1', new Date('2026-09-28T07:00:00Z'), 'ws-1')

    expect(outcome.notification?.title).toBe('1 pause « pas maintenant » à revérifier')
  })

  it('se TAIT quand il n’y a rien — et le dit dans la trace', async () => {
    const notNowDeferredsDue = jest.fn().mockResolvedValue({ measured: true, rows: [] })
    const executors = executorsWith(notNowDeferredsDue)

    const outcome = await executors.run('not_now_revalidation', 'u1', new Date('2026-09-28T07:00:00Z'), 'ws-1')

    expect(outcome.notified).toBe(false)
    expect(outcome.notification).toBeUndefined()
    expect(outcome.outcome).toBe('Aucune pause « pas maintenant » à revérifier.')
  })

  it('lecture cassée : elle ne dit PAS « aucune pause à revérifier »', async () => {
    const notNowDeferredsDue = jest.fn().mockResolvedValue({ measured: false, rows: [] })
    const executors = executorsWith(notNowDeferredsDue)

    const outcome = await executors.run('not_now_revalidation', 'u1', new Date('2026-09-28T07:00:00Z'), 'ws-1')

    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).not.toContain('Aucune pause')
    expect(outcome.outcome).toContain('pas pu')
  })
})

describe('la routine est DÉCLARÉE de façon cohérente avec sa sortie', () => {
  it('rend une `notification`, donc sa cadence ne doit pas être continue — même raison que `availability_reconfirm`', () => {
    const definition = findRoutine('not_now_revalidation')
    expect(definition).toBeDefined()
    expect(definition?.cadence).toBe('weekly')
    expect(definition?.requires).toEqual([])
    expect(definition?.defaultEnabled).toBe(true)
    // n1_prepare : elle NOMME, elle ne reprend jamais une séquence elle-même.
    expect(definition?.automationLevel).toBe('n1_prepare')
  })

  it('dit ce qu’elle ne fait PAS — contexte/signal/pertinence ne sont jamais devinés', () => {
    const definition = findRoutine('not_now_revalidation')
    expect(definition?.fallback.fr).toContain('jamais devinés')
    expect(definition?.fallback.en).toContain('never guessed')
  })
})
