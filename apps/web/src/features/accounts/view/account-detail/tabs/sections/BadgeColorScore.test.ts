import { ACCOUNT_VERDICT_COLOR } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { BADGE_COLORS } from './BadgeColorScore'

/**
 * #2143.26 (épopée #2924) — une page dérivée ne recrée jamais un score.
 *
 * `ring` recopiait ses quatre couleurs en dur et avait DÉRIVÉ de la source
 * canonique (`NO-GO` : `#FF5E57` ici, `#EF4444` dans `account-score.ts`) —
 * trois écrans dérivés pouvaient rendre un anneau d'une teinte différente du
 * badge canonique pour le même verdict. Ce test fixe la promesse : `ring`
 * EST `ACCOUNT_VERDICT_COLOR`, jamais une seconde copie qui peut dériver.
 */
describe('BADGE_COLORS.ring — #2143.26', () => {
  it('lit ACCOUNT_VERDICT_COLOR, la source unique — jamais une seconde valeur', () => {
    expect(BADGE_COLORS.GO.ring).toBe(ACCOUNT_VERDICT_COLOR.GO)
    expect(BADGE_COLORS.PRUDENT.ring).toBe(ACCOUNT_VERDICT_COLOR.PRUDENT)
    expect(BADGE_COLORS['NO-GO'].ring).toBe(ACCOUNT_VERDICT_COLOR['NO-GO'])
    expect(BADGE_COLORS.EXPLORER.ring).toBe(ACCOUNT_VERDICT_COLOR.EXPLORER)
  })
})
