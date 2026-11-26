import { describe, expect, it } from 'vitest'
import { onboardingSectorProposal } from './discover-onboarding-sectors'

// #4973 — Découvrir PROPOSE les secteurs choisis à l'onboarding, jamais ceux d'autrui, jamais posés d'office (#4529).
describe('#4973 — secteurs proposés = secteurs de l’onboarding', () => {
  it('rend les codes des secteurs choisis (prioritaires puis visés), dédoublonnés', () => {
    expect(
      onboardingSectorProposal({
        priority_sectors: ['Ferroviaire'],
        target_sectors: ['Ferroviaire', 'Aéronautique & Défense'],
      }),
    ).toEqual(['rail', 'aerospace', 'defense'])
  })
  it('un espace sans secteur d’onboarding ne se voit rien proposer', () => {
    expect(onboardingSectorProposal(null)).toEqual([])
    expect(onboardingSectorProposal({})).toEqual([])
    expect(onboardingSectorProposal({ target_sectors: [] })).toEqual([])
  })
  it('un secteur exclu (no-go) n’est jamais proposé', () => {
    expect(onboardingSectorProposal({ target_sectors: ['Ferroviaire'], no_go_sectors: ['Ferroviaire'] })).toEqual([])
  })
})
