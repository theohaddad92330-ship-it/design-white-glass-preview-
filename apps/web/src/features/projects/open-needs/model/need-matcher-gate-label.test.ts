import { describe, expect, it, vi } from 'vitest'
import { needMatcherLaunchTooltip } from './need-matcher-gate-label'

/**
 * #2323.30 — le tooltip du bouton « Lancer le matching », calculé UNE fois
 * pour les trois écrans qui le montrent (`ProjectNeedsPanel`, `NeedDetailPage`,
 * `OpenNeedsTable`). Sans compétence, le message reste `launch.noSkills`
 * (#2323.47, inchangé) ; avec compétences mais des signaux manquants
 * (#2323.14-.17), le tooltip les NOMME au lieu de rester muet — c'est la
 * différence entre « une inconnue produit une question » et une inconnue qui
 * ne produit rien (#2323.29-.31, UNKNOWN ≠ ZERO).
 */
const complete = {
  skills: [{ term: 'React', required: true }],
  seniority: 'senior',
  location: 'Paris',
  remote: null,
  start_on: '2026-10-01',
}

function fakeT(key: string, options?: Record<string, unknown>): string {
  return options ? `${key}:${JSON.stringify(options)}` : key
}

describe('needMatcherLaunchTooltip', () => {
  it('rend launch.noSkills quand aucune compétence n’est renseignée', () => {
    expect(needMatcherLaunchTooltip({ ...complete, skills: [] }, fakeT)).toBe('launch.noSkills')
  })

  it('rend launch.ready quand tout est renseigné', () => {
    expect(needMatcherLaunchTooltip(complete, fakeT)).toBe('launch.ready')
  })

  it('nomme les signaux manquants au lieu de rester muet', () => {
    const t = vi.fn(fakeT)
    const tooltip = needMatcherLaunchTooltip({ ...complete, seniority: null, start_on: null }, t)
    expect(tooltip).toContain('launch.readyWithGaps')
    expect(t).toHaveBeenCalledWith('launch.gate.seniority')
    expect(t).toHaveBeenCalledWith('launch.gate.timing')
    expect(t).not.toHaveBeenCalledWith('launch.gate.locationOrRemote')
  })
})
