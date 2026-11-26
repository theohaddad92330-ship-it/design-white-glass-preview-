import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4286.12 / #4182.5 (recette démo 21/10) — « Demandeur probable » ne s'affichait que sur UN sous-signal de SNCF dans
 * Mes cibles. Toute offre de recrutement EN FRANCE (hors stage) porte un demandeur : étayé par le texte de l'offre, ou
 * « à identifier » avec la méthode — jamais un nom inventé, jamais absent.
 */
type Signal = { signal: string; type?: string; location?: string; requester?: Record<string, unknown> }
const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')
const signals = (sncf?.account.recent_signals ?? []) as unknown as Signal[]
const hiring = signals.filter(s => s.type === 'recrutement' || /Offre publiée/i.test(s.signal))
const inFranceNotInternship = hiring.filter(s => !/stage/i.test(s.signal) && !/Canada|étranger/i.test(s.location ?? ''))

describe('SNCF — les offres de recrutement nomment leur demandeur (#4182.5)', () => {
  it('au moins quatre offres portent un demandeur ÉTAYÉ par le texte de l’offre', () => {
    const supported = signals.filter(s => s.requester?.['status'] === 'etaye')
    expect(supported.length).toBeGreaterThanOrEqual(4)
    for (const s of supported) {
      const manager = s.requester?.['possibleManager'] as Record<string, unknown> | null
      expect(manager?.['evidence']).toBe('texte_de_l_offre')
    }
  })

  it('chaque offre en France (hors stage) a un demandeur : étayé ou « à identifier »', () => {
    expect(inFranceNotInternship.length).toBeGreaterThanOrEqual(5)
    for (const s of inFranceNotInternship) {
      expect(['etaye', 'a_identifier']).toContain(s.requester?.['status'])
    }
  })

  it('sait dire NON : l’offre de stage et l’offre hors de France ne portent aucun demandeur', () => {
    const excluded = hiring.filter(s => !inFranceNotInternship.includes(s))
    expect(excluded.length).toBeGreaterThanOrEqual(2)
    for (const s of excluded) expect(s.requester).toBeUndefined()
  })
})
