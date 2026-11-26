import type { MetricSeriesResponse } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { PORTFOLIO_TILE_KEYS, buildPortfolioTiles, type PortfolioTileKey } from './accountsPortfolioTiles'

/**
 * LE BANDEAU DU PORTEFEUILLE — six tuiles, et aucune qui mente.
 *
 * Ce fichier garde trois propriétés que l'écran ne peut pas garder tout seul :
 *  1. une valeur absente n'est JAMAIS rendue « 0 » ;
 *  2. « missions en cours » et « freelances en mission » sont deux MESURES —
 *     c'est ce que le lot du 30/08 ne pouvait pas affirmer ;
 *  3. une variation ne s'affiche que là où une photo existe, et un mois sans
 *     photo dit « non mesuré », jamais « +0 ».
 */

const NOW = new Date('2026-08-31T12:00:00.000Z')

function tile(tiles: ReturnType<typeof buildPortfolioTiles>, key: PortfolioTileKey) {
  const found = tiles.find(entry => entry.key === key)
  if (!found) throw new Error(`tuile absente : ${key}`)
  return found
}

/** Trois mois de photos, comme la salle de démonstration en sème. */
const SERIES: MetricSeriesResponse = {
  series: [
    {
      metricKey: 'accounts_without_next_action',
      unit: 'count',
      points: [
        { month: '2026-05', value: 11, denominator: 34 },
        { month: '2026-06', value: 9, denominator: 38 },
        { month: '2026-07', value: 5, denominator: 42 },
      ],
    },
    {
      metricKey: 'missions_without_end_date',
      unit: 'count',
      points: [
        { month: '2026-05', value: 4, denominator: 9 },
        { month: '2026-06', value: 3, denominator: 10 },
        { month: '2026-07', value: 2, denominator: 11 },
      ],
    },
  ],
  monthsCovered: 3,
}

const READY = {
  followed: 48,
  billing: { ready: 29, blocked: 12, withProfile: 35 },
  billingFailed: false,
  staffing: { activeMissions: 37, consultantsOnMission: 128, missionsWithoutAssignment: 0 },
  staffingFailed: false,
  series: SERIES,
  now: NOW,
}

describe('les six tuiles de la maquette', () => {
  it('rend les six, dans l’ordre', () => {
    const tiles = buildPortfolioTiles(READY)
    expect(tiles.map(entry => entry.key)).toEqual([...PORTFOLIO_TILE_KEYS])
  })

  it('porte les six valeurs quand tout est lu', () => {
    const tiles = buildPortfolioTiles(READY)
    expect(tiles.map(entry => entry.value)).toEqual([48, 35, 37, 128, 29, 12])
    expect(tiles.every(entry => entry.gap === null)).toBe(true)
  })

  it('dit sur QUOI chaque tuile compte — l’espace ou la page', () => {
    // La liste est paginée : un total dérivé des lignes chargées grandit en
    // défilant. Le périmètre est une donnée, pas une décoration.
    const tiles = buildPortfolioTiles(READY)
    expect(tile(tiles, 'total').scope).toBe('workspace')
    expect(tile(tiles, 'ready').scope).toBe('page')
    expect(tile(tiles, 'alerts').scope).toBe('page')
  })
})

describe('« missions en cours » et « freelances en mission » ne sont plus le même chiffre', () => {
  it('rend deux valeurs DIFFÉRENTES à partir de la source réparée', () => {
    // C'est la propriété exacte que le lot du 30/08 ne pouvait pas obtenir :
    // `expertsOnSite` valait alors `accountMissions.length`.
    const tiles = buildPortfolioTiles(READY)
    expect(tile(tiles, 'activeMissions').value).toBe(37)
    expect(tile(tiles, 'consultantsOnMission').value).toBe(128)
    expect(tile(tiles, 'consultantsOnMission').value).not.toBe(tile(tiles, 'activeMissions').value)
  })

  it('annonce la POPULATION sous « freelances en mission »', () => {
    expect(tile(buildPortfolioTiles(READY), 'consultantsOnMission').denominator).toBe(37)
  })

  it('SE TAIT quand aucune mission active ne porte d’affectation enregistrée', () => {
    // « 0 personne en poste » se lirait « bench complet » chez une agence qui
    // tourne à plein. Le zéro compterait des lignes que personne n'a écrites.
    const tiles = buildPortfolioTiles({
      ...READY,
      staffing: { activeMissions: 9, consultantsOnMission: 0, missionsWithoutAssignment: 9 },
    })
    expect(tile(tiles, 'consultantsOnMission').value).toBeNull()
    expect(tile(tiles, 'consultantsOnMission').gap).toBe('staffing_not_recorded')
    // La tuile voisine, elle, garde sa valeur : la panne est locale.
    expect(tile(tiles, 'activeMissions').value).toBe(9)
  })

  it('affiche BIEN un zéro quand il n’y a aucune mission active — un stock vide est vrai', () => {
    const tiles = buildPortfolioTiles({
      ...READY,
      staffing: { activeMissions: 0, consultantsOnMission: 0, missionsWithoutAssignment: 0 },
    })
    expect(tile(tiles, 'consultantsOnMission').value).toBe(0)
    expect(tile(tiles, 'consultantsOnMission').gap).toBeNull()
  })

  it('se tait aussi quand PLUS de missions que d’affectations manquent (données incohérentes)', () => {
    const tiles = buildPortfolioTiles({
      ...READY,
      staffing: { activeMissions: 4, consultantsOnMission: 0, missionsWithoutAssignment: 6 },
    })
    expect(tile(tiles, 'consultantsOnMission').gap).toBe('staffing_not_recorded')
  })
})

