import { describe, expect, it } from 'vitest'
import { completenessSchema, deriveCompleteness } from './completeness.js'

describe('deriveCompleteness — sur combien un agrégat est calculé', () => {
  it('un dénominateur NON LU ne produit aucune part — jamais « 100 % », jamais « 0 % »', () => {
    const verdict = deriveCompleteness({ counted: 12, total: null })
    expect(verdict.kind).toBe('unknownTotal')
    expect(verdict).not.toHaveProperty('share')
  })

  it('une population VIDE ne se divise pas — « rien à calculer », pas « 0 % »', () => {
    // C'est la règle de `rate()` du pilotage, appliquée à la complétude : un
    // taux sur zéro élément est une division par rien, pas une mesure nulle.
    expect(deriveCompleteness({ counted: 0, total: 0 }).kind).toBe('nothingToCount')
  })

  it('un agrégat calculé sur TOUTE sa population est « complet », sans pourcentage', () => {
    const verdict = deriveCompleteness({ counted: 34, total: 34 })
    expect(verdict).toEqual({ kind: 'complete', counted: 34, total: 34, excluded: [] })
  })

  it('un agrégat partiel porte sa part, arrondie au point de pourcentage', () => {
    // 21/34 = 0,6176… → 62 %, le chiffre exact de l'exemple du tome 7.
    expect(deriveCompleteness({ counted: 21, total: 34 })).toEqual({
      kind: 'partial',
      counted: 21,
      total: 34,
      share: 62,
      excluded: [],
    })
  })

  it('un numérateur nul sur une population réelle reste une MESURE — 0 %, pas « non mesuré »', () => {
    // Le pendant exact de `flowStatus` : zéro sur du flux est un décrochage
    // qu'il faut voir, pas une absence de mesure.
    const verdict = deriveCompleteness({ counted: 0, total: 8 })
    expect(verdict).toMatchObject({ kind: 'partial', share: 0 })
  })

  it('un dénominateur plus petit que son numérateur n’est PAS un dénominateur', () => {
    // On ne devine pas lequel des deux est faux, et on ne rogne pas en silence :
    // rogner afficherait « calculé sur toute la population » sur une paire
    // incohérente, c'est-à-dire la promesse inverse de celle de la primitive.
    const verdict = deriveCompleteness({ counted: 40, total: 34 })
    expect(verdict.kind).toBe('unknownTotal')
  })

  it('ce qui est SORTI du calcul est nommé, et les libellés vides sont retirés', () => {
    // Même discipline que `ScoreWithAxes` : « trois axes non évaluables »
    // n'apprend rien, « 13 sans montant saisi » dit quoi compléter.
    const verdict = deriveCompleteness({ counted: 21, total: 34, excluded: ['13 sans montant saisi', '  ', ''] })
    expect(verdict.excluded).toEqual(['13 sans montant saisi'])
  })

  it('une valeur illisible retombe sur « population inconnue », jamais sur un chiffre inventé', () => {
    expect(deriveCompleteness({ counted: 5, total: Number.NaN }).kind).toBe('unknownTotal')
    expect(deriveCompleteness({ counted: Number.NaN, total: 34 }).kind).toBe('unknownTotal')
    expect(deriveCompleteness({ counted: -1, total: 34 }).kind).toBe('unknownTotal')
  })

  it('la part est un ENTIER de pourcentage, jamais une probabilité déguisée', () => {
    const verdict = deriveCompleteness({ counted: 1, total: 3 })
    expect(verdict).toMatchObject({ share: 33 })
    expect(Number.isInteger((verdict as { share: number }).share)).toBe(true)
  })
})

describe('completenessSchema — la forme qui voyage', () => {
  it('accepte une population non lue', () => {
    expect(completenessSchema.parse({ counted: 3, total: null })).toEqual({ counted: 3, total: null })
  })

  it('refuse un comptage négatif ou décimal', () => {
    expect(completenessSchema.safeParse({ counted: -1, total: 3 }).success).toBe(false)
    expect(completenessSchema.safeParse({ counted: 1.5, total: 3 }).success).toBe(false)
  })

  it('exige `total`, pour qu’un agrégat ne puisse pas OUBLIER son dénominateur', () => {
    // `null` est une réponse, l'absence de clé n'en est pas une : c'est la
    // différence entre « je n'ai pas pu compter » et « je n'y ai pas pensé ».
    expect(completenessSchema.safeParse({ counted: 3 }).success).toBe(false)
  })
})
