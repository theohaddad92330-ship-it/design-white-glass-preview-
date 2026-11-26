import { describe, expect, it } from 'vitest'
import { coverageModeOf, needsPriorityWarning, ESN_ANSWER_OPTIONS } from './onboarding.js'

describe('étendue déclarée (ONB-03)', () => {
  it('lit les trois étendues dans les libellés RÉELS du questionnaire', () => {
    const [niche, multi, generalist] = ESN_ANSWER_OPTIONS.positioning
    expect(coverageModeOf(niche)).toBe('specialist')
    expect(coverageModeOf(multi)).toBe('multi')
    expect(coverageModeOf(generalist)).toBe('generalist')
  })

  it("ne déduit AUCUNE étendue d'un positionnement qui parle du mode d'intervention", () => {
    // « Régie pure » et « Conseil & Delivery » disent COMMENT on intervient, pas
    // sur quelle largeur de catalogue — en tirer une étendue serait inventer.
    for (const label of ESN_ANSWER_OPTIONS.positioning.slice(3)) {
      expect({ label, mode: coverageModeOf(label) }).toEqual({ label, mode: null })
    }
  })

  it('tolère accents, casse et absence', () => {
    expect(coverageModeOf('GÉNÉRALISTE - large spectre')).toBe('generalist')
    expect(coverageModeOf(null)).toBeNull()
    expect(coverageModeOf('   ')).toBeNull()
  })

  it("avertit un généraliste qui n'a déclaré aucune priorité", () => {
    expect(needsPriorityWarning({ positioning: ESN_ANSWER_OPTIONS.positioning[2]!, expertise_areas: [] })).toBe(true)
  })

  it("n'avertit pas un généraliste qui a priorisé", () => {
    expect(
      needsPriorityWarning({
        positioning: ESN_ANSWER_OPTIONS.positioning[2]!,
        expertise_areas: ['Data & Intelligence Artificielle'],
      }),
    ).toBe(false)
  })

  it("n'avertit jamais un spécialiste — la complétion du Temps 1 le bloque déjà", () => {
    expect(needsPriorityWarning({ positioning: ESN_ANSWER_OPTIONS.positioning[0]!, expertise_areas: [] })).toBe(false)
  })
})