describe('une valeur absente n’est jamais « 0 »', () => {
  it('un compteur serveur pas encore lu vaut « en cours », pas zéro', () => {
    // Le serveur ne rend les compteurs que sur la PREMIÈRE page : les lire
    // comme « 0 compte » ferait clignoter un portefeuille vide à chaque filtre.
    const tiles = buildPortfolioTiles({ ...READY, followed: undefined })
    expect(tile(tiles, 'total').value).toBeNull()
    expect(tile(tiles, 'total').gap).toBe('loading')
  })

  it('une lentille de facturation en ÉCHEC ne rend ni « 0 prêt » ni « 0 alerte »', () => {
    const tiles = buildPortfolioTiles({ ...READY, billing: null, billingFailed: true })
    for (const key of ['withBillingEntity', 'ready', 'alerts'] as const) {
      expect(tile(tiles, key).value).toBeNull()
      expect(tile(tiles, key).gap).toBe('failed')
    }
    // Et les tuiles qui ne dépendent pas d'elle continuent de répondre.
    expect(tile(tiles, 'activeMissions').value).toBe(37)
  })

  it('distingue le CHARGEMENT de l’ÉCHEC — ils ne se réparent pas pareil', () => {
    const loading = buildPortfolioTiles({ ...READY, staffing: null, staffingFailed: false })
    const failed = buildPortfolioTiles({ ...READY, staffing: null, staffingFailed: true })
    expect(tile(loading, 'activeMissions').gap).toBe('loading')
    expect(tile(failed, 'activeMissions').gap).toBe('failed')
  })
})

describe('la variation mensuelle est LUE, jamais inventée', () => {
  it('compare la valeur d’aujourd’hui à la POPULATION photographiée le mois dernier', () => {
    // 48 comptes suivis aujourd'hui, 42 sur la photo de juillet : +6.
    const delta = tile(buildPortfolioTiles(READY), 'total').delta
    expect(delta?.measured).toBe(true)
    if (delta?.measured) {
      expect(delta.change).toBe(6)
      expect(delta.from.value).toBe(42)
      expect(delta.to.value).toBe(48)
    }
  })

  it('lit la POPULATION de la photo, pas sa valeur', () => {
    // La valeur de `missions_without_end_date` en juillet est 2 ; sa population
    // est 11. C'est la seconde que la tuile « missions en cours » affiche.
    const delta = tile(buildPortfolioTiles(READY), 'activeMissions').delta
    expect(delta?.measured).toBe(true)
    if (delta?.measured) expect(delta.from.value).toBe(11)
  })

  it('dit « non mesuré » quand AUCUNE photo n’existe encore — jamais « +0 »', () => {
    const tiles = buildPortfolioTiles({ ...READY, series: { series: [], monthsCovered: 0 } })
    const delta = tile(tiles, 'total').delta
    expect(delta?.measured).toBe(false)
    if (delta && !delta.measured) expect(delta.gap).toBe('no_previous_snapshot')
  })

  it('ÉCARTE un mois dont la population n’a pas été lue, au lieu de la compter zéro', () => {
    // `denominator: null` = population non lue. La compter vide ferait une chute
    // de 42 à 0, c'est-à-dire une catastrophe inventée.
    const tiles = buildPortfolioTiles({
      ...READY,
      series: {
        series: [
          {
            metricKey: 'accounts_without_next_action',
            unit: 'count',
            points: [
              { month: '2026-06', value: 9, denominator: 38 },
              { month: '2026-07', value: 5 },
            ],
          },
        ],
        monthsCovered: 2,
      },
    })
    const delta = tile(tiles, 'total').delta
    expect(delta?.measured).toBe(true)
    if (delta?.measured) expect(delta.from.value).toBe(38)
  })

  it('n’attend AUCUNE variation là où la population n’est pas photographiée', () => {
    // Quatre « non mesuré » alignés sous six tuiles ne se lisent plus. Ces
    // quatre-là n'écrivent donc aucune ligne : `delta` est `null`, ce qui n'est
    // pas la même chose qu'une comparaison ratée.
    const tiles = buildPortfolioTiles(READY)
    for (const key of ['withBillingEntity', 'consultantsOnMission', 'ready', 'alerts'] as const) {
      expect(tile(tiles, key).delta).toBeNull()
    }
  })

  it('ne compare rien quand la valeur du jour manque', () => {
    const tiles = buildPortfolioTiles({ ...READY, followed: undefined })
    const delta = tile(tiles, 'total').delta
    expect(delta?.measured).toBe(false)
    if (delta && !delta.measured) expect(delta.gap).toBe('no_current_snapshot')
  })

  it('refuse une photo POSTÉRIEURE au mois courant plutôt que d’en tirer une variation', () => {
    const tiles = buildPortfolioTiles({
      ...READY,
      series: {
        series: [
          {
            metricKey: 'accounts_without_next_action',
            unit: 'count',
            points: [{ month: '2026-09', value: 5, denominator: 42 }],
          },
        ],
        monthsCovered: 1,
      },
    })
    const delta = tile(tiles, 'total').delta
    expect(delta?.measured).toBe(false)
    if (delta && !delta.measured) expect(delta.gap).toBe('periods_not_ordered')
  })
})
