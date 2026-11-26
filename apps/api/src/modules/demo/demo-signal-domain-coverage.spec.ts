import { SIGNAL_DOMAIN_CODES } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3978 (craft rule n°9) — la salle de démo porte le CLASSEMENT par domaine d'offre qu'une analyse
 * réelle écrit désormais (`domain_code` sur chaque signal / enjeu, lu par `materialize()`).
 *
 * Avant : la démo posait `primary_domain_code` À LA MAIN sur ses pistes, en contournant `materialize()` —
 * « Ce que ça change » se recettait en démo et n'existait sur aucun compte réel. Ici le dossier SNCF
 * porte le même champ que la sortie IA, dans le même vocabulaire fermé.
 */
const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
const classified = [...(sncf?.account.recent_signals ?? []), ...(sncf?.account.it_challenges ?? [])]

describe('démo — les signaux et enjeux SNCF portent leur domaine d’offre (#3978)', () => {
  it('le dossier SNCF existe et porte des signaux ET des enjeux', () => {
    expect(sncf?.account.recent_signals?.length).toBeGreaterThan(0)
    expect(sncf?.account.it_challenges?.length).toBeGreaterThan(0)
  })

  it('chaque code posé est dans le vocabulaire fermé des packs classables — jamais « generic »', () => {
    const codes = classified.map(item => item.domain_code).filter((code): code is string => Boolean(code))
    expect(codes.length).toBeGreaterThanOrEqual(8)
    for (const code of codes) expect(SIGNAL_DOMAIN_CODES as readonly string[]).toContain(code)
  })

  it('plusieurs domaines distincts : lié à une expertise ET hors de l’offre se recettent tous deux', () => {
    const distinct = new Set(classified.map(item => item.domain_code).filter(Boolean))
    expect(distinct.size).toBeGreaterThanOrEqual(3)
    expect(distinct.has('esn_it')).toBe(true)
  })

  it('sait dire NON : la salle garde un signal SANS domaine (le « non classable » reste recettable)', () => {
    expect((sncf?.account.recent_signals ?? []).some(signal => !signal.domain_code)).toBe(true)
  })
})
