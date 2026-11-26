import { describe, expect, it } from 'vitest'
import { mentionsExEsnProfiles, mergePresentEsn, probableSameEsn } from './presentEsn'

/**
 * K.2 / #4323 (Louis 19/10/2026, call refonte UX) — UNE SEULE liste des ESN présentes sur le compte.
 * « Deux ESN confirmées » en haut, dix « ex-ESN » plus bas, un texte qui en cite davantage : trois
 * lectures du même fait. Fusionnées par nom, chacune avec son niveau de preuve en mots et sa date.
 */
const BRIEF_DATE = '2026-10-01T08:00:00.000Z'

describe('mergePresentEsn (#4323)', () => {
  it('fusionne le brief, l’ESN en place et les parcours observés en UNE ligne par société', () => {
    const rows = mergePresentEsn({
      brief: [
        { name: 'Sopra Steria', evidence_level: 'confirmed', proof: 'Contrat cadre 2024', perimeter: 'Infogérance' },
      ],
      briefDate: BRIEF_DATE,
      incumbents: [
        { name: 'sopra  steria', contractType: 'framework', strengths: 'Ancrage local', weaknesses: null },
        { name: 'Capgemini', contractType: null, strengths: null, weaknesses: 'Turnover' },
      ],
      incumbentSource: { source: 'public_sources', observedAt: '2026-09-15T00:00:00.000Z' },
      observed: [
        { esnName: 'SOPRA STERIA', persons: 7, certainty: 'forte' },
        { esnName: 'Alten', persons: 3, certainty: 'forte' },
      ],
    })

    expect(rows.map(row => row.name)).toEqual(['Sopra Steria', 'Alten', 'Capgemini'])
    const sopra = rows[0]!
    // La preuve la plus forte gagne, la date la plus récente aussi, les détails se cumulent.
    expect(sopra.evidence).toBe('declared')
    expect(sopra.date).toBe(BRIEF_DATE)
    expect(sopra.proof).toBe('Contrat cadre 2024')
    expect(sopra.strengths).toBe('Ancrage local')
    expect(sopra.paths).not.toBeNull()
  })

  it('traduit le niveau de preuve en trois mots : déclaré, observé, déduit', () => {
    const rows = mergePresentEsn({
      brief: [
        { name: 'A', evidence_level: 'confirmed', proof: 'p' },
        { name: 'B', evidence_level: 'observed', proof: 'p' },
        { name: 'C', evidence_level: 'hint', proof: 'p' },
      ],
      briefDate: BRIEF_DATE,
      incumbents: null,
      incumbentSource: null,
      observed: undefined,
    })
    expect(Object.fromEntries(rows.map(row => [row.name, row.evidence]))).toEqual({
      A: 'declared',
      B: 'observed',
      C: 'deduced',
    })
  })

  it('sait dire NON : une société sans date reste sans date (jamais une date inventée), et deux noms différents ne fusionnent pas', () => {
    const rows = mergePresentEsn({
      brief: [],
      briefDate: null,
      incumbents: null,
      incumbentSource: null,
      observed: [
        { esnName: 'Groupe SII', persons: 4, certainty: 'forte' },
        { esnName: 'SII', persons: 2, certainty: 'forte' },
      ],
    })
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.date === null && row.evidence === 'observed')).toBe(true)
  })

  it('une absence ne fait aucune ligne : aucune source, aucune ESN', () => {
    expect(
      mergePresentEsn({ brief: [], briefDate: null, incumbents: null, incumbentSource: null, observed: undefined }),
    ).toEqual([])
  })
})

describe('RV4-E-FIX 4295.21 — un prior n’est pas une observation', () => {
  const merge = (source: 'dataforge' | 'market_memory' | 'public_sources') =>
    mergePresentEsn({
      brief: [],
      briefDate: null,
      incumbents: [{ name: 'Capgemini', contractType: null, strengths: null, weaknesses: null }],
      incumbentSource: { source, observedAt: '2026-09-15T00:00:00.000Z' },
      observed: undefined,
    })[0]!

  it.each(['dataforge', 'market_memory'] as const)('une ESN tirée de %s est DÉDUITE, avec sa base nommée', source => {
    const row = merge(source)
    expect(row.evidence).toBe('deduced')
    expect(row.estimateSource).toBe(source)
  })

  it('sait dire NON : une ESN lue dans une source publique reste observée, sans base d’estimation', () => {
    const row = merge('public_sources')
    expect(row.evidence).toBe('observed')
    expect(row.estimateSource).toBeNull()
  })
})

describe('probableSameEsn (#4323) — on PROPOSE la fusion, on ne la fait pas', () => {
  const observed = (names: string[]) =>
    mergePresentEsn({
      brief: [],
      briefDate: null,
      incumbents: null,
      incumbentSource: null,
      observed: names.map(esnName => ({ esnName, persons: 2, certainty: 'forte' as const })),
    })

  it('propose « Groupe SII » et « SII » comme probablement la même société, sans les fusionner', () => {
    const rows = observed(['Groupe SII', 'SII'])
    expect(rows).toHaveLength(2)
    expect(probableSameEsn(rows)).toEqual({ 'Groupe SII': ['SII'], SII: ['Groupe SII'] })
  })

  it('sait dire NON : deux sociétés qui partagent seulement un mot ne sont pas proposées', () => {
    expect(probableSameEsn(observed(['Capgemini', 'Sopra Steria', 'Alten Groupe', 'Alten']))).toEqual({
      'Alten Groupe': ['Alten'],
      Alten: ['Alten Groupe'],
    })
    expect(probableSameEsn(observed(['Groupe Open', 'Groupe SII']))).toEqual({})
  })
})

describe('mentionsExEsnProfiles (#4323.4)', () => {
  const row = (known: string) => ({ rubric: 'ACHATS', known, meaning: '' })
  it('reconnaît « profils ex-ESN » dans une rubrique, accents et tiret compris', () => {
    expect(mentionsExEsnProfiles([row('10 profils ex-ESN identifiés')])).toBe(true)
    expect(mentionsExEsnProfiles([row('dont 4 ex ESN')])).toBe(true)
  })
  it('ne se déclenche pas sur une rubrique qui ne cite pas d’ex-ESN', () => {
    expect(mentionsExEsnProfiles([row('17 ESN présentes'), row('Resnick')])).toBe(false)
    expect(mentionsExEsnProfiles([])).toBe(false)
  })
})
