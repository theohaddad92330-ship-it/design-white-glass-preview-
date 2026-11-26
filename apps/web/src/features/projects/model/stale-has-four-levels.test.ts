import { describe, expect, it } from 'vitest'
import { daysSince, staleLevel } from './stale-alert'

/**
 * QUATRE PALIERS D'IMMOBILITÉ, PAS UN — #1326 (6/9.1).
 *
 * « < 7 j = neutre · 7–14 j = attention légère · 14–30 j = orange · > 30 j =
 * alerte. » La carte n'en connaissait qu'un — quatorze jours — et une seule
 * couleur au-delà : un projet arrêté depuis trois semaines et un projet arrêté
 * depuis quatre mois s'affichaient à l'identique.
 *
 * ⚠️ Ce test SAIT DIRE NON : ramener `staleLevel` à son ancienne forme
 * (`days >= 14 ? 'warning' : null`) fait tomber les cas 7 j et 30 j.
 */
describe('staleLevel — les bornes sont inclusives en bas, comme l’issue les écrit', () => {
  it('ne dit rien sous sept jours — une alerte permanente cesse d’être une alerte', () => {
    expect(staleLevel(0)).toBeNull()
    expect(staleLevel(6)).toBeNull()
  })

  it('passe en attention légère à SEPT jours exactement', () => {
    expect(staleLevel(7)).toBe('attention')
    expect(staleLevel(13)).toBe('attention')
  })

  it('passe en alerte moyenne à QUATORZE jours exactement', () => {
    expect(staleLevel(14)).toBe('warning')
    expect(staleLevel(29)).toBe('warning')
  })

  it('passe en alerte franche à TRENTE jours exactement', () => {
    expect(staleLevel(30)).toBe('danger')
    expect(staleLevel(400)).toBe('danger')
  })

  it('ne peint rien sur un nombre qui n’en est pas un', () => {
    expect(staleLevel(Number.NaN)).toBeNull()
    expect(staleLevel(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('daysSince — une date illisible n’est pas « ça vient de bouger »', () => {
  // ⚠️ L'horloge est PASSÉE en argument. Un test qui lirait `Date.now()` casse
  // une nuit sur deux et dépend du fuseau de la machine — le dépôt l'a payé.
  const now = Date.parse('2026-09-03T12:00:00.000Z')

  it('compte les jours écoulés', () => {
    expect(daysSince('2026-08-24T12:00:00.000Z', now)).toBe(10)
    expect(daysSince('2026-09-03T11:00:00.000Z', now)).toBe(0)
  })

  it('rend null — et JAMAIS 0 — sur une date illisible', () => {
    // Les deux se ressemblent à l'œil et appellent des gestes opposés : « 0 j »
    // dit « laisse-le vivre », l'absence dit « personne ne l'a jamais fait
    // bouger ». Un `0` ici peindrait la carte en neutre sur une donnée absente.
    expect(daysSince('pas une date', now)).toBeNull()
    expect(daysSince('', now)).toBeNull()
  })
})
