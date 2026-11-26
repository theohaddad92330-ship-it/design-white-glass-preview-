import { esnNafClass } from '@bellum/contracts'
import {
  commonBaseCandidatesQuery,
  escapeLike,
  isoOrNull,
  notEsnAccountClause,
  ESN_NAF_DIGITS_PATTERN,
  periodBounds,
  placeCodes,
  placePatterns,
  termPatterns,
  textArray,
} from './base-reader.sql'

/**
 * #4792 — les prédicats partagés par les trois familles. Mesurés ici au caractère près : une requête,
 * elle, ne se relit qu'en production.
 */
describe('#4792 — les motifs de terme', () => {
  it('un mot tapé n’est jamais un joker SQL', () => {
    expect(escapeLike('100%_java\\x')).toBe('100\\%\\_java\\\\x')
    expect(termPatterns({ terms: ['%'] })).toEqual([])
    expect(termPatterns({ terms: ['Java'] })).toEqual(['%Java%'])
  })

  it('deux termes font deux motifs ; aucun terme n’en fait aucun ; un doublon n’en fait qu’un', () => {
    expect(termPatterns({ terms: ['Java', 'Kubernetes'] })).toEqual(['%Java%', '%Kubernetes%'])
    expect(termPatterns({ terms: [] })).toEqual([])
    expect(termPatterns({ terms: ['Java', ' Java '] })).toEqual(['%Java%'])
  })

  it('un terme d’un seul caractère est écarté — « a » rapprocherait tout, ce n’est pas une réponse', () => {
    expect(termPatterns({ terms: ['a', ' ', ''] })).toEqual([])
  })
})

describe('#4792 — les motifs de lieu', () => {
  const place = (over: Partial<Parameters<typeof placePatterns>[0]> = {}) =>
    placePatterns({ city: null, departments: [], regions: [], ...over })

  it('une ville part en texte, et deux lieux font deux motifs', () => {
    expect(place({ city: 'Lille' })).toEqual(['%Lille%'])
    expect(place({ city: 'Lille', regions: ['Hauts-de-France'] })).toEqual(['%Lille%', '%Hauts-de-France%'])
  })

  it('un département donné par son CODE part parenthésé — jamais nu', () => {
    // `%59%` rapprocherait « 59 rue de la Gare » : une ligne manquée est moins grave qu'une ligne fausse.
    expect(place({ departments: ['59'] })).toEqual(['%(59)%'])
    expect(place({ departments: ['2A'] })).toEqual(['%(2A)%'])
    expect(place({ departments: ['59'] })).not.toContain('%59%')
  })

  it('un département donné par son NOM part en texte, comme une ville', () => {
    expect(place({ departments: ['Nord'] })).toEqual(['%Nord%'])
  })

  it('aucun lieu demandé ⇒ aucun motif : un critère absent n’est pas un critère vide', () => {
    expect(place()).toEqual([])
    expect(place({ city: '   ', departments: [''], regions: [] })).toEqual([])
  })
})

describe('#4792 — la période', () => {
  it('deux bornes lisibles deviennent deux instants', () => {
    expect(periodBounds({ from: '2026-01-01', to: '2026-06-30' })).toEqual({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-06-30T00:00:00.000Z',
    })
  })

  it('une date illisible est IGNORÉE, jamais transformée en « maintenant »', () => {
    expect(periodBounds({ from: 'hier matin', to: null })).toEqual({ from: null, to: null })
  })

  it('aucune borne ⇒ aucune fenêtre : la base entière est lisible', () => {
    expect(periodBounds({ from: null, to: null })).toEqual({ from: null, to: null })
  })
})

describe('#4792 — ce que la base rend', () => {
  it('un `text[]` devient une liste propre ; rien d’autre ne devient une liste à une case vide', () => {
    expect(textArray(['Java', '  ', 'Vue'])).toEqual(['Java', 'Vue'])
    expect(textArray(null)).toEqual([])
    expect(textArray('Java')).toEqual([])
  })

  it('une date de base devient de l’ISO ; une absence reste `null`, jamais aujourd’hui', () => {
    expect(isoOrNull(new Date('2026-05-01T10:00:00.000Z'))).toBe('2026-05-01T10:00:00.000Z')
    expect(isoOrNull('2026-05-01T10:00:00.000Z')).toBe('2026-05-01T10:00:00.000Z')
    expect(isoOrNull(null)).toBeNull()
    expect(isoOrNull('')).toBeNull()
    expect(isoOrNull('pas une date')).toBeNull()
  })
})

describe('#4792 — les codes de lieu, pour les colonnes qui portent des jetons', () => {
  const codes = (over: Partial<Parameters<typeof placeCodes>[0]> = {}) =>
    placeCodes({ city: null, departments: [], regions: [], ...over })

  it('un code de département sort NU, en majuscules — c’est ainsi qu’une zone l’écrit', () => {
    // `consultants.zones` porte « 69 », jamais « (69) » : le motif parenthésé ne le verrait pas.
    expect(codes({ departments: ['69'] })).toEqual(['69'])
    expect(codes({ departments: ['2a'] })).toEqual(['2A'])
    expect(codes({ departments: ['69', '59'] })).toEqual(['69', '59'])
  })

  it('ce qui n’est pas un code n’en devient pas un', () => {
    expect(codes({ city: 'Lille', regions: ['Hauts-de-France'] })).toEqual([])
    expect(codes()).toEqual([])
  })

  it('les deux fonctions se complètent, elles ne se remplacent pas', () => {
    const asked = { city: null, departments: ['69'], regions: [] }
    expect(placePatterns(asked)).toEqual(['%(69)%'])
    expect(placeCodes(asked)).toEqual(['69'])
  })
})

describe('#4793.4 — la base commune rapproche le lieu sur la VILLE du compte', () => {
  it('lit la colonne `city` (Ville) en plus du siège et du lieu du besoin, et rend cette ville', () => {
    const { sql } = commonBaseCandidatesQuery(['%Java%'], ['%Lyon%'], [], 24)
    expect(sql).toMatch(/s\.city ILIKE ANY\(\$2::text\[\]\)/)
    expect(sql).toMatch(/COALESCE\(NULLIF\(s\.headquarters, ''\), NULLIF\(s\.city, ''\), nd\.location\) AS city/)
  })
})

describe('#4794 — l’ESN franche se reconnaît au code d’activité, comme dans le contrat', () => {
  it('le motif SQL classe comme `esnNafClass` : seule l’ESN franche est écartée', () => {
    const pattern = new RegExp(ESN_NAF_DIGITS_PATTERN)
    for (const code of ['62.01Z', '6202A', '62.03Z', '62.02A']) {
      expect(esnNafClass(code)).toBe('esn')
      expect(pattern.test(code.replace(/\D/g, ''))).toBe(true)
    }
    // ambigus (62.09Z, 70.22Z) et comptes finaux : jamais écartés sur un code qui ne tranche pas
    for (const code of ['62.09Z', '70.22Z', '47.11F', '64.19Z']) {
      expect(esnNafClass(code)).not.toBe('esn')
      expect(pattern.test(code.replace(/\D/g, ''))).toBe(false)
    }
  })

  it('la clause garde un compte SANS code (le non-renseigné n’est pas une ESN)', () => {
    expect(notEsnAccountClause('a')).toMatch(/a\.naf_code IS NULL/)
  })
})
