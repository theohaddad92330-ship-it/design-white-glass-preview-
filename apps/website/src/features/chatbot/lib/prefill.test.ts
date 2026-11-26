import { describe, expect, it } from 'vitest'
import { buildPrefill, PREFILL_FIELDS, PREFILL_PARAM, withPrefill } from './prefill'

/**
 * Ce que la conversation transmet à l'espace — §11 P2. Les deux garanties
 * structurelles que le fichier porte : rien ne se crée sans le clic, et aucune
 * donnée personnelle ne voyage.
 */

describe('la liste blanche', () => {
  it('ne contient que les huit axes de qualification — jamais un champ nominatif', () => {
    expect(PREFILL_FIELDS).toHaveLength(8)
    expect(PREFILL_FIELDS).not.toContain('firstName')
    expect(PREFILL_FIELDS).not.toContain('pain')
    expect(PREFILL_FIELDS).not.toContain('email')
  })
})

describe('buildPrefill', () => {
  it('transmet un champ de la liste blanche dont la valeur ressemble à un code', () => {
    const result = buildPrefill({ companyType: 'esn', teamSize: '6-15' })
    expect(result.fields).toEqual({ companyType: 'esn', teamSize: '6-15' })
    expect(result.withheld).toEqual([])
    expect(result.query).toBe(`${PREFILL_PARAM}=companyType%3Aesn~teamSize%3A6-15`)
  })

  it('retient nommément un champ hors liste blanche, sans le transmettre', () => {
    const result = buildPrefill({ companyType: 'esn', pain: 'on perd nos plus gros comptes' })
    expect(result.fields).toEqual({ companyType: 'esn' })
    expect(result.withheld).toEqual(['pain'])
  })

  it('rejette une valeur qui ne ressemble pas à un code — texte libre, espace, majuscule', () => {
    const result = buildPrefill({ companyType: 'ESN avec un espace' })
    expect(result.fields).toEqual({})
    // Ce n'est pas une décision de confidentialité : le champ n'est pas non
    // plus annoncé comme retenu, on ne sait juste pas le lire.
    expect(result.withheld).toEqual([])
  })

  it('ignore les valeurs vides, nulles ou indéfinies — rien à retenir', () => {
    const result = buildPrefill({ companyType: '', teamSize: null, persona: undefined })
    expect(result.fields).toEqual({})
    expect(result.withheld).toEqual([])
  })

  it('rend une chaîne vide sans champ transmissible — jamais un paramètre vide', () => {
    const result = buildPrefill({ pain: 'texte libre' })
    expect(result.query).toBe('')
  })

  it("ne fait confiance à aucune clé inconnue — l'entrée est une frontière", () => {
    const result = buildPrefill({ notInWhitelist: 'esn', anotherOne: 'x' })
    expect(result.fields).toEqual({})
    expect(result.withheld.sort()).toEqual(['anotherOne', 'notInWhitelist'])
  })
})

describe('withPrefill', () => {
  it('accroche le contexte à un lien nu', () => {
    const prefill = buildPrefill({ companyType: 'esn' })
    expect(withPrefill('https://app.bellum-ai.com/signup', prefill)).toBe(
      `https://app.bellum-ai.com/signup?${prefill.query}`,
    )
  })

  it('accroche avec un `&` quand le lien porte déjà une requête', () => {
    const prefill = buildPrefill({ companyType: 'esn' })
    expect(withPrefill('https://app.bellum-ai.com/signup?utm_source=chat', prefill)).toBe(
      `https://app.bellum-ai.com/signup?utm_source=chat&${prefill.query}`,
    )
  })

  it('rend le lien nu sans contexte transmissible', () => {
    const prefill = buildPrefill({ pain: 'texte libre' })
    expect(withPrefill('https://app.bellum-ai.com/signup', prefill)).toBe('https://app.bellum-ai.com/signup')
  })
})
