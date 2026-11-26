import { describe, expect, it } from 'vitest'
import { BANNER_VARIANTS, VARIANT_COLOR } from './banner-preview.logic'

/**
 * #1667.2a — l'aperçu de bandeau reproduit `BannerBar` (apps/web), avec les
 * tokens DU MANAGER (`--bellum-*` n'existe pas dans ce paquet). Un seul
 * endroit décide de la couleur d'une variante (GA-26) : `banner-form.tsx` et
 * `banner-preview.tsx` importent tous deux CE fichier plutôt que de la
 * redéclarer chacun de leur côté — c'est exactement ce que l'issue reprochait
 * (« ses PROPRES tokens », au pluriel des appelants).
 */
describe('VARIANT_COLOR — même correspondance sémantique que BannerBar', () => {
  it('info → l’accent général, comme --bellum-primary-500 dans BannerBar', () => {
    expect(VARIANT_COLOR.info).toBe('var(--accent)')
  })

  it('success / warning / critical → les tokens sémantiques du manager', () => {
    expect(VARIANT_COLOR.success).toBe('var(--green)')
    expect(VARIANT_COLOR.warning).toBe('var(--amber)')
    expect(VARIANT_COLOR.critical).toBe('var(--red)')
  })

  it('couvre exactement les quatre variantes de bandeau, ni plus ni moins', () => {
    expect(Object.keys(VARIANT_COLOR).sort()).toEqual([...BANNER_VARIANTS].sort())
  })

  it('aucune couleur littérale — chaque valeur est un token CSS `var(--...)`', () => {
    for (const value of Object.values(VARIANT_COLOR)) {
      expect(value).toMatch(/^var\(--[a-z-]+\)$/)
    }
  })
})
