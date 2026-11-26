import { describe, expect, it } from 'vitest'
import {
  GUIDE_SPOTLIGHT_HALO_PADDING,
  guideSpotlightHalo,
  needsScrollIntoView,
  placeGuideBubble,
  type GuideRect,
  type GuideViewport,
} from './guide-spotlight-geometry'

/** Un bureau large, sans rien de collant. */
const desktop: GuideViewport = { width: 1440, height: 900, stickyTopInset: 0, stickyBottomInset: 0 }
/** Un téléphone sous la borne des 768 px (GA-28), avec sa barre d'onglets. */
const phone: GuideViewport = { width: 390, height: 780, stickyTopInset: 56, stickyBottomInset: 64 }

const bubble = { width: 320, height: 160 }
const centre: GuideRect = { top: 400, left: 600, width: 200, height: 40 }

describe('le halo du spotlight (#2212.9)', () => {
  it('entoure la cible sans jamais la rogner', () => {
    const halo = guideSpotlightHalo(centre)
    expect(halo.top).toBe(centre.top - GUIDE_SPOTLIGHT_HALO_PADDING)
    expect(halo.left).toBe(centre.left - GUIDE_SPOTLIGHT_HALO_PADDING)
    expect(halo.width).toBe(centre.width + GUIDE_SPOTLIGHT_HALO_PADDING * 2)
    expect(halo.height).toBe(centre.height + GUIDE_SPOTLIGHT_HALO_PADDING * 2)
  })

  it('ne sort jamais en coordonnées négatives sur une cible collée au bord', () => {
    const halo = guideSpotlightHalo({ top: 0, left: 0, width: 40, height: 40 })
    expect(halo.top).toBeGreaterThanOrEqual(0)
    expect(halo.left).toBeGreaterThanOrEqual(0)
  })
})

describe('le placement de la bulle (#2212.3 #2212.20 #2212.21)', () => {
  it('se pose SOUS une cible haute, à distance, sans la masquer (#2212.20)', () => {
    const placement = placeGuideBubble({ top: 100, left: 600, width: 200, height: 40 }, bubble, desktop)
    expect(placement.side).toBe('bottom')
    expect(placement.top).toBeGreaterThanOrEqual(140)
  })

  it('bascule AU-DESSUS quand il n’y a plus la place en bas (#2212.21)', () => {
    const placement = placeGuideBubble({ top: 820, left: 600, width: 200, height: 40 }, bubble, desktop)
    expect(placement.side).toBe('top')
    expect(placement.top + bubble.height).toBeLessThanOrEqual(820)
  })

  it('ne recouvre JAMAIS la cible, quelle que soit sa position', () => {
    for (const top of [0, 120, 430, 700, 860]) {
      const target: GuideRect = { top, left: 600, width: 200, height: 40 }
      const placement = placeGuideBubble(target, bubble, desktop)
      const overlapsVertically =
        placement.top < target.top + target.height && placement.top + bubble.height > target.top
      expect(overlapsVertically).toBe(false)
    }
  })

  it('respecte un en-tête collant : il ne passe pas dessous (#2212.19)', () => {
    const withSticky: GuideViewport = { ...desktop, stickyTopInset: 120 }
    const placement = placeGuideBubble({ top: 160, left: 600, width: 200, height: 40 }, bubble, withSticky)
    expect(placement.side).toBe('bottom')
    const above = placeGuideBubble({ top: 860, left: 600, width: 200, height: 40 }, bubble, withSticky)
    expect(above.top).toBeGreaterThanOrEqual(120)
  })

  it('respecte une barre collante en bas', () => {
    const placement = placeGuideBubble({ top: 300, left: 600, width: 200, height: 40 }, bubble, phone)
    expect(placement.top + bubble.height).toBeLessThanOrEqual(phone.height - phone.stickyBottomInset)
  })

  it('garde la gouttière de 16 px à gauche et à droite, même collé au bord', () => {
    for (const left of [0, 300, 1400]) {
      const placement = placeGuideBubble({ top: 300, left, width: 40, height: 40 }, bubble, desktop)
      expect(placement.left).toBeGreaterThanOrEqual(16)
      expect(placement.left + placement.width).toBeLessThanOrEqual(desktop.width - 16)
    }
  })

  /**
   * GA-28 — le mobile est le produit : sous 768 px la bulle prend la largeur
   * utile entre gouttières plutôt que de se faire rogner.
   */
  it('prend la largeur utile sous la borne des 768 px', () => {
    const placement = placeGuideBubble({ top: 300, left: 40, width: 120, height: 40 }, bubble, phone)
    expect(placement.width).toBe(phone.width - 32)
    expect(placement.left).toBe(16)
    expect(['top', 'bottom']).toContain(placement.side)
  })

  /**
   * LE CAS QUI A FAIT TOMBER LA PREMIÈRE VERSION. Une fenêtre courte où il n'y a
   * la place NI dessus NI dessous : la version qui rabattait la bulle dans la
   * zone utile la reposait SUR la cible — le guide masquait ce qu'il désignait.
   * Ici, elle déborde, et la cible reste visible.
   */
  it('déborde plutôt que de recouvrir la cible quand il n’y a de place nulle part', () => {
    const cramped: GuideViewport = { width: 1440, height: 200, stickyTopInset: 0, stickyBottomInset: 0 }
    const target: GuideRect = { top: 150, left: 600, width: 200, height: 40 }
    const placement = placeGuideBubble(target, bubble, cramped)
    const overlaps = placement.top < target.top + target.height && placement.top + bubble.height > target.top
    expect(overlaps).toBe(false)
  })

  it('ne rend jamais une largeur négative sur une fenêtre absurde', () => {
    const placement = placeGuideBubble(centre, bubble, {
      width: 10,
      height: 10,
      stickyTopInset: 0,
      stickyBottomInset: 0,
    })
    expect(placement.width).toBeGreaterThan(0)
  })
})

