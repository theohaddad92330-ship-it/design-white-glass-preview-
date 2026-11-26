import { describe, expect, it } from 'vitest'
import { defaultFinancePeriod, financePeriods, formatFinancePeriod, previousMonthOf } from './finance-period'

/**
 * Le sélecteur de période, et pourquoi il n'est pas optionnel.
 *
 * Le dossier du 26/08 le dit de la variante 5 : « aucun sélecteur de période
 * visible. C'est un défaut grave : un écran financier dont on ne voit pas la
 * période se lit de travers dès qu'il est partagé ou exporté. »
 *
 * Et il rejette la forme de la variante 1 : « le sélecteur de période en grande
 * carte coûte une rangée entière ». Il vit donc dans la barre d'outils.
 */
describe('financePeriods', () => {
  it('rend les douze derniers mois, du plus récent au plus ancien', () => {
    const months = financePeriods(new Date('2026-08-27T10:00:00Z'), 12)

    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-08')
    expect(months[11]).toBe('2025-09')
  })

  it('franchit un changement d’année sans se tromper de mois', () => {
    expect(financePeriods(new Date('2026-01-15T00:00:00Z'), 3)).toEqual(['2026-01', '2025-12', '2025-11'])
  })

  it('ne dérive pas d’un mois selon le fuseau du navigateur', () => {
    // Le 1er du mois à minuit UTC est le 31 du mois précédent à Los Angeles.
    // Un calcul en heure locale rendrait « juillet » à qui vient d'ouvrir août.
    expect(financePeriods(new Date('2026-08-01T00:00:00Z'), 1)).toEqual(['2026-08'])
  })
})

describe('defaultFinancePeriod', () => {
  it('ouvre sur le mois PRÉCÉDENT — le même défaut que le serveur', () => {
    // Le serveur retombe sur le mois précédent quand aucun `month` n'est passé
    // (`previousMonth()` dans `finance.controller.ts`). Ouvrir sur le mois en
    // cours ferait dire à cet écran autre chose que le panneau du cockpit, sur
    // exactement les mêmes chiffres.
    expect(defaultFinancePeriod(new Date('2026-08-27T10:00:00Z'))).toBe('2026-07')
    expect(defaultFinancePeriod(new Date('2026-01-03T10:00:00Z'))).toBe('2025-12')
  })
})

describe('formatFinancePeriod', () => {
  it('écrit le mois en toutes lettres, dans la langue de l’interface', () => {
    expect(formatFinancePeriod('2026-08', 'fr')).toContain('2026')
    expect(formatFinancePeriod('2026-08', 'fr').toLowerCase()).toContain('août')
    expect(formatFinancePeriod('2026-08', 'en').toLowerCase()).toContain('august')
  })

  it('rend la valeur brute plutôt qu’une date invalide', () => {
    // « Invalid Date » ferait chercher un bug d'affichage là où c'est la
    // donnée qui est illisible.
    expect(formatFinancePeriod('pas-un-mois', 'fr')).toBe('pas-un-mois')
  })
})

/**
 * Le mois qui précède un mois donné — la seule brique manquante pour un delta
 * période/période (`FinancePanel`, manque n°2 du lot du 30/08).
 *
 * Volontairement DISTINCTE de `defaultFinancePeriod` : celle-ci calcule « le
 * mois précédent MAINTENANT », celle-là « le mois précédent DE CE MOIS-LÀ » —
 * deux questions différentes qui ne doivent pas se recouper par accident.
 */
describe('previousMonthOf', () => {
  it('recule d’un mois', () => {
    expect(previousMonthOf('2026-08')).toBe('2026-07')
  })

  it('franchit un changement d’année sans se tromper de mois', () => {
    expect(previousMonthOf('2026-01')).toBe('2025-12')
  })

  it('rend la valeur brute plutôt qu’une date invalide', () => {
    expect(previousMonthOf('pas-un-mois')).toBe('pas-un-mois')
  })
})
