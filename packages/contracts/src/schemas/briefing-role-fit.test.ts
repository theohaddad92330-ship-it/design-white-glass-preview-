import { describe, expect, it } from 'vitest'
import { applyRoleFitFeedback, briefingRoleFitFeedbackRequestSchema, isRoleFitEngaged } from './briefing-role-fit.js'

/**
 * #2397.7 — le retour utilisateur AJUSTE le classement du brief, comme un axe
 * de plus (`roleFit`, #2095.61-.67), jamais comme un score inventé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SEUL GESTE, ET POSITIF SEULEMENT
 * ─────────────────────────────────────────────────────────────────────────
 * L'axe `roleFit` ne peut QUE s'ajouter au poids d'une carte (jamais le
 * retirer — `rankingWeight`, briefing-actions.ts). Inventer une pénalité pour
 * un genre de carte que la personne écarte inverserait « non mesuré n'est
 * jamais 0 » : une carte jamais notée et une carte activement écartée se
 * retrouveraient à distinguer alors que ni l'une ni l'autre n'a de raison
 * d'être moins bien classée que son défaut. Le seul geste qui reste sûr est
 * « ceci correspond à mon rôle » — déterministe, jamais une pénalité devinée.
 */
describe('#2397.7 — le retour utilisateur ajuste un axe, déterministe', () => {
  it('le contrat de la requête ne porte que le genre et un booléen', () => {
    const parsed = briefingRoleFitFeedbackRequestSchema.parse({ kind: 'follow_up', engaged: true })
    expect(parsed).toEqual({ kind: 'follow_up', engaged: true })
  })

  it('refuse un genre hors de BRIEFING_ACTION_KINDS', () => {
    expect(() => briefingRoleFitFeedbackRequestSchema.parse({ kind: 'invente', engaged: true })).toThrow()
  })

  it('engaged=true ajoute le genre au sac, sans toucher aux autres', () => {
    const before = { account: true }
    const after = applyRoleFitFeedback(before, 'follow_up', true)
    expect(after).toEqual({ account: true, follow_up: true })
    // Immuable : le sac d'avant n'a pas bougé.
    expect(before).toEqual({ account: true })
  })

  it('engaged=false RETIRE le genre — jamais un `false` stocké : l’absence est déjà le défaut neutre', () => {
    const before = { account: true, follow_up: true }
    const after = applyRoleFitFeedback(before, 'follow_up', false)
    expect(after).toEqual({ account: true })
    expect(Object.keys(after)).not.toContain('follow_up')
  })

  it('isRoleFitEngaged lit le sac de préférences de façon défensive', () => {
    expect(isRoleFitEngaged({ briefingRoleFit: { account: true } }, 'account')).toBe(true)
    expect(isRoleFitEngaged({ briefingRoleFit: { account: true } }, 'follow_up')).toBe(false)
  })

  it('isRoleFitEngaged ne casse jamais sur une forme inattendue — non mesuré, jamais une exception', () => {
    expect(isRoleFitEngaged(null, 'account')).toBe(false)
    expect(isRoleFitEngaged(undefined, 'account')).toBe(false)
    expect(isRoleFitEngaged({}, 'account')).toBe(false)
    expect(isRoleFitEngaged({ briefingRoleFit: 'pas un objet' }, 'account')).toBe(false)
    expect(isRoleFitEngaged({ briefingRoleFit: { account: 'oui' } }, 'account')).toBe(false)
  })
})
