import { describe, expect, it } from 'vitest'
import { formaterEuros } from '../revenus.logic'
import { champEuros, derniersMois, libelleBurnMoyen, libelleRunway, lireMontant } from './tresorerie.logic'

/**
 * ⚠️ `formaterEuros` et `libelleMois` ont déménagé dans `../revenus.logic`
 * (#1651) : ils servent aux deux écrans de la section, et un format vit à un
 * seul endroit (GA-26). Leurs tests les ont suivis, dans `revenus.logic.test.ts`
 * — les laisser ici en aurait fait deux corpus qui se croiraient complets.
 * `formaterEuros` reste importé ci-dessous parce que `libelleBurnMoyen` rend son
 * résultat : c'est un usage, pas un doublon.
 */

describe('lireMontant (#1649)', () => {
  it('un champ VIDE n’est pas zéro — c’est « non mesuré »', () => {
    expect(lireMontant('')).toEqual({ etat: 'vide' })
    expect(lireMontant('   ')).toEqual({ etat: 'vide' })
    expect(lireMontant(' \u00a0€ ')).toEqual({ etat: 'vide' })
  })

  it('lit ce qu’un humain tape vraiment', () => {
    expect(lireMontant('12480')).toEqual({ etat: 'lu', cents: 1_248_000 })
    expect(lireMontant('12 480\u00a0€')).toEqual({ etat: 'lu', cents: 1_248_000 })
    // Espace insécable étroit (U+202F), celui que met le clavier français.
    expect(lireMontant('12\u202f480')).toEqual({ etat: 'lu', cents: 1_248_000 })
    expect(lireMontant('1 200,50')).toEqual({ etat: 'lu', cents: 120_050 })
    expect(lireMontant('1200.5')).toEqual({ etat: 'lu', cents: 120_050 })
    expect(lireMontant('0')).toEqual({ etat: 'lu', cents: 0 })
  })

  it('accepte un négatif — une dépense annulée, un encaissement corrigé', () => {
    expect(lireMontant('-450')).toEqual({ etat: 'lu', cents: -45_000 })
  })

  it('refuse plutôt que de deviner', () => {
    expect(lireMontant('douze mille')).toEqual({ etat: 'illisible' })
    expect(lireMontant('12,')).toEqual({ etat: 'illisible' })
    expect(lireMontant('1,234')).toEqual({ etat: 'illisible' })
    expect(lireMontant('12-4')).toEqual({ etat: 'illisible' })
  })
})

describe('champEuros (#1649)', () => {
  it('une valeur absente rend une case VIDE, jamais un « 0 » qu’on validerait sans y penser', () => {
    expect(champEuros(null)).toBe('')
    expect(champEuros(undefined)).toBe('')
  })

  it('un vrai zéro se réaffiche, lui', () => {
    expect(champEuros(0)).toBe('0')
    expect(champEuros(120_050)).toBe('1200.5')
  })
})

describe('derniersMois (#1649)', () => {
  it('recule du plus récent au plus ancien, par-dessus janvier', () => {
    expect(derniersMois('2026-02', 4)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11'])
  })

  it('ne fabrique rien à partir d’une ancre illisible', () => {
    expect(derniersMois('2026-13', 3)).toEqual([])
    expect(derniersMois('2026-09', 0)).toEqual([])
  })
})

describe('libelleRunway (#1649)', () => {
  it('mesuré : le nombre ET d’où il vient', () => {
    expect(libelleRunway({ measured: true, months: 14, averageBurnCents: 420000 })).toEqual({
      valeur: '14 mois',
      note: 'Solde ÷ burn moyen des 3 derniers mois.',
    })
  })

  it('chaque refus a SA phrase — jamais un « non mesuré » nu', () => {
    const raisons = ['not_enough_months', 'no_balance', 'not_burning'] as const
    const notes = raisons.map(reason => libelleRunway({ measured: false, reason }))

    for (const { valeur, note } of notes) {
      expect(valeur).toBeNull()
      expect(note).toMatch(/Non mesurable/)
    }
    // Et elles ne disent pas la même chose : trois raisons, trois consignes.
    expect(new Set(notes.map(n => n.note)).size).toBe(3)
    expect(notes[0]?.note).toContain('2 mois')
    expect(notes[1]?.note).toContain('solde')
  })

  it('aucun mois saisi n’est pas un refus de calcul — c’est un écran vide', () => {
    expect(libelleRunway(null)).toEqual({ valeur: null, note: 'Aucun mois saisi.' })
  })
})

describe('libelleBurnMoyen (#1649)', () => {
  it('dit sur combien de mois la moyenne porte', () => {
    expect(libelleBurnMoyen({ measured: true, cents: 420000, monthsUsed: 2 })).toEqual({
      valeur: formaterEuros(420000),
      note: 'Moyenne sur 2 mois mesurés.',
    })
  })

  it('un seul mois → pas de moyenne, et on dit pourquoi', () => {
    expect(libelleBurnMoyen({ measured: false, reason: 'not_enough_months' })).toEqual({
      valeur: null,
      note: 'Non mesurable : il faut 2 mois saisis.',
    })
  })
})
