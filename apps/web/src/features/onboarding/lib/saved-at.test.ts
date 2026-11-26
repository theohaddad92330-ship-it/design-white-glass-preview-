import { describe, expect, it } from 'vitest'
import { formatSavedAt } from './saved-at'

/**
 * #2026.2 — « Enregistré à 14 h 32 ».
 *
 * Le même défaut que `claim-notice.ts` (corrigé le 15/09) était possible ici :
 * `toLocaleTimeString()` nu écrit l'heure dans la locale du NAVIGATEUR, pas
 * celle que l'app affiche. `formatSavedAt` prend la langue de l'app en
 * paramètre et ne retombe JAMAIS sur le runtime.
 */
describe('formatSavedAt', () => {
  it('formate en fr-FR quand la langue app est fr', () => {
    const out = formatSavedAt('2026-09-15T12:32:00.000Z', 'fr')
    expect(out).not.toBeNull()
    expect(out).toMatch(/\d{1,2}\D+\d{2}/)
  })

  it('formate en en-GB quand la langue app est en', () => {
    const out = formatSavedAt('2026-09-15T12:32:00.000Z', 'en')
    expect(out).not.toBeNull()
  })

  it('rend null quand aucun horodatage n’est connu — jamais une heure inventée', () => {
    expect(formatSavedAt(null, 'fr')).toBeNull()
  })

  it('rend null sur une date illisible plutôt que de planter', () => {
    expect(formatSavedAt('pas une date', 'fr')).toBeNull()
  })
})
