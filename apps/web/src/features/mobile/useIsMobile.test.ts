import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMobileNow, MOBILE_BREAKPOINT } from './useIsMobile'

/**
 * #2130.49 — recette du scénario « mobile (≤768px) ».
 *
 * `isMobileNow` est la lecture SYNCHRONE et HORS-REACT de la borne mobile —
 * celle qu'un `beforeLoad` de route appelle avant tout rendu (#1786, voir le
 * docblock du fichier). Aucun test ne couvrait cette fonction : les tests de
 * composants existants (`AccountDetailHero.mobile.test.tsx`) ne prouvent que
 * la STRUCTURE JSX, jamais le calcul de la borne elle-même — jsdom ne fait
 * aucune mise en page, donc rien ne prouvait que 767px bascule et que 768px
 * ne bascule pas.
 */
function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('#2130.49 — isMobileNow lit la borne 768px, pas un agent utilisateur', () => {
  it('rend true sous la borne (viewport étroit, la promesse mobile #2639.1)', () => {
    mockMatchMedia(true)
    expect(isMobileNow()).toBe(true)
  })

  it('rend false au-dessus de la borne — sait dire NON à un viewport de bureau', () => {
    mockMatchMedia(false)
    expect(isMobileNow()).toBe(false)
  })

  it('interroge bien la borne partagée MOBILE_BREAKPOINT (768), pas une valeur recopiée', () => {
    const matchMediaSpy = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', matchMediaSpy)

    isMobileNow()

    expect(matchMediaSpy).toHaveBeenCalledWith(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  })

  it('sans matchMedia (jsdom nu, aucun stub) : replie sur « bureau » plutôt que de jeter', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(isMobileNow()).toBe(false)
  })
})
