import type { AnalysisResearchData } from '@bellum/contracts'
import { withoutHomonymResearchFacts } from './research-homonym-facts'

// LUDOVIC-D LC.2 — la fiche STILL à la collecte : l'homonyme n'entre pas.
describe('LC.2 — withoutHomonymResearchFacts', () => {
  const research = (website: string) =>
    ({
      website,
      recentSignals: [
        { signal: 'Still Waters Farm opens a new barn', url: 'https://stillwatersfarm.com/n', date: '2026-09-01' },
        { signal: 'Stillwater OK vote un budget', url: 'https://www.newson6.com/a', date: '2026-09-02' },
        {
          signal: 'STILL recrute 12 techniciens méthodes à Lyon',
          url: 'https://www.usine-digitale.fr/x',
          date: '2026-10-01',
        },
      ],
      angles: [
        { title: 'Audit logistique chez Still Waters Farm', description: '', strategy: '', entry_contact_persona: '' },
        { title: 'Renfort méthodes sur le site de Lyon', description: '', strategy: '', entry_contact_persona: '' },
      ],
    }) as unknown as AnalysisResearchData

  it('écarte les signaux et angles d’homonymes, garde ceux du compte', () => {
    const { data, dropped } = withoutHomonymResearchFacts(research('https://www.still.fr'))
    expect(dropped).toBe(3)
    expect(data.recentSignals.map(s => (s as unknown as { signal: string }).signal)).toEqual([
      'STILL recrute 12 techniciens méthodes à Lyon',
    ])
    expect(data.angles.map(a => a.title)).toEqual(['Renfort méthodes sur le site de Lyon'])
  })

  it('SAIT DIRE NON : sans site du compte, rien n’est écarté (jamais sur une absence)', () => {
    const input = research('')
    const { data, dropped } = withoutHomonymResearchFacts(input)
    expect(dropped).toBe(0)
    expect(data).toBe(input)
  })
})
