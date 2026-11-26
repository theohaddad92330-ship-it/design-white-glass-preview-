import { describe, expect, it } from 'vitest'
import { isProfileContextToReview } from './revision-review-state'

/**
 * #2010.1 / #2010.3 / #2010.17 / #2011.9 — tranché par Louis 22/09 soir
 * (decisions-louis-22-09-soir.md §1), reco appliquée : scopé au SEUL audit
 * (`useCommercialAudit`), jamais aux 8 autres consommateurs de
 * `useProfileContext` — un état DÉRIVÉ, pas un enum persisté.
 */
describe('isProfileContextToReview — #2010.1/.3/.17/#2011.9', () => {
  it('un premier contexte (aucune révision antérieure) n’est jamais « à revoir »', () => {
    expect(isProfileContextToReview('succeeded', 1)).toBe(false)
  })

  it('sans révision du tout (jamais généré), jamais « à revoir »', () => {
    expect(isProfileContextToReview('succeeded', 0)).toBe(false)
  })

  it('un contexte SUCCEEDED qui remplace une version antérieure est « à revoir »', () => {
    expect(isProfileContextToReview('succeeded', 2)).toBe(true)
  })

  it('un contexte déjà VALIDÉ n’est jamais « à revoir », quel que soit l’historique', () => {
    expect(isProfileContextToReview('validated', 3)).toBe(false)
  })

  it('en cours de génération ou en échec : rien à revoir, ce n’est pas le même fait', () => {
    expect(isProfileContextToReview('generating', 3)).toBe(false)
    expect(isProfileContextToReview('failed', 3)).toBe(false)
  })

  it('aucun contexte : rien à revoir', () => {
    expect(isProfileContextToReview(null, 0)).toBe(false)
  })
})
