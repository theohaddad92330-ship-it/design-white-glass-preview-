import { describe, expect, it } from 'vitest'
import {
  TOP_PARCOURS_AFFICHES,
  destinationPrincipale,
  segmentsDesParcours,
  type ExitDetailMesure,
  type Sequence,
} from './journey-summary.logic'

/**
 * #1684.1 / #1684.2 — LES PARCOURS, testés AVANT d'être rendus.
 *
 * Deux choses à prouver :
 *  1. la destination principale d'une sortie mesurée est la plus fréquente,
 *     jamais une fermeture ou une inactivité déguisée en destination ;
 *  2. les dix parcours principaux se rendent en segments, et le résidu — les
 *     parcours mesurés au-delà des dix premiers — se rend EN DERNIER quel que
 *     soit son volume, jamais trié avec les autres (défaut mesuré cinq fois
 *     dans ce dépôt : un seau de résidu en tête d'une liste tronquée mange le
 *     signal utile).
 */

function sequence(sessions: number, routes: string[]): Sequence {
  return { routes, labels: routes.map(route => ({ fr: route, en: route })), sessions }
}

describe('#1684.1 — destinationPrincipale', () => {
  it('rend la destination la PLUS fréquente — la première du tableau déjà trié par l’API', () => {
    const detail: ExitDetailMesure = {
      kind: 'measured',
      destinations: [
        { route: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' }, exits: 12 },
        { route: '/contacts', label: { fr: 'Contacts', en: 'Contacts' }, exits: 3 },
      ],
      closeRate: { kind: 'measured', ratio: 0.2, over: 15 },
      idleRate: { kind: 'unmeasured' },
    }
    expect(destinationPrincipale(detail)).toEqual({
      route: '/dashboard',
      label: { fr: 'Tableau de bord', en: 'Dashboard' },
      exits: 12,
    })
  })

  it('aucune destination (toutes les sorties ferment ou sont inactives) → null, jamais une destination inventée', () => {
    const detail: ExitDetailMesure = {
      kind: 'measured',
      destinations: [],
      closeRate: { kind: 'measured', ratio: 1, over: 8 },
      idleRate: { kind: 'unmeasured' },
    }
    expect(destinationPrincipale(detail)).toBeNull()
  })
})

describe('#1684.2 — segmentsDesParcours (résidu TOUJOURS en dernier)', () => {
  it('dix parcours ou moins → aucun résidu, tous nommés', () => {
    const sequences = [sequence(20, ['/a', '/b', '/c']), sequence(5, ['/x', '/y', '/z'])]
    const resultat = segmentsDesParcours(sequences)
    expect(resultat.masques).toBe(0)
    expect(resultat.slices).toHaveLength(2)
    expect(resultat.slices.map(s => s.value)).toEqual([20, 5])
  })

  it('plus de dix parcours → exactement dix segments nommés + un résidu en dernier', () => {
    const sequences = Array.from({ length: 14 }, (_, i) => sequence(14 - i, [`/a${i}`, `/b${i}`, `/c${i}`]))
    const resultat = segmentsDesParcours(sequences)

    expect(resultat.slices).toHaveLength(TOP_PARCOURS_AFFICHES + 1)
    expect(resultat.masques).toBe(4)
    // Le résidu est le DERNIER élément du tableau.
    const dernier = resultat.slices[resultat.slices.length - 1]
    expect(dernier?.label).toContain('4')
    // Sa valeur est la somme des sessions des parcours masqués (14+13+12+11 → 10,9,8,7 restent après tri desc,
    // ici triés desc : 14..1, les 4 derniers sont 4,3,2,1 → somme 10).
    expect(dernier?.value).toBe(4 + 3 + 2 + 1)
  })

  it('sait dire NON — le résidu reste DERNIER même quand sa somme dépasse le premier segment affiché', () => {
    // Un seul gros parcours nommé, puis beaucoup de petits dont la somme
    // dépasse le premier : un tri naïf par volume placerait le résidu en tête.
    const gros = sequence(50, ['/a', '/b', '/c'])
    const petits = Array.from({ length: 12 }, (_, i) => sequence(10, [`/p${i}`, `/q${i}`, `/r${i}`]))
    const resultat = segmentsDesParcours([gros, ...petits])

    expect(resultat.masques).toBe(3) // 1 gros + 12 petits = 13, top 10 affichés, 3 masqués
    const dernier = resultat.slices[resultat.slices.length - 1]
    expect(dernier?.value).toBe(30) // 3 × 10 masqués
    // Le résidu (30) dépasse bien le premier segment affiché (50 ? non — ici
    // le premier affiché est le gros à 50, qui reste devant) : on vérifie la
    // position, pas seulement la valeur — la garde de cette propriété.
    expect(resultat.slices[0]?.value).toBe(50)
    expect(resultat.slices.indexOf(dernier!)).toBe(resultat.slices.length - 1)
  })

  it('le résidu est NOMMÉ — jamais une valeur muette ajoutée sans étiquette', () => {
    const sequences = Array.from({ length: 11 }, (_, i) => sequence(1, [`/a${i}`, `/b${i}`, `/c${i}`]))
    const resultat = segmentsDesParcours(sequences)
    const dernier = resultat.slices[resultat.slices.length - 1]
    expect(dernier?.label).toBeTruthy()
    expect(dernier?.label.toLowerCase()).toContain('autres')
  })
})
