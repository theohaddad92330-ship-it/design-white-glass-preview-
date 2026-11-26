import { AGENDA_EVENT_STATUSES, isConfirmedAgendaEvent } from '@bellum/contracts'
import { demoAgendaEvents } from './demo-agenda'

/**
 * LA PARITÉ DÉMO D'UN RENDEZ-VOUS « PROPOSÉ » (30/08/2026, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'agenda distingue désormais quatre états (`confirmed`, `tentative`,
 * `cancelled`, `unknown`) et un créneau `tentative` ne compte plus comme un
 * rendez-vous FIXÉ. Au 30/08/2026, cette règle ne vivait qu'à UN endroit du
 * dépôt (`activity-capture.service.ts#captureAgenda`) et aucun écran ne
 * lisait `event.status` — corrigé depuis (28/09/2026, #2770/#2101.19/.37) :
 * `AgendaGrid.tsx#EventBlock` et `AgendaBoard.tsx` appellent désormais
 * `isProposedAgendaEvent` (icône `CircleDashed`, aria-label
 * `agenda.board.proposed`, FR+EN) — voir `demo-coverage.ts`
 * (`DEMO_AGENDA_EVENT_STATUS_COVERAGE`) pour la preuve à jour.
 *
 * Cette garde vérifie ce qui est du ressort du semis : que la donnée porte
 * un évènement `tentative`, distinct d'un évènement confirmé.
 */
describe('parité démo — un rendez-vous proposé', () => {
  const NOW = new Date('2026-08-18T08:00:00Z')

  it('la garde LIT quelque chose — la semaine porte plusieurs évènements', () => {
    expect(demoAgendaEvents(NOW).length).toBeGreaterThan(5)
  })

  it('au moins un évènement de la semaine est PROPOSÉ (`tentative`), pas confirmé', () => {
    const events = demoAgendaEvents(NOW)
    const tentative = events.filter(event => event.status === 'tentative')
    expect(tentative.length).toBeGreaterThan(0)
    for (const event of tentative) expect(isConfirmedAgendaEvent(event.status)).toBe(false)
  })

  it('au moins un évènement reste CONFIRMÉ — sinon la démo ne montre plus l’état majoritaire', () => {
    const events = demoAgendaEvents(NOW)
    const confirmed = events.filter(event => isConfirmedAgendaEvent(event.status))
    expect(confirmed.length).toBeGreaterThan(0)
  })

  it('la garde sait dire NON — un statut inventé serait vu', () => {
    expect(AGENDA_EVENT_STATUSES.includes('maybe' as (typeof AGENDA_EVENT_STATUSES)[number])).toBe(false)
    expect(isConfirmedAgendaEvent('maybe')).toBe(false)
  })
})
