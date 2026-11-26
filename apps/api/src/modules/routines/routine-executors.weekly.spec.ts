import { RoutineExecutors } from './routine-executors'
import type { AgendaService } from '../agenda/agenda.service'
import type { CrmRoutinesService } from './crm-routines.service'
import type { AgendaEvent } from '@bellum/contracts'

/**
 * #2782 / #2392.6 / #2392.8 — LA REVUE HEBDOMADAIRE COMPLÈTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `weekly_recap` ne comptait que les rendez-vous TENUS (un signal d'agenda),
 * alors que le catalogue (`routine-catalog.ts`) promet « tes actions de la
 * semaine et l'état de tes comptes ». `weekly_forecast` ne listait que les
 * rendez-vous et créneaux à venir, sans jamais dire si la revue avait de quoi
 * préparer un forecast (#2392.8).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS PROUVENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun vanity metric (#2392.7) : les nouveaux signaux sont des DÉCISIONS
 * réellement obtenues (`DECIDED_STAGES`) et des échéances SAISIES
 * (`expected_close_on`), jamais un compte d'e-mails ou de clics. Aucune
 * probabilité ni prévisionnel pondéré : `weeklyForecast` DIT explicitement
 * quand elle n'a pas assez d'éléments plutôt que d'en fabriquer un.
 * `measured` voyage jusqu'à la phrase, même patron que les cinq automatisations
 * CRM (`routine-executors.crm.spec.ts`).
 */

/** Un exécuteur avec les SEULES dépendances que ces deux routines empruntent. */
function executorOver(agenda: Partial<AgendaService>, crmRoutines: Partial<CrmRoutinesService>): RoutineExecutors {
  return new RoutineExecutors(
    undefined as never,
    undefined as never,
    agenda as AgendaService,
    undefined as never,
    undefined as never,
    undefined as never,
    crmRoutines as CrmRoutinesService,
    undefined as never,
    undefined as never,
    undefined as never,
  )
}

const WS = 'ws-1'
const held: AgendaEvent = {
  id: 'evt-1',
  summary: 'Point client',
  description: null,
  location: null,
  start: null,
  end: null,
  organizer: null,
  attendees: [],
  conferenceUrl: null,
  webUrl: null,
  status: null,
  isExternal: true,
  cancelled: false,
}
const won = { label: 'Refonte SI paiement', stage: 'won' }
const lost = { label: 'Migration ERP', stage: 'lost' }
const NO_OPEN_NEEDS = { openNeeds: async () => ({ measured: true, rows: [] }) }

describe('weekly_recap — au-delà des rendez-vous tenus (#2782, #2392.6, #2392.7)', () => {
  it('rien à dire : ni rendez-vous tenu, ni décision — MESURÉ, elle se tait', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [] },
      { projectsDecidedThisWeek: async () => ({ measured: true, rows: [] }), ...NO_OPEN_NEEDS },
    ).run('weekly_recap', 'u1', new Date(), WS)
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).not.toContain('pas pu')
  })

  it('lecture des décisions cassée : elle NE dit PAS « aucune décision » — measured=false se voit', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [] },
      { projectsDecidedThisWeek: async () => ({ measured: false, rows: [] }), ...NO_OPEN_NEEDS },
    ).run('weekly_recap', 'u1', new Date(), WS)
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('pas pu')
  })

  it('des rendez-vous tenus SANS décision : elle notifie quand même (comportement historique préservé)', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [held] },
      { projectsDecidedThisWeek: async () => ({ measured: true, rows: [] }), ...NO_OPEN_NEEDS },
    ).run('weekly_recap', 'u1', new Date(), WS)
    expect(outcome.notified).toBe(true)
    expect(outcome.notification?.body).toContain('1 rendez-vous')
  })

  it('des décisions SANS aucun rendez-vous tenu : elle notifie aussi — un dossier gagné n’attend pas l’agenda', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [] },
      { projectsDecidedThisWeek: async () => ({ measured: true, rows: [won] }), ...NO_OPEN_NEEDS },
    ).run('weekly_recap', 'u1', new Date(), WS)
    expect(outcome.notified).toBe(true)
    expect(outcome.notification?.body).toContain('gagné')
  })

  it('nomme SÉPARÉMENT les dossiers gagnés et perdus — jamais un solde net qui les confond', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [held] },
      { projectsDecidedThisWeek: async () => ({ measured: true, rows: [won, lost] }), ...NO_OPEN_NEEDS },
    ).run('weekly_recap', 'u1', new Date(), WS)
    expect(outcome.notification?.body).toContain('1 dossier gagné')
    expect(outcome.notification?.body).toContain('1 dossier perdu')
  })

  it('nomme les besoins ENCORE OUVERTS — séparément des dossiers décidés (#2392.6)', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [held] },
      {
        projectsDecidedThisWeek: async () => ({ measured: true, rows: [] }),
        openNeeds: async () => ({ measured: true, rows: [{ title: 'Lead dev React' }, { title: 'DevOps senior' }] }),
      },
    ).run('weekly_recap', 'u1', new Date(), WS)
    expect(outcome.notification?.body).toContain('2 besoins encore ouverts')
  })

  it('lecture des besoins ouverts cassée : elle le DIT plutôt que de taire le manque', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [held] },
      {
        projectsDecidedThisWeek: async () => ({ measured: true, rows: [] }),
        openNeeds: async () => ({ measured: false, rows: [] }),
      },
    ).run('weekly_recap', 'u1', new Date(), WS)
    expect(outcome.notification?.body).toContain('besoins ouverts n’ont pas pu être vérifiés')
  })

  it('un compte de besoins ouverts, à lui seul, ne déclenche jamais la routine (état permanent, pas un événement de la semaine)', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [] },
      {
        projectsDecidedThisWeek: async () => ({ measured: true, rows: [] }),
        openNeeds: async () => ({ measured: true, rows: [{ title: 'Lead dev React' }] }),
      },
    ).run('weekly_recap', 'u1', new Date(), WS)
    expect(outcome.notified).toBe(false)
  })
})

describe('weekly_forecast — le forecast se PRÉPARE, il ne se fabrique pas (#2782, #2392.8)', () => {
  it('aucun dossier avec une échéance saisie : elle le DIT plutôt que d’inventer un chiffre', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [] },
      { projectsExpectedToCloseSoon: async () => ({ measured: true, rows: [] }) },
    ).run('weekly_forecast', 'u1', new Date(), WS)
    expect(outcome.notification?.body).toContain('pas assez d’éléments')
  })

  it('des dossiers attendus : elle les compte et nomme le plus proche — jamais une probabilité', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [] },
      {
        projectsExpectedToCloseSoon: async () => ({
          measured: true,
          rows: [{ label: 'Refonte SI paiement', stage: 'negotiation', expected_close_on: '2026-09-22' }],
        }),
      },
    ).run('weekly_forecast', 'u1', new Date(), WS)
    expect(outcome.notification?.body).toContain('Refonte SI paiement')
    expect(outcome.notification?.body).not.toMatch(/%|probabilit/i)
  })

  it('lecture cassée : elle ne dit PAS « pas assez d’éléments » — measured=false se voit', async () => {
    const outcome = await executorOver(
      { listEvents: async () => [] },
      { projectsExpectedToCloseSoon: async () => ({ measured: false, rows: [] }) },
    ).run('weekly_forecast', 'u1', new Date(), WS)
    expect(outcome.notification?.body).toContain('n’ont pas pu être vérifiées')
  })
})
