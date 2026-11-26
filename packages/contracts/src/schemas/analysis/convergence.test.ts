import { describe, expect, it } from 'vitest'
import {
  assertConvergenceCitesFoundingSignals,
  assertExplicitConvergenceTransition,
  convergenceStateSchema,
} from './convergence.js'

// #2952 (#2305.13/.14/.15/.16) — les quatre niveaux intermédiaires de
// LAU-FINAL-046, entre SIGNAL et OPPORTUNITÉ WORKSPACE (qui existe déjà).
describe('convergenceStateSchema (#2305.13/.14/.15/.16)', () => {
  it('accepte les quatre niveaux nommés par LAU-FINAL-046', () => {
    for (const state of ['projet_plausible', 'projet_confirme', 'besoin_detecte', 'besoin_exprime']) {
      expect(() => convergenceStateSchema.parse(state)).not.toThrow()
    }
  })

  it('refuse un cinquième niveau inventé (OPPORTUNITÉ WORKSPACE reste un autre objet)', () => {
    expect(() => convergenceStateSchema.parse('opportunite_workspace')).toThrow()
    expect(() => convergenceStateSchema.parse('en_cours')).toThrow()
  })
})

// #2305.18 — « Aucune transition automatique entre ces niveaux. »
describe('assertExplicitConvergenceTransition (#2305.18)', () => {
  it('refuse une transition sans geste humain explicite', () => {
    expect(() =>
      assertExplicitConvergenceTransition('projet_plausible', 'projet_confirme', { explicit: false }),
    ).toThrow(/transition/i)
  })

  it('accepte une transition portée par un geste humain explicite', () => {
    expect(() =>
      assertExplicitConvergenceTransition('projet_plausible', 'projet_confirme', { explicit: true }),
    ).not.toThrow()
  })

  it('ne bloque jamais un état inchangé, geste ou non', () => {
    expect(() =>
      assertExplicitConvergenceTransition('besoin_detecte', 'besoin_detecte', { explicit: false }),
    ).not.toThrow()
  })
})

// #2305.35 — « Un projet plausible doit citer les signaux qui le fondent. »
describe('assertConvergenceCitesFoundingSignals (#2305.35)', () => {
  it('refuse un projet plausible sans aucun signal fondateur cité', () => {
    expect(() => assertConvergenceCitesFoundingSignals('projet_plausible', [])).toThrow(/fondateur/i)
  })

  it('accepte un projet plausible qui cite au moins un signal', () => {
    expect(() => assertConvergenceCitesFoundingSignals('projet_plausible', ['s1', 's4'])).not.toThrow()
  })

  it("ne s'applique pas aux autres niveaux (pas définis par une convergence de signaux)", () => {
    expect(() => assertConvergenceCitesFoundingSignals('besoin_exprime', [])).not.toThrow()
    expect(() => assertConvergenceCitesFoundingSignals('besoin_detecte', [])).not.toThrow()
    expect(() => assertConvergenceCitesFoundingSignals('projet_confirme', [])).not.toThrow()
  })
})
