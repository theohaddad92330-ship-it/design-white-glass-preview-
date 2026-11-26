import { MOTION } from '@bellum/ui'
import { describe, expect, it } from 'vitest'
import { CHAT_SURFACE, chatMotion, staggered } from './chat-surface'

/** Ce qui fait qu'une peau se reconnaît : son fond, son trait, son relief. */
function skin(classes: string) {
  const tokens = classes.split(/\s+/)
  const bg = tokens.find(token => /^bg-\[var\(--[\w-]+\)\]$/.test(token))?.slice(8, -2) ?? null
  const hasBorder = tokens.includes('border')
  const borderColor = tokens.find(token => /^border-\[var\(--[\w-]+\)\]$/.test(token))?.slice(12, -2) ?? null
  const relief = tokens.find(token => /^shadow-[\w-]+$/.test(token)) ?? null
  return { bg, border: hasBorder ? borderColor : null, relief }
}

describe('#1907.13 — question, réponse, preuve, action : quatre peaux distinctes', () => {
  it('aucune des quatre ne ressemble à une autre', () => {
    const skins = (['question', 'reply', 'proof', 'action'] as const).map(kind =>
      JSON.stringify(skin(CHAT_SURFACE[kind])),
    )
    expect(new Set(skins).size).toBe(4)
  })

  it('ta question : le violet plein, et le texte calibré POUR lui (6,37:1 dans les deux thèmes)', () => {
    expect(CHAT_SURFACE.question).toContain('bg-[var(--bellum-primary-500)]')
    expect(CHAT_SURFACE.question).toContain('text-[var(--bellum-on-primary)]')
    expect(CHAT_SURFACE.question).not.toContain('text-white')
  })

  it('la réponse : une bulle posée sur la page — trait neutre, relief doux', () => {
    expect(skin(CHAT_SURFACE.reply)).toEqual({
      bg: '--bellum-surface-1',
      border: '--bellum-border',
      relief: 'shadow-sm',
    })
  })

  it('la preuve : EN RETRAIT — le creux, sans trait ni relief', () => {
    expect(skin(CHAT_SURFACE.proof)).toEqual({ bg: '--bellum-surface-2', border: null, relief: null })
  })

  it('l’action : un liseré violet et un relief doux — c’est ce qui se clique', () => {
    expect(skin(CHAT_SURFACE.action)).toEqual({
      bg: '--bellum-surface-1',
      border: '--accent-soft-border',
      relief: 'shadow-sm',
    })
  })
})

describe('#1906.9 / #1907.10 — la saisie flotte, elle n’est plus un formulaire dans une bande', () => {
  it('la boîte de saisie porte le relief doux', () => {
    expect(skin(CHAT_SURFACE.composer)).toEqual({
      bg: '--bellum-surface-1',
      border: '--bellum-border',
      relief: 'shadow-sm',
    })
  })

  it('la bande qui l’entoure n’a plus ni trait ni fond : un seul cadre, pas deux', () => {
    const band = skin(CHAT_SURFACE.composerBand)
    expect(band).toEqual({ bg: null, border: null, relief: null })
    expect(CHAT_SURFACE.composerBand).not.toMatch(/border-t|bg-/)
  })

  /**
   * #3351.3 — le filet entre la saisie et la rangée d'outils : un trait 1px,
   * la même couleur que le reste de la surface, jamais un second fond ni un
   * relief (ce n'est pas un second cadre — GA-328/`thickBorders`).
   */
  it('le filet outils/saisie est un trait 1px, sans fond ni relief', () => {
    expect(CHAT_SURFACE.composerToolbarDivider).toBe('border-t border-[var(--bellum-border)]')
    expect(CHAT_SURFACE.composerToolbarDivider).not.toMatch(/bg-|shadow-|border-2|border-t-2/)
  })
})

describe('#3847.1 — la colonne de l’accueil et du fil est pleine largeur', () => {
  it('ne porte plus aucune borne de largeur de bloc (renverse #2001 et D81 pour /chat, décision Louis 08/10/2026)', () => {
    // #3847 — /chat passe en pleine largeur : le fil, le composeur et les cartes
    // occupent toute la largeur disponible à droite de la barre latérale, plus de
    // bande vide. L'ancre `mr-auto` et la borne `max-w-3xl` posées par #2001 (lot
    // chat 1, 14/09/2026) disparaissent toutes les deux — il n'y a plus d'ancre à
    // discuter puisqu'il n'y a plus rien à ancrer dans une zone plus large que soi.
    expect(CHAT_SURFACE.column).not.toContain('mx-auto')
    expect(CHAT_SURFACE.column).not.toContain('mr-auto')
    expect(CHAT_SURFACE.column).not.toMatch(/max-w-/)
    expect(CHAT_SURFACE.column).toContain('w-full')
  })

  it('sait dire NON : une colonne qui réintroduit un `max-w-` est refusée', () => {
    expect('mr-auto w-full max-w-3xl').toMatch(/max-w-/)
  })

  /* décision Louis 13/09 batch 13 — plat */
  it('aucune peau ne porte de dégradé : le primaire reste plat', () => {
    const withGradient = Object.entries(CHAT_SURFACE)
      .filter(([, classes]) => /gradient/.test(classes))
      .map(([name]) => name)
    expect(withGradient).toEqual([])
    expect(Object.keys(CHAT_SURFACE)).not.toContain('homeWash')
  })
})

