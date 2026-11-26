import { describe, expect, it } from 'vitest'
import { NEED_MATCHER_ADVISORY_CRITERIA, needMatcherGate } from './need-matcher-gate.js'

/**
 * #2323.13 / #2323.30 / #2323.47 — la porte MATCHER, en UN seul endroit.
 *
 * Avant ce fichier, trois écrans (`ProjectNeedsPanel`, `NeedDetailPage`,
 * `OpenNeedsTable`) recopiaient chacun `need.skills.length === 0` pour
 * désactiver « Lancer le matching ». Les compétences sont le SEUL critère
 * qui bloque (§ MATCHER de l'issue) — les quatre autres (travail à réaliser,
 * séniorité, localisation/mode, timing) sont des signaux, jamais des portes :
 * doctrine UNKNOWN ≠ ZERO, « une inconnue ne rend jamais automatiquement le
 * besoin mauvais ».
 */
const complete = {
  skills: [{ term: 'React', required: true }],
  seniority: 'senior',
  location: 'Paris',
  remote: null,
  start_on: '2026-10-01',
}

describe('needMatcherGate', () => {
  it('bloque le lancement quand aucune compétence n’est renseignée — même si tout le reste est complet', () => {
    const gate = needMatcherGate({ ...complete, skills: [] })
    expect(gate.canLaunch).toBe(false)
  })

  it('autorise le lancement dès qu’une compétence existe, tout le reste renseigné', () => {
    const gate = needMatcherGate(complete)
    expect(gate.canLaunch).toBe(true)
    expect(gate.missingAdvisory).toEqual([])
  })

  it('une séniorité inconnue ne bloque jamais — elle se signale, elle ne s’oppose pas (UNKNOWN ≠ ZERO)', () => {
    const gate = needMatcherGate({ ...complete, seniority: null })
    expect(gate.canLaunch).toBe(true)
    expect(gate.missingAdvisory).toEqual(['seniority'])
  })

  it('localisation ET télétravail absents comptent comme un seul critère manquant', () => {
    const gate = needMatcherGate({ ...complete, location: null, remote: null })
    expect(gate.canLaunch).toBe(true)
    expect(gate.missingAdvisory).toEqual(['locationOrRemote'])
  })

  it('le télétravail seul suffit à satisfaire le critère localisation/mode', () => {
    const gate = needMatcherGate({ ...complete, location: null, remote: 'full_remote' })
    expect(gate.missingAdvisory).toEqual([])
  })

  it('un timing absent se signale sans bloquer', () => {
    const gate = needMatcherGate({ ...complete, start_on: null })
    expect(gate.canLaunch).toBe(true)
    expect(gate.missingAdvisory).toEqual(['timing'])
  })

  it('cumule les critères manquants, dans l’ordre du catalogue', () => {
    const gate = needMatcherGate({ ...complete, seniority: null, location: null, remote: null, start_on: null })
    expect(gate.missingAdvisory).toEqual([...NEED_MATCHER_ADVISORY_CRITERIA])
  })
})
