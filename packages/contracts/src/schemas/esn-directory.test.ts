import { describe, expect, it } from 'vitest'
import { COMMUNITY_THRESHOLD } from './community-facts.js'
import {
  ESN_SUBCONTRACTING_OPENNESS,
  esnRisk,
  hierarchyFromName,
  subcontractingAggregate,
  summarizeRank2Observations,
} from './esn-directory.js'

const SII = ['SII', 'SII Est', 'SII Nord', 'SII Sud-Ouest', 'SII Atlantique', 'SII Group (International)']

describe('la hiérarchie déduite du nom (tome 4, étage 2)', () => {
  it('range les six lignes SII en un groupe, quatre agences et un international', () => {
    // ⚠️ Le tome annonce SEPT lignes SII. Le fichier livré en porte six. Le
    // test de référence porte sur ce qui existe, pas sur le chiffre du tome.
    const guesses = SII.map(name => [name, hierarchyFromName(name, SII)] as const)
    const root = guesses.filter(([, g]) => g === null).map(([n]) => n)
    const agencies = guesses.filter(([, g]) => g?.relation === 'agence').map(([n]) => n)
    const international = guesses.filter(([, g]) => g?.relation === 'international').map(([n]) => n)

    expect(root).toEqual(['SII'])
    expect(agencies).toEqual(['SII Est', 'SII Nord', 'SII Sud-Ouest', 'SII Atlantique'])
    expect(international).toEqual(['SII Group (International)'])
  })

  it('ne confirme JAMAIS un rattachement tiré du seul nom', () => {
    const guess = hierarchyFromName('SII Est', SII)
    expect(guess?.confidence).toBe('inferred')
    // La preuve est en français et cite la règle : un code interne ne se relit pas.
    expect(guess?.evidence).toContain('SII')
  })

  it('ne rattache qu’à un nom présent dans la liste', () => {
    // « Karytis Sud » sans « Karytis » n'est pas une agence : c'est une société
    // dont on ne sait rien. Rattacher à un parent absent inventerait un groupe.
    expect(hierarchyFromName('Karytis Sud', SII)).toBeNull()
  })

  it('distingue une marque du groupe d’une agence régionale', () => {
    const names = ['Accenture', 'Accenture Song', 'Inetum', 'Inetum Software']
    // Le piège nommé par le tome : ce ne sont pas des agences.
    expect(hierarchyFromName('Accenture Song', names)?.relation).toBe('marque')
    expect(hierarchyFromName('Inetum Software', names)?.relation).toBe('marque')
  })

  it('lit « France » comme une filiale nationale, pas comme une région', () => {
    expect(hierarchyFromName('Acme France', ['Acme', 'Acme France'])?.relation).toBe('filiale')
  })

  it('ne rattache pas « Groupe X » à « X »', () => {
    // Le groupe est le porteur, pas l'enfant. L'inverser mettrait la maison
    // mère sous sa propre marque.
    expect(hierarchyFromName('Groupe Karytis', ['Karytis', 'Groupe Karytis'])).toBeNull()
  })

  it('ignore les accents et la casse du fichier d’origine', () => {
    expect(hierarchyFromName('SOPRA MÉDITERRANEE', ['Sopra', 'SOPRA MÉDITERRANEE'])?.relation).toBe('agence')
  })
})

describe('l’ouverture à la sous-traitance', () => {
  it('a trois valeurs et « inconnu » en fait partie', () => {
    // « Un non se déclare, il ne se déduit pas » : sans la troisième valeur, une
    // absence de réponse deviendrait un refus.
    expect(ESN_SUBCONTRACTING_OPENNESS).toEqual(['oui', 'non', 'inconnu'])
  })
})

