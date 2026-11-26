import { PERCENT_MIN_BASE } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { describeTrend, trendTone } from './trend'

describe('describeTrend — les quatre états', () => {
  it('rend un POURCENTAGE quand les deux termes sont mesurés', () => {
    expect(describeTrend(12, 10)).toEqual({ kind: 'delta', current: 12, percent: 20, direction: 'up' })
    expect(describeTrend(8, 10)).toEqual({ kind: 'delta', current: 8, percent: 20, direction: 'down' })
  })

  it('n’affiche AUCUN pourcentage quand le mois dernier valait zéro', () => {
    // « +100 % » ou « +∞ % » sur une base nulle est un chiffre fabriqué.
    expect(describeTrend(12, 0)).toEqual({ kind: 'noBaseline', current: 12 })
  })

  it('dit « aucun » quand les deux mois valent zéro', () => {
    expect(describeTrend(0, 0)).toEqual({ kind: 'none' })
  })

  it('SANS PHOTO PRÉCÉDENTE, aucun pourcentage — et ce n’est PAS « rien le mois précédent »', () => {
    // La distinction qui porte tout le chantier : « rien le mois précédent »
    // AFFIRME un zéro mesuré ; « pas de photo » dit qu'on n'a pas regardé.
    expect(describeTrend(12, null)).toEqual({ kind: 'noSnapshot' })
    expect(describeTrend(12, undefined)).toEqual({ kind: 'noSnapshot' })
    expect(describeTrend(0, null)).toEqual({ kind: 'noSnapshot' })
  })

  it('ne dit RIEN d’une valeur courante non mesurée', () => {
    // L'écran affiche déjà « non lu » pour la valeur : parler de son évolution
    // serait parler d'un chiffre qu'on n'a pas.
    expect(describeTrend(null, 10)).toBeNull()
    expect(describeTrend(undefined, 10)).toBeNull()
  })

  it('ne se laisse pas nourrir par un NaN ni un infini', () => {
    expect(describeTrend(Number.NaN, 10)).toBeNull()
    expect(describeTrend(10, Number.NaN)).toEqual({ kind: 'noSnapshot' })
    expect(describeTrend(10, Number.POSITIVE_INFINITY)).toEqual({ kind: 'noSnapshot' })
  })

  it('sort la valeur ABSOLUE, le sens voyageant à part', () => {
    // Le signe doit pouvoir s'écrire en TEXTE : une tendance ne se lit jamais
    // par la seule couleur.
    const trend = describeTrend(5, 10)
    expect(trend).toMatchObject({ percent: 50, direction: 'down' })
  })

  it('un chiffre inchangé est une hausse de 0 %, pas une absence', () => {
    expect(describeTrend(10, 10)).toEqual({ kind: 'delta', current: 10, percent: 0, direction: 'up' })
  })
})

describe('describeTrend — #3544.1 un reste n’est jamais −100 %', () => {
  it('6 contre 1 500 le mois dernier se lit −99 %, pas −100 %', () => {
    expect(describeTrend(6, 1500)).toEqual({ kind: 'delta', current: 6, percent: 99, direction: 'down' })
  })
  it('−100 % reste vrai quand le mois en cours vaut vraiment zéro', () => {
    expect(describeTrend(0, 40)).toEqual({ kind: 'delta', current: 0, percent: 100, direction: 'down' })
  })
})

describe('trendTone — monter n’est pas toujours une bonne nouvelle', () => {
  it('lit la hausse d’un vivier comme un progrès', () => {
    expect(trendTone('up', 'moreIsBetter')).toBe('good')
    expect(trendTone('down', 'moreIsBetter')).toBe('bad')
  })

  it('lit la hausse d’une liste de travail comme un recul', () => {
    // « Contacts sans adresse : +40 % » n'est pas une bonne nouvelle, et le
    // même vert que « Vivier disponible : +40 % » le ferait lire comme telle.
    expect(trendTone('up', 'lessIsBetter')).toBe('bad')
    expect(trendTone('down', 'lessIsBetter')).toBe('good')
  })

  it('ne colore pas ce dont on ne sait pas dire si monter est bon', () => {
    expect(trendTone('up', 'neutral')).toBe('neutral')
    expect(trendTone('down', 'neutral')).toBe('neutral')
  })
})

