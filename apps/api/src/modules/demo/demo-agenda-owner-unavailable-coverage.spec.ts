import { isOwnerUnavailable } from '@bellum/contracts'
import { detectOwnerUnavailableConflicts } from '../agenda/free-slots'
import { demoAgendaEvents } from './demo-agenda'

/**
 * LA PARITÉ DÉMO DU PROPRIÉTAIRE INDISPONIBLE (#2390.6, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE, ET CE QU'ELLE NE PROMET PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /agenda/conflicts/owner-unavailable` (`AgendaService.ownerUnavailableConflicts`)
 * est un lecteur RÉEL de `providerEventType`/`showAs` — contrairement au
 * statut `tentative` (voir `demo-agenda-status-coverage.spec.ts`), la donnée
 * n'est pas seedée sans appelant : cette garde le prouve en rejouant le vrai
 * détecteur sur le jeu de démonstration. Ce qu'elle ne prétend PAS, c'est
 * qu'un visiteur voit une différence à l'écran : aucun composant `apps/web`
 * ne lit encore ces deux champs — voir `demo-coverage.ts` pour la raison
 * écrite (`DEMO_AGENDA_EVENT_OWNER_UNAVAILABLE_COVERAGE`).
 */
describe('parité démo — propriétaire indisponible', () => {
  const NOW = new Date('2026-08-18T08:00:00Z')

  it('la garde LIT quelque chose — la semaine porte plusieurs évènements', () => {
    expect(demoAgendaEvents(NOW).length).toBeGreaterThan(5)
  })

  it('au moins un évènement de la semaine est marqué indisponible', () => {
    const events = demoAgendaEvents(NOW)
    const unavailable = events.filter(isOwnerUnavailable)
    expect(unavailable.length).toBeGreaterThan(0)
  })

  it('le détecteur RÉEL apparie ce bloc avec au moins un rendez-vous minuté du jeu', () => {
    const conflicts = detectOwnerUnavailableConflicts(demoAgendaEvents(NOW))
    expect(conflicts.length).toBeGreaterThan(0)
    for (const conflict of conflicts) {
      expect(isOwnerUnavailable(conflict.unavailability)).toBe(true)
      expect(isOwnerUnavailable(conflict.meeting)).toBe(false)
    }
  })

  it('la garde sait dire NON — un évènement ordinaire n’est jamais lu comme indisponible', () => {
    expect(isOwnerUnavailable({ providerEventType: 'default', showAs: 'busy' })).toBe(false)
    expect(isOwnerUnavailable({ providerEventType: null, showAs: null })).toBe(false)
  })
})
