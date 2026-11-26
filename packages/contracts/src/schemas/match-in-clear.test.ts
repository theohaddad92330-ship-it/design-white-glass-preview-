import { describe, expect, it } from 'vitest'
import { matchInClear } from './match-in-clear.js'

const axis = (over: Record<string, unknown>) =>
  ({ weight: 10, detail: '', evidence: [], score: null, ...over }) as never

describe('matchInClear — la correspondance en mots, jamais en points', () => {
  it('range les compétences couvertes et manquantes par leur nom', () => {
    const clear = matchInClear([
      axis({
        axis: 'must_have',
        score: 50,
        detail: '1/2 couvertes — manque Migration',
        evidence: [{ label: 'SAP S/4HANA — mission chez Airbus', source: 'mission' }],
      }),
      axis({ axis: 'nice_to_have', score: 0, detail: "aucune des 1 compétences attendues n'est portée par ce profil" }),
    ])
    expect(clear.correspondsSkills).toEqual(['SAP S/4HANA'])
    expect(clear.lacksSkills).toEqual(['Migration'])
    // Une compétence souhaitée non portée, sans nom lisible : l'axe est nommé.
    expect(clear.lacksAxes).toEqual(['nice_to_have'])
  })

  it('un axe à 100 correspond, à 0 manque, entre les deux est « en partie », null reste à confirmer', () => {
    const clear = matchInClear([
      axis({ axis: 'availability', score: 100 }),
      axis({ axis: 'location', score: 0 }),
      axis({ axis: 'rate', score: 60 }),
      axis({ axis: 'language', score: null }),
    ])
    expect(clear.correspondsAxes).toEqual(['availability'])
    expect(clear.lacksAxes).toEqual(['location'])
    expect(clear.partialAxes).toEqual(['rate'])
    expect(clear.toConfirmAxes).toEqual(['language'])
  })

  it('une compétence seulement extraite (« à vérifier ») n’est ni couverte ni manquante', () => {
    const clear = matchInClear([
      axis({
        axis: 'must_have',
        score: 0,
        detail: '0/1 couvertes — manque Kafka — à vérifier : Spark',
      }),
    ])
    expect(clear.lacksSkills).toEqual(['Kafka'])
    expect(clear.toConfirmSkills).toEqual(['Spark'])
  })

  it('les axes de compétences ne se répètent pas en nom d’axe quand leurs compétences sont nommées', () => {
    const clear = matchInClear([
      axis({
        axis: 'must_have',
        score: 100,
        detail: 'les 1 compétences attendues sont prouvées',
        evidence: [{ label: 'Data', source: 'mission' }],
      }),
    ])
    expect(clear.correspondsSkills).toEqual(['Data'])
    expect(clear.correspondsAxes).toEqual([])
  })
})