describe('describeTrend — base < 10 : delta absolu, jamais un pourcentage (recette 14/10)', () => {
  it('8 → 217 se dit +209, pas +2612 %', () => {
    expect(describeTrend(217, 8)).toEqual({ kind: 'absolute', current: 217, change: 209, direction: 'up' })
  })

  it('une baisse sur petite base reste un delta absolu', () => {
    expect(describeTrend(1, 4)).toEqual({ kind: 'absolute', current: 1, change: 3, direction: 'down' })
  })
})

describe('describeTrend — keepPercentUnderSmallBase (/team garde son affichage, 14/10)', () => {
  it('par défaut, la règle base 10 est inchangée', () => {
    expect(describeTrend(6, 4)).toEqual({ kind: 'absolute', current: 6, change: 2, direction: 'up' })
    expect(describeTrend(6, 4, false)).toEqual({ kind: 'absolute', current: 6, change: 2, direction: 'up' })
  })

  it('avec l’option, le pourcentage s’affiche sous 10', () => {
    expect(describeTrend(6, 4, true)).toEqual({ kind: 'delta', current: 6, percent: 50, direction: 'up' })
    expect(describeTrend(1, 4, true)).toEqual({ kind: 'delta', current: 1, percent: 75, direction: 'down' })
  })

  it('une base nulle reste « rien le mois précédent », option ou non', () => {
    expect(describeTrend(6, 0, true)).toEqual({ kind: 'noBaseline', current: 6 })
  })
})

describe('#4191 G3 — l’écart absolu signé sous une base < 10', () => {
  it('base 0 : « rien le mois précédent », aucun pourcentage', () => {
    expect(describeTrend(281, 0)).toEqual({ kind: 'noBaseline', current: 281 })
  })

  it('base 3 : l’écart absolu, jamais +2812 %', () => {
    expect(describeTrend(87, 3)).toEqual({ kind: 'absolute', current: 87, change: 84, direction: 'up' })
    expect(describeTrend(1, 3)).toEqual({ kind: 'absolute', current: 1, change: 2, direction: 'down' })
  })

  it('base 50 : le pourcentage existe', () => {
    expect(describeTrend(75, 50)).toEqual({ kind: 'delta', current: 75, percent: 50, direction: 'up' })
  })

  it('le seuil est celui du contrat (UN endroit) : 9 → absolu, 10 → pourcentage', () => {
    expect(PERCENT_MIN_BASE).toBe(10)
    expect(describeTrend(20, PERCENT_MIN_BASE - 1)?.kind).toBe('absolute')
    expect(describeTrend(20, PERCENT_MIN_BASE)?.kind).toBe('delta')
  })
})

// R21-FIX point 4a (15/10) : « +2612 % » sur « contacts sans adresse » (52 → 1 410). Un STOCK compté se
// lit en écart absolu, quelle que soit la base — jamais un pourcentage.
describe('R21 — un stock compté s’affiche en écart absolu', () => {
  it('52 → 1410 : « +1358 », jamais +2612 %', () => {
    expect(describeTrend(1410, 52, false, true)).toEqual({
      kind: 'absolute',
      current: 1410,
      change: 1358,
      direction: 'up',
    })
  })

  it('une baisse reste signée, une base nulle reste « rien le mois précédent »', () => {
    expect(describeTrend(40, 400, false, true)).toMatchObject({ kind: 'absolute', change: 360, direction: 'down' })
    expect(describeTrend(6, 0, false, true)).toEqual({ kind: 'noBaseline', current: 6 })
  })

  it('sans l’option, le pourcentage existe toujours (base ≥ 10)', () => {
    expect(describeTrend(1410, 52)?.kind).toBe('delta')
  })
})
