import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/discover-hiring-scope.json'
import { hiringScopeVerdict, type HiringScopeProfile } from './discover-hiring-scope.js'

// #3901.p — décision Louis 16/10/2026 : une offre HORS des métiers de l'ESN ne s'affiche pas.
type Fixture = {
  profiles: Record<
    string,
    { placedRoles: string[]; inferred: { role: string; terms: string[] }[]; recruitsForClients?: boolean }
  >
  cases: { profile: string; label: string; keep: boolean; reason?: string }[]
}
const { profiles, cases } = fixture as Fixture

function profileOf(key: string): HiringScopeProfile {
  const p = profiles[key]!
  return { placedRoles: p.placedRoles, inferredPlacedRoles: p.inferred, recruitsForClients: p.recruitsForClients }
}

describe('#3901.p — hiringScopeVerdict (jeu de cas partagé avec le jumeau Python)', () => {
  it.each(cases)('$profile · $label', ({ profile, label, keep, reason }) => {
    const verdict = hiringScopeVerdict(label, profileOf(profile))
    expect(verdict.keep).toBe(keep)
    if (!keep) expect(verdict.keep === false && verdict.reason).toBe(reason)
  })

  it('un poste non placé n’est jamais un signal fort, même sans profil chargé', () => {
    expect(hiringScopeVerdict('CDD Facteur H/F', undefined)).toEqual({ keep: false, reason: 'non_placed' })
  })

  it('profil pas encore chargé : une offre ordinaire reste (on ne devine pas un vide)', () => {
    expect(hiringScopeVerdict('Développeur Java', undefined)).toEqual({ keep: true })
  })

  it('le déclaré gagne sur le déduit', () => {
    const p: HiringScopeProfile = {
      placedRoles: ['HSE'],
      inferredPlacedRoles: [{ role: 'Dev', terms: ['developpeur'] }],
    }
    expect(hiringScopeVerdict('Développeur Java', p).keep).toBe(false)
  })
})
