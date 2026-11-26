import { describe, expect, it } from 'vitest'
import { needsProductFix, observedVerdict, preflightVerdict, recetteCaseSchema } from './recette.js'

describe('la distinction FAIL / BLOCKED', () => {
  it('une capacité manquante l’emporte sur TOUT, même sur une mauvaise réponse', () => {
    // Juger la réponse d'un outil qui n'a pas pu tourner revient à ouvrir un
    // ticket sur un connecteur absent — c'est là qu'on perd des semaines.
    expect(observedVerdict({ missingCapabilities: ['email'], hasGap: true })).toBe('BLOCKED')
    expect(observedVerdict({ missingCapabilities: ['email'], hasGap: true, partial: true })).toBe('BLOCKED')
  })

  it('bloqué n’exige AUCUNE correction produit', () => {
    expect(needsProductFix('BLOCKED')).toBe(false)
    expect(needsProductFix('FAIL')).toBe(true)
    expect(needsProductFix('PARTIAL')).toBe(true)
    expect(needsProductFix('PASS')).toBe(false)
  })
})

describe('verdict d’un cas observé', () => {
  it('aucun écart = PASS', () => {
    expect(observedVerdict({ missingCapabilities: [], hasGap: false })).toBe('PASS')
  })

  it('un écart constaté n’est JAMAIS un PASS', () => {
    expect(observedVerdict({ missingCapabilities: [], hasGap: true })).toBe('FAIL')
  })

  it('une réponse partielle est PARTIAL, pas FAIL', () => {
    // Les confondre ferait jeter le travail à moitié bon — même règle que le
    // `partial` de l'Action OS et les blocs « non évaluable » du matching.
    expect(observedVerdict({ missingCapabilities: [], hasGap: true, partial: true })).toBe('PARTIAL')
  })
})

describe('verdict connu d’avance', () => {
  it('un cas dont la capacité manque est BLOQUÉ avant d’être joué', () => {
    expect(preflightVerdict(['calendar'])).toBe('BLOCKED')
  })

  it('« à jouer » n’est PAS « ça marche »', () => {
    // Lui prêter un PASS transformerait un jeu de recette en attestation.
    expect(preflightVerdict([])).toBeNull()
  })
})

describe('forme d’un cas', () => {
  it('accepte un cas non joué — c’est l’état de départ', () => {
    const parsed = recetteCaseSchema.parse({
      query: 'Quelles missions finissent dans 30 jours ?',
      verdict: null,
      observedMessage: null,
      observedToolResult: null,
      gap: null,
      expectedFix: null,
      priority: null,
    })
    expect(parsed.evidence).toEqual([])
  })

  it('refuse un verdict inventé', () => {
    expect(
      recetteCaseSchema.safeParse({
        query: 'x',
        verdict: 'PRESQUE',
        observedMessage: null,
        observedToolResult: null,
        gap: null,
        expectedFix: null,
        priority: null,
      }).success,
    ).toBe(false)
  })

  it('refuse une requête vide — un cas sans requête ne se rejoue pas', () => {
    expect(
      recetteCaseSchema.safeParse({
        query: '',
        verdict: null,
        observedMessage: null,
        observedToolResult: null,
        gap: null,
        expectedFix: null,
        priority: null,
      }).success,
    ).toBe(false)
  })
})
