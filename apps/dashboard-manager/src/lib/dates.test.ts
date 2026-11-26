import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dateEtHeure, dureeEcoulee, jour, jourCompact, jourEtHeureCourte, jourEtHeurePrecise, jourSeul } from './dates'

/**
 * La preuve, par la mesure, que les dates de la console ne dépendent plus du
 * fuseau de la machine qui les rend (#1668 §4.2).
 *
 * ⚠️ CE QUI REND CE FICHIER NON BORGNE. Un test qui bascule `TZ` et constate
 * que la sortie ne change pas passerait AUSSI si la bascule ne prenait pas
 * effet — et il ne prouverait alors rigoureusement rien. Le premier test
 * ci-dessous mesure donc d'abord qu'un formateur SANS fuseau, lui, change bien
 * de valeur entre les deux réglages. C'est lui qui donne son sens aux autres.
 *
 * Le défaut d'origine : Vercel rend en UTC, l'opérateur lit à Paris, et React
 * voit deux textes différents pour le même instant — erreurs #418 / #423 / #425
 * mesurées en production le 07/09/2026 sur `/`, `/feedback` et `/banners`.
 */

const INSTANT = '2026-09-05T22:32:10.000Z' // 00:32 le 6 à Paris, 22:32 le 5 en UTC : le pire cas.
const TZ_ORIGINE = process.env['TZ']

function sousFuseau<T>(fuseau: string, faire: () => T): T {
  process.env['TZ'] = fuseau
  return faire()
}

beforeEach(() => {
  process.env['TZ'] = TZ_ORIGINE ?? 'UTC'
})

afterEach(() => {
  if (TZ_ORIGINE === undefined) delete process.env['TZ']
  else process.env['TZ'] = TZ_ORIGINE
})

describe('le banc de mesure lui-même', () => {
  it('LIT quelque chose — sans fuseau explicite, la sortie CHANGE bel et bien avec TZ', () => {
    const enUtc = sousFuseau('UTC', () => new Date(INSTANT).toLocaleString('fr-FR'))
    const aParis = sousFuseau('Europe/Paris', () => new Date(INSTANT).toLocaleString('fr-FR'))

    // C'est exactement le défaut corrigé : le 5 à 22 h contre le 6 à 00 h.
    expect(enUtc).not.toBe(aParis)
    expect(enUtc).toContain('05/09/2026')
    expect(aParis).toContain('06/09/2026')
  })
})

describe('formaterInstant et ses formes — indifférentes au fuseau de la machine', () => {
  const formes: ReadonlyArray<[string, (v: string) => string]> = [
    ['dateEtHeure', dateEtHeure],
    ['jour', jour],
    ['jourCompact', jourCompact],
    ['jourEtHeureCourte', jourEtHeureCourte],
    ['jourEtHeurePrecise', jourEtHeurePrecise],
  ]

  for (const [nom, formater] of formes) {
    it(`${nom} rend la MÊME chaîne en UTC et à Paris`, () => {
      const enUtc = sousFuseau('UTC', () => formater(INSTANT))
      const aParis = sousFuseau('Europe/Paris', () => formater(INSTANT))

      expect(enUtc).toBe(aParis)
      // Et c'est l'heure de PARIS qui est rendue, pas celle du serveur : le
      // 5 à 22:32 UTC est le 6 à 00:32 pour l'opérateur qui lit l'écran.
      expect(enUtc).toContain('06/09')
    })
  }

  it('sait dire NON — une date absente ou illisible ne s’affiche jamais comme une date', () => {
    expect(dateEtHeure(null)).toBe('—')
    expect(dateEtHeure(undefined)).toBe('—')
    expect(dateEtHeure('')).toBe('—')
    expect(dateEtHeure('pas une date')).toBe('—')
    expect(jour('pas une date', 'non renseigné')).toBe('non renseigné')
  })
})

describe('jourSeul — un jour du calendrier n’a pas de fuseau', () => {
  it('`2026-09-05` reste le 05/09/2026 des deux côtés', () => {
    const enUtc = sousFuseau('UTC', () => jourSeul('2026-09-05'))
    const aParis = sousFuseau('Europe/Paris', () => jourSeul('2026-09-05'))
    const aTokyo = sousFuseau('Asia/Tokyo', () => jourSeul('2026-09-05'))

    expect(enUtc).toBe('05/09/2026')
    expect(aParis).toBe('05/09/2026')
    // Le fuseau le plus à l'est : c'est là que l'ancien chemin basculait de jour.
    expect(aTokyo).toBe('05/09/2026')
  })

  it('n’attrape pas ce qu’elle ne vise pas — un instant complet reste lisible', () => {
    expect(jourSeul(INSTANT)).toBe('05/09/2026')
  })

  it('sait dire NON', () => {
    expect(jourSeul(null)).toBe('—')
    expect(jourSeul('2026-13-99')).toBe('—')
  })
})

describe('dureeEcoulee — l’âge du job le plus ancien d’une file (#1662.1)', () => {
  it('rend des minutes sous l’heure', () => {
    expect(dureeEcoulee(15 * 60_000)).toBe('15 min')
  })

  it('rend des heures et minutes sous le jour', () => {
    expect(dureeEcoulee(3 * 3_600_000 + 20 * 60_000)).toBe('3 h 20')
  })

  it('omet les minutes quand elles tombent juste', () => {
    expect(dureeEcoulee(2 * 3_600_000)).toBe('2 h')
  })

  it('rend des jours et des heures au-delà de 24 h', () => {
    expect(dureeEcoulee(2 * 86_400_000 + 5 * 3_600_000)).toBe('2 j 5 h')
  })

  it('omet les heures quand elles tombent juste', () => {
    expect(dureeEcoulee(3 * 86_400_000)).toBe('3 j')
  })

  it('signale une durée sous la minute sans dire zéro', () => {
    expect(dureeEcoulee(30_000)).toBe('< 1 min')
  })

  // ⚠️ « pas de job en attente » n’est PAS « 0 minute » — une file vide n’a
  // pas d’âge (doctrine UnknownValue, gardes GA-18/GA-19). C’est cette valeur
  // absente que `null` doit rendre lisible, jamais un zéro qui mentirait.
  it('sait dire NON — une durée absente ne s’affiche jamais comme zéro', () => {
    expect(dureeEcoulee(null)).toBe('—')
    expect(dureeEcoulee(undefined)).toBe('—')
    expect(dureeEcoulee(null, 'aucun job en attente')).toBe('aucun job en attente')
  })

  it('n’attrape pas ce qu’elle ne vise pas — une durée négative reste NON', () => {
    expect(dureeEcoulee(-1)).toBe('—')
  })
})