describe('R33b (16/10) — la bulle ne recouvre jamais la zone à épargner (les amorces de Laura sur /chat)', () => {
  // /chat : la saisie est ciblée, les amorces sont posées juste au-dessus d'elle.
  const composer: GuideRect = { top: 800, left: 300, width: 840, height: 60 }
  const starters: GuideRect = { top: 660, left: 300, width: 840, height: 120 }
  const intersects = (a: GuideRect, top: number, height: number) => top < a.top + a.height && top + height > a.top

  it('sans zone à épargner, la bulle se pose au-dessus de la saisie, donc SUR les amorces (le défaut mesuré)', () => {
    const placement = placeGuideBubble(composer, bubble, desktop)
    expect(intersects(starters, placement.top, bubble.height)).toBe(true)
  })

  it.each([120, 168, 240, 320])(
    'avec la zone à épargner, une bulle de %i px ne recouvre ni les amorces ni la saisie',
    height => {
      const placement = placeGuideBubble(composer, { width: bubble.width, height }, desktop, starters)
      expect(intersects(starters, placement.top, height)).toBe(false)
      expect(intersects(composer, placement.top, height)).toBe(false)
      expect(placement.top + height).toBeLessThanOrEqual(starters.top)
    },
  )

  it('une zone absente (null) ne change rien au placement', () => {
    expect(placeGuideBubble(composer, bubble, desktop, null)).toEqual(placeGuideBubble(composer, bubble, desktop))
  })

  it('mobile 375×812 : zone à épargner trop haute pour la bulle → repli sur la cible seule, la saisie n’est jamais recouverte', () => {
    const mobile: GuideViewport = { width: 375, height: 812, stickyTopInset: 56, stickyBottomInset: 64 }
    const mobileComposer: GuideRect = { top: 690, left: 16, width: 343, height: 56 }
    // Les amorces occupent tout le haut de l'écran : aucune place au-dessus de l'ensemble.
    const tallStarters: GuideRect = { top: 60, left: 16, width: 343, height: 620 }
    const placement = placeGuideBubble(mobileComposer, bubble, mobile, tallStarters)
    expect(intersects(mobileComposer, placement.top, bubble.height)).toBe(false)
    expect(placement.top).toBeGreaterThanOrEqual(mobile.stickyTopInset)
  })
})

describe('faut-il amener la cible à l’écran (#2212.17 #2212.18)', () => {
  it('non, quand la cible est entièrement visible', () => {
    expect(needsScrollIntoView(centre, desktop)).toBe(false)
  })

  it('oui, quand la cible est passée sous le pli', () => {
    expect(needsScrollIntoView({ top: 1200, left: 600, width: 200, height: 40 }, desktop)).toBe(true)
  })

  it('oui, quand la cible est cachée DERRIÈRE un en-tête collant (#2212.19)', () => {
    const withSticky: GuideViewport = { ...desktop, stickyTopInset: 120 }
    expect(needsScrollIntoView({ top: 40, left: 600, width: 200, height: 40 }, withSticky)).toBe(true)
    expect(needsScrollIntoView({ top: 200, left: 600, width: 200, height: 40 }, withSticky)).toBe(false)
  })

  it('oui, quand la cible est cachée derrière la barre du bas', () => {
    expect(needsScrollIntoView({ top: 740, left: 100, width: 200, height: 40 }, phone)).toBe(true)
  })
})
