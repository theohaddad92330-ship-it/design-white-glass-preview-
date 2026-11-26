import { describeSimilarAxes, describeSimilarProximity } from './similarProximity'

describe('describeSimilarProximity', () => {
  it('reads a missing score as "proposé par le secteur", never as a profile match', () => {
    // Le serveur n'émet `score_similarity` QUE si un critère a matché : absent
    // ⇒ rien dans le profil n'a rapproché ce compte. Ne jamais le vendre comme
    // « proche de votre cible ».
    expect(describeSimilarProximity(undefined)).toBe('seed')
    expect(describeSimilarProximity(null)).toBe('seed')
    expect(describeSimilarProximity(0)).toBe('seed')
  })

  it('never invents a level out of a broken number', () => {
    // Un score illisible retombe sur l'aveu (« proposé par le secteur »), jamais
    // sur la promesse la plus flatteuse.
    expect(describeSimilarProximity(Number.NaN)).toBe('seed')
    expect(describeSimilarProximity(Number.POSITIVE_INFINITY)).toBe('seed')
  })

  it('separates one matched criterion from a widely matched profile', () => {
    // 2/7 (géo seule) et 3/7 (secteur seul) = un seul critère.
    expect(describeSimilarProximity(2 / 7)).toBe('partial')
    expect(describeSimilarProximity(3 / 7)).toBe('partial')
    // 4/7 (géo + taille), 5/7 (secteur + un autre), 7/7 (les trois).
    expect(describeSimilarProximity(4 / 7)).toBe('strong')
    expect(describeSimilarProximity(5 / 7)).toBe('strong')
    expect(describeSimilarProximity(1)).toBe('strong')
  })

  /**
   * #2040.18 — depuis que le serveur ne publie plus de score sous trois axes
   * ÉVALUABLES, « score absent » ne veut plus dire « rien n'a matché ». Les
   * critères nommés tranchent alors, sinon la carte se contredit elle-même.
   */
  it('lit les critères matchés quand le score se tait (#2040.18)', () => {
    expect(describeSimilarProximity(undefined, ['sector'])).toBe('partial')
    expect(describeSimilarProximity(undefined, ['sector', 'geo'])).toBe('partial')
  })

  it('témoin — score absent ET aucun critère : l’aveu d’origine est gardé', () => {
    expect(describeSimilarProximity(undefined, [])).toBe('seed')
    expect(describeSimilarProximity(undefined, undefined)).toBe('seed')
  })

  it('témoin — un score publié garde la main : les critères ne le dégradent pas', () => {
    expect(describeSimilarProximity(1, ['sector'])).toBe('strong')
  })
})

describe('describeSimilarAxes — la seule dérivation des axes, carte ET Découvrir (#2040.18)', () => {
  it('nomme les axes matchés et les axes muets, dans l’ordre des poids', () => {
    expect(describeSimilarAxes(['size', 'sector'], ['geo'])).toEqual({
      matched: ['sector', 'size'],
      unevaluated: ['geo'],
    })
  })

  it('témoin — un axe matché n’est jamais aussi déclaré muet : le fait mesuré gagne', () => {
    expect(describeSimilarAxes(['sector'], ['sector', 'geo'])).toEqual({ matched: ['sector'], unevaluated: ['geo'] })
  })

  it('témoin — rien à nommer quand l’API ne rend aucun des deux champs', () => {
    expect(describeSimilarAxes(undefined, undefined)).toEqual({ matched: [], unevaluated: [] })
  })
})
