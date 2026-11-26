import { describe, expect, it } from 'vitest'
import { parseAgendaMode } from './briefing-search'

/**
 * #2994 — LE FILTRE DE VUE (« jour » / « semaine ») SURVIT AU RETOUR (#2112 :
 * « les filtres pertinents survivent au retour »), via un paramètre de route
 * (`?mode=`), jamais `localStorage` (décision du jour).
 *
 * Même patron que `mailSearchIntentSchema` côté `/mailbox/` : une valeur
 * inconnue est IGNORÉE plutôt que refusée — un lien collé de travers doit
 * ouvrir le brief en vue par défaut, pas une page d'erreur.
 */
describe('parseAgendaMode (#2994)', () => {
  it('lit "day" et "week" depuis le paramètre de route', () => {
    expect(parseAgendaMode('day')).toBe('day')
    expect(parseAgendaMode('week')).toBe('week')
  })

  it('ignore une valeur absente ou inconnue plutôt que de la refuser', () => {
    expect(parseAgendaMode(undefined)).toBeUndefined()
    expect(parseAgendaMode('month')).toBeUndefined()
    expect(parseAgendaMode(3)).toBeUndefined()
    expect(parseAgendaMode(null)).toBeUndefined()
  })
})
