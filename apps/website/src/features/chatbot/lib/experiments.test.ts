import { describe, expect, it } from 'vitest'
import {
  applyOpenTiming,
  MOBILE_MIN_PRESENCE_MS,
  shouldAutoOpen,
  type AutoOpenInput,
  type VisitState,
} from './auto-open'
import {
  assignVariant,
  createVisitorId,
  FIRST_MESSAGE_VARIANTS,
  OPEN_TIMING_VARIANTS,
  type OpenTimingVariant,
} from './experiments'

const FRESH: VisitState = { autoOpened: false, dismissed: false, visitCount: 1 }

function plan(pathname: string, overrides: Partial<AutoOpenInput> = {}) {
  return shouldAutoOpen({ pathname, visit: FRESH, viewport: 'desktop', ...overrides })
}

describe("l'affectation d'un visiteur à une variante", () => {
  it('rend toujours la même variante au même visiteur', () => {
    const first = assignVariant('open_timing', 'abcdef')
    for (let i = 0; i < 30; i += 1) expect(assignVariant('open_timing', 'abcdef')).toBe(first)
  })

  it('rend une variante déclarée, jamais autre chose', () => {
    for (let i = 0; i < 300; i += 1) {
      expect(FIRST_MESSAGE_VARIANTS).toContain(assignVariant('first_message', `v${i}`))
      expect(OPEN_TIMING_VARIANTS).toContain(assignVariant('open_timing', `v${i}`))
    }
  })

  it("rend la RÉFÉRENCE quand on n'a pas d'identifiant — on ne mesure pas quelqu'un qu'on ne peut pas suivre", () => {
    expect(assignVariant('first_message', '')).toBe(FIRST_MESSAGE_VARIANTS[0])
    expect(assignVariant('open_timing', '')).toBe(OPEN_TIMING_VARIANTS[0])
  })

  it('sert les trois variantes de moment', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i += 1) seen.add(assignVariant('open_timing', `visiteur-${i}`))
    expect(seen.size).toBe(3)
  })
})

describe("l'identifiant de visiteur", () => {
  it('ne ressort pas deux fois le même', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 500; i += 1) ids.add(createVisitorId())
    expect(ids.size).toBe(500)
  })

  it("prend sa source d'aléa en paramètre — un module qui appellerait Math.random ne se testerait pas", () => {
    expect(createVisitorId(() => 0.42)).toBe(createVisitorId(() => 0.42))
    expect(createVisitorId(() => 0.42)).not.toBe(createVisitorId(() => 0.43))
  })

  it('est court et opaque — il ne dit rien de la personne', () => {
    const id = createVisitorId()
    expect(id.length).toBeLessThanOrEqual(16)
    expect(id).toMatch(/^[a-z0-9]+$/)
  })
})

describe("l'A/B du moment d'ouverture ne casse pas les sept règles de retenue", () => {
  it.each(OPEN_TIMING_VARIANTS)('laisse une page légale silencieuse — variante %s', variant => {
    expect(applyOpenTiming(plan('/privacy'), variant, 'desktop')).toBeNull()
    expect(applyOpenTiming(plan('/cgv'), variant, 'desktop')).toBeNull()
  })

  it.each(OPEN_TIMING_VARIANTS)('ne transforme pas une bulle en ouverture — variante %s', variant => {
    const timed = applyOpenTiming(plan('/about'), variant, 'desktop')
    expect(timed?.open).toBe(false)
    expect(timed?.delayMs).toBe(12_000)
  })

  it.each(OPEN_TIMING_VARIANTS)('ne retarde pas une sortie dintention — variante %s', variant => {
    const timed = applyOpenTiming(plan('/pricing', { exitIntent: true }), variant, 'desktop')
    expect(timed?.delayMs).toBe(0)
    expect(timed?.message).toBe('exit')
    expect(timed?.trigger).toBe('timer')
  })

  it.each(OPEN_TIMING_VARIANTS)('ne fait pas attendre un visiteur qui revient — variante %s', variant => {
    const timed = applyOpenTiming(plan('/pricing', { visit: { ...FRESH, visitCount: 3 } }), variant, 'desktop')
    expect(timed?.delayMs).toBe(0)
    expect(timed?.message).toBe('return')
  })

  it("n'insiste toujours pas après une fermeture", () => {
    expect(applyOpenTiming(plan('/pricing', { visit: { ...FRESH, dismissed: true } }), 'at8s', 'desktop')).toBeNull()
  })
})

describe("ce que l'A/B change vraiment", () => {
  it('remplace le délai de la première ouverture par le moment testé', () => {
    expect(applyOpenTiming(plan('/pricing'), 'at8s', 'desktop')?.delayMs).toBe(8_000)
    expect(applyOpenTiming(plan('/pricing'), 'at15s', 'desktop')?.delayMs).toBe(15_000)
  })

  it('bascule sur le défilement plutôt que sur le temps', () => {
    const timed = applyOpenTiming(plan('/pricing'), 'onScroll', 'desktop')
    expect(timed?.trigger).toBe('scroll')
    expect(timed?.delayMs).toBe(0)
  })

  it('garde le plancher mobile de trois secondes, y compris au défilement', () => {
    expect(applyOpenTiming(plan('/pricing', { viewport: 'mobile' }), 'onScroll', 'mobile')?.delayMs).toBe(
      MOBILE_MIN_PRESENCE_MS,
    )
    expect(applyOpenTiming(plan('/pricing', { viewport: 'mobile' }), 'at8s', 'mobile')?.delayMs).toBe(8_000)
  })

  it('ignore une variante inconnue au lieu douvrir nimporte quand', () => {
    const timed = applyOpenTiming(plan('/pricing'), 'n-importe-quoi' as OpenTimingVariant, 'desktop')
    expect(timed?.delayMs).toBe(2_000)
    expect(timed?.trigger).toBe('timer')
  })
})
