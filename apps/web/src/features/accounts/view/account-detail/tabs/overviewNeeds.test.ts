import { describe, expect, it } from 'vitest'
import { readOverviewNeeds, readOverviewSignals } from './overviewNeeds'

// #3673 (réfuté prod 07/10) — « Enjeux à adresser » / « Expertises concernées » absents sur SG.
describe('readOverviewNeeds — #3673 : lus là où ils vivent, jamais inventés', () => {
  it('une analyse qui porte ses enjeux et son implication ne change pas', () => {
    const result = readOverviewNeeds(
      { it_challenges: [{ title: 'colonne' }] },
      {
        it_challenges: [{ title: 'Migration cloud', description: 'x' }],
        it_implications_for_esn: 'Maintenance applicative',
        opportunity_domains: [{ label: 'Data', constat: 'c' }],
      },
    )
    expect(result.challenges).toEqual([{ title: 'Migration cloud', description: 'x' }])
    expect(result.implications).toBe('Maintenance applicative')
  })

  it('sans enjeu dans le blob, la colonne `it_challenges` du compte est relue', () => {
    const result = readOverviewNeeds({ it_challenges: [{ title: 'Dette applicative', description: 'd' }] }, {})
    expect(result.challenges).toEqual([{ title: 'Dette applicative', description: 'd' }])
  })

  it('un dossier importé : les domaines d’opportunité nomment les enjeux, jamais deux fois', () => {
    // #3676 (réfuté en recette 07/10) — quand les domaines sont la SEULE source, ils
    // nomment déjà chaque enjeu dans `challenges` : `implications` ne répète pas le même
    // fait sous un second titre (GA-26). Une analyse qui porte sa PROPRE implication
    // (`it_implications_for_esn`, testé plus haut) continue de l'afficher normalement.
    const result = readOverviewNeeds(
      { it_challenges: [] },
      {
        opportunity_domains: [
          { label: 'Cybersécurité, IAM, GRC', constat: 'Programme de conformité en cours' },
          { label: 'Data, IA & analytics', implication: 'Besoin de renfort' },
          { label: '   ' },
        ],
      },
    )
    expect(result.challenges).toEqual([
      { title: 'Cybersécurité, IAM, GRC', description: 'Programme de conformité en cours' },
      { title: 'Data, IA & analytics', description: 'Besoin de renfort' },
    ])
    expect(result.implications).toBeNull()
  })

  it('les enjeux viennent du blob, les domaines restent la seule nouveauté pour les expertises', () => {
    // Les enjeux ont une AUTRE source (`it_challenges`) : les domaines n'y sont pas repris,
    // donc leurs libellés restent une information NEUVE pour `implications`.
    const result = readOverviewNeeds(
      { it_challenges: [] },
      {
        it_challenges: [{ title: 'Migration cloud', description: 'x' }],
        opportunity_domains: [{ label: 'Data, IA & analytics' }],
      },
    )
    expect(result.challenges).toEqual([{ title: 'Migration cloud', description: 'x' }])
    expect(result.implications).toBe('Data, IA & analytics')
  })

  it('sait dire NON : rien de stocké nulle part ⇒ rien (aucune ligne, aucune invention)', () => {
    const result = readOverviewNeeds({ it_challenges: [] }, { it_implications_for_esn: '  ' })
    expect(result.challenges).toEqual([])
    expect(result.implications).toBeNull()
  })
})

// #3928.1 — recette R7a (prod 429335a9c8), SNCF RESEAU : « Pourquoi maintenant » disait
// « Aucun signal récent » alors que l'onglet Opportunités comptait 7 signaux. `overview.recent_signals`
// ne lit que `raw_analysis.recent_signals` — SNCF les porte sur la colonne `accounts.recent_signals`,
// jamais relue par cet écran.
describe('readOverviewSignals — #3928.1 : lus sur les deux sources, jamais une seule', () => {
  it('sans signal dans le blob, la colonne `recent_signals` du compte est relue', () => {
    const result = readOverviewSignals(
      { recent_signals: [{ signal: 'Appel d’offres SI voyageurs', source: 'BOAMP' }] },
      {},
    )
    expect(result).toEqual([{ signal: 'Appel d’offres SI voyageurs', source: 'BOAMP' }])
  })

  it('un signal du blob et un signal distinct de la colonne se cumulent', () => {
    const result = readOverviewSignals(
      { recent_signals: [{ signal: 'Recrutement DevOps', source: 'France Travail' }] },
      { recent_signals: [{ signal: 'Levée de fonds', source: 'Presse' }] },
    )
    expect(result.map(s => s.signal)).toEqual(['Levée de fonds', 'Recrutement DevOps'])
  })

  it('le même fait (même libellé, même source) ne s’affiche qu’une fois', () => {
    const result = readOverviewSignals(
      { recent_signals: [{ signal: 'Appel d’offres lot 2', source: 'BOAMP' }] },
      { recent_signals: [{ signal: 'Appel d’offres lot 2', source: 'BOAMP' }] },
    )
    expect(result).toHaveLength(1)
  })

  it('une offre de stage ne devient jamais un signal, même via la colonne', () => {
    const result = readOverviewSignals(
      { recent_signals: [{ signal: 'Stage assistant marketing', type: 'recrutement' }] },
      {},
    )
    expect(result).toEqual([])
  })

  it('sait dire NON : rien de stocké nulle part ⇒ rien', () => {
    expect(readOverviewSignals({ recent_signals: [] }, {})).toEqual([])
  })
})