describe('#1907.11 — chatMotion : la grammaire, et sa version pour qui demande moins de mouvement', () => {
  it('rend le mouvement de `MOTION` tel quel', () => {
    expect(chatMotion('enterFromBelow', false)).toBe(MOTION.enterFromBelow)
    expect(chatMotion('reveal', null)).toBe(MOTION.reveal)
  })

  it('retire le déplacement quand le système demande moins de mouvement, sans supprimer la transition', () => {
    const reduced = chatMotion('enterFromBelow', true)
    expect(reduced.initial).toEqual({ opacity: 0 })
    expect(reduced.transition).toBeDefined()
  })

  it('« ça travaille » reste une boucle, même réduite', () => {
    expect(chatMotion('breathe', true).transition?.['repeat']).toBe(Infinity)
  })

  it('décale les points d’attente par la cascade du produit', () => {
    const second = staggered(chatMotion('breathe', false), 1)
    expect(second.transition?.['delay']).toBeCloseTo(0.04)
    expect(second.animate).toEqual(MOTION.breathe.animate)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LOT 1 `/chat` — les réglages qui vivaient à plusieurs endroits
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qui fait d'une borne une largeur de LECTURE au sens de D81. */
function readingOffences(reading: string): string[] {
  const offences: string[] = []
  const measure = /max-w-\[min\((\d+)(ch|px|rem)/.exec(reading)
  if (!measure) offences.push('la borne de lecture n’est pas une borne bornée')
  else {
    if (measure[2] !== 'ch') offences.push(`la borne est écrite en ${measure[2]} : elle ignore le réglage « Grand »`)
    else if (Number(measure[1]) > 70) offences.push(`${measure[1]}ch dépasse les 70 caractères de D81`)
  }
  return offences
}

describe('D81 / GA-34 / GA-26 — la largeur de LECTURE : une mesure, en `ch`, à un seul endroit', () => {
  it('la borne des bulles est exprimée en caractères et ne dépasse pas 70', () => {
    expect(readingOffences(CHAT_SURFACE.reading)).toEqual([])
  })

  it('sait dire NON : la borne d’avant — 680 px, ≈ 93-97 caractères — est refusée deux fois', () => {
    expect(readingOffences('max-w-[min(680px,92%)]')).toEqual([
      'la borne est écrite en px : elle ignore le réglage « Grand »',
    ])
    expect(readingOffences('max-w-[min(90ch,92%)]')).toEqual(['90ch dépasse les 70 caractères de D81'])
    expect(readingOffences('w-full')).toHaveLength(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas : la colonne du fil n’est pas une borne de lecture', () => {
    // `column` ne borne plus RIEN depuis #3847 (pleine largeur), `reading` borne
    // le TEXTE dans la bulle — et lui seul reste tenu par D81/GA-34. Deux objets,
    // deux mesures : la pleine largeur du premier ne desserre pas le second.
    expect(CHAT_SURFACE.column).not.toContain('ch,')
    expect(readingOffences(CHAT_SURFACE.reading)).toEqual([])
  })
})

describe('GA-26 — l’anneau de focus est un réglage, donc il vit à UN endroit', () => {
  it('les deux formes portent la MÊME couleur, et c’est celle qui tient les deux thèmes', () => {
    // `--bellum-text-accent` est la seule teinte d'accent définie des deux côtés
    // (`tokens.css` : #5b3ee8 en clair, #9e87ff en sombre). Une nuance FIXE de la
    // gamme primaire n'y arrive pas : `primary-500` tombe à 2,68:1 en sombre,
    // sous le 3:1 que WCAG 1.4.11 demande à un indicateur non textuel.
    expect(CHAT_SURFACE.focusRing).toContain('ring-[var(--bellum-text-accent)]')
    expect(CHAT_SURFACE.focusWithinRing).toContain('var(--bellum-text-accent)')
    expect(CHAT_SURFACE.focusRing).not.toContain('primary-500')
    expect(CHAT_SURFACE.focusWithinRing).not.toContain('primary-500')
  })

  it('l’anneau ne se voit qu’au clavier, et le contour natif ne double jamais le nôtre', () => {
    expect(CHAT_SURFACE.focusRing).toContain('focus-visible:ring-2')
    expect(CHAT_SURFACE.focusRing).toContain('outline-none')
  })
})

describe('GA-26 — la gouttière du bouton de signalement est NOMMÉE, pas recopiée', () => {
  it('elle est vide : le bouton ne se pose plus jamais à gauche de la saisie (#3050)', () => {
    // `FeedbackWidget.tsx` s'ancre à DROITE à toutes les largeurs depuis #2117.84,
    // et se tait carrément sur /chat mobile depuis #3050 — la saisie n'a plus
    // jamais à lui laisser un vide À GAUCHE. Le jeton reste nommé (GA-26) pour
    // que la prochaine réservation, s'il y en a une, se lise ICI.
    expect(CHAT_SURFACE.composerFeedbackGutter).toBe('')
  })
})