describe('l’agrégat CANONIQUE de sous-traitance (N16, D589-D591)', () => {
  it('ne promeut RIEN sous le seuil communautaire', () => {
    const two = [
      { workspaceId: 'w1', value: 'oui' as const, confidence: 'probable' as const },
      { workspaceId: 'w2', value: 'oui' as const, confidence: 'probable' as const },
    ]
    expect(two.length).toBeLessThan(COMMUNITY_THRESHOLD)
    expect(subcontractingAggregate(two)).toBeNull()
  })

  it('promeut au SEUIL, avec la confiance la plus FAIBLE des trois', () => {
    const three = [
      { workspaceId: 'w1', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w2', value: 'oui' as const, confidence: 'probable' as const },
      { workspaceId: 'w3', value: 'oui' as const, confidence: 'suppose' as const },
    ]
    expect(subcontractingAggregate(three)).toEqual({ value: 'oui', confidence: 'suppose', sourcesCount: 3 })
  })

  it('ne tranche JAMAIS une divergence — deux valeurs présentes refusent de promouvoir', () => {
    const conflicting = [
      { workspaceId: 'w1', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w2', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w3', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w4', value: 'non' as const, confidence: 'certain' as const },
    ]
    expect(subcontractingAggregate(conflicting)).toBeNull()
  })

  it('compte des ESPACES distincts, pas des lignes — un espace qui se répète reste une voix', () => {
    const repeated = [
      { workspaceId: 'w1', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w1', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w1', value: 'oui' as const, confidence: 'certain' as const },
    ]
    expect(subcontractingAggregate(repeated)).toBeNull()
  })

  it('sait dire NON — un quatrième espace confirmant ne change pas un conflit en consensus', () => {
    const stillConflicting = [
      { workspaceId: 'w1', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w2', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w3', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w4', value: 'oui' as const, confidence: 'certain' as const },
      { workspaceId: 'w5', value: 'non' as const, confidence: 'certain' as const },
    ]
    expect(subcontractingAggregate(stillConflicting)).toBeNull()
  })
})

describe('rang 2 : des FAITS observés, jamais un potentiel (#2298.8, décision Louis 18/09)', () => {
  it('dit "non mesuré" sur une liste vide — jamais un compte à zéro', () => {
    expect(summarizeRank2Observations([])).toEqual({ measured: false })
  })

  it('compte les observations, nomme leurs natures, et garde la plus RÉCENTE', () => {
    const observations = [
      { kind: 'already_subcontracted' as const, observedAt: '2026-03-01', source: 'AO Latecoere, lot 3' },
      { kind: 'posts_subcontracting_offers' as const, observedAt: '2026-09-10', source: 'offre LinkedIn #48213' },
      { kind: 'already_subcontracted' as const, observedAt: '2025-11-20', source: 'témoignage commercial' },
    ]
    expect(summarizeRank2Observations(observations)).toEqual({
      measured: true,
      count: 3,
      mostRecentAt: '2026-09-10',
      kinds: ['already_subcontracted', 'posts_subcontracting_offers'],
    })
  })

  it('ne fabrique jamais une moyenne ni un score : une seule observation reste un COMPTE de 1', () => {
    const single = [{ kind: 'already_subcontracted' as const, observedAt: '2026-01-15', source: 'brief client' }]
    const result = summarizeRank2Observations(single)
    expect(result).toEqual({
      measured: true,
      count: 1,
      mostRecentAt: '2026-01-15',
      kinds: ['already_subcontracted'],
    })
    // Aucune clé `score`, `probability`, `potential` ou similaire — le type
    // TypeScript l'interdit déjà, ce test garde l'objet honnête à l'exécution.
    expect(Object.keys(result)).toEqual(['measured', 'count', 'mostRecentAt', 'kinds'])
  })
})

describe('le drapeau de risque (§9.3, le signal négatif)', () => {
  it('met en ALERTE une procédure collective, avec sa date', () => {
    const risk = esnRisk({ collectiveProceeding: { date: '2026-05-12', label: 'Redressement judiciaire' } })
    expect(risk.flag).toBe('alerte')
    expect(risk.evidence).toContain('2026-05-12')
  })

  it('signale quand même une procédure SANS date', () => {
    const risk = esnRisk({ collectiveProceeding: { date: null, label: 'Procédure collective' } })
    expect(risk.flag).toBe('alerte')
    expect(risk.evidence).toContain('date inconnue')
  })

  it('ne met qu’en VIGILANCE une baisse d’effectif', () => {
    const risk = esnRisk({ headcountDropped: true })
    expect(risk.flag).toBe('vigilance')
    expect(risk.evidence).toContain('effectif en baisse')
  })

  it('ne fabrique aucun risque quand rien ne s’est passé', () => {
    expect(esnRisk({})).toEqual({ flag: 'aucun', evidence: null })
  })
})
