import { describe, expect, it } from 'vitest'
import { REGISTRY_REGIONS } from './discover-registry-vocab'
import {
  offerTargetRegionCodes,
  huntingRegionCodes,
  coversWholeCountry,
  unrecognizedZones,
} from './discover-offer-territory'

describe('#2804 (#2291.2) — offre : territoire, région déclarée → code INSEE du rail', () => {
  it('traduit une région déclarée en son code INSEE du rail Découvrir', () => {
    expect(offerTargetRegionCodes(['AURA'])).toEqual(['84'])
    expect(offerTargetRegionCodes(['PACA', 'IDF'])).toEqual(['93', '11'])
  })

  it('déduplique et tolère la casse / les espaces', () => {
    expect(offerTargetRegionCodes(['aura', ' AURA ', 'AURA'])).toEqual(['84'])
  })

  it('SAIT DIRE NON — ignore SEULE une entrée non reconnue, jamais une région devinée à sa place', () => {
    expect(offerTargetRegionCodes(['AURA', 'atlantide'])).toEqual(['84'])
  })

  it('vide en entrée ⇒ vide en sortie, jamais « France entière » devinée', () => {
    expect(offerTargetRegionCodes([])).toEqual([])
  })

  it('chaque code produit existe dans le vocabulaire région du rail — une seule vérité (GA-26)', () => {
    const knownCodes = new Set(REGISTRY_REGIONS.map(region => region.code))
    for (const code of offerTargetRegionCodes([
      'AURA',
      'BFC',
      'BRE',
      'CVL',
      'COR',
      'GES',
      'HDF',
      'IDF',
      'NOR',
      'NAQ',
      'OCC',
      'PDL',
      'PACA',
      'GUA',
      'MTQ',
      'GUY',
      'REU',
      'MAY',
    ])) {
      expect(knownCodes.has(code)).toBe(true)
    }
  })
})

// LUDB.2 / LUDB.4 — la zone du PROFIL (`geo_zones`, libellés du questionnaire)
// se traduit par la MÊME fonction que les codes région du portefeuille.
describe('LUDB.2 — libellés de zone du profil → codes région', () => {
  it('reconnaît les libellés du questionnaire', () => {
    expect(offerTargetRegionCodes(['Lyon & Auvergne-Rhône-Alpes', 'Marseille & PACA'])).toEqual(['84', '93'])
  })
  it('SAIT DIRE NON : « National », « International », « Full remote » ne posent aucune région', () => {
    expect(
      offerTargetRegionCodes(['National (toute la France)', 'International', 'Full remote (pas de contrainte géo)']),
    ).toEqual([])
  })
})

// LUDOVIC-C LC.7 — profil Stelya AURA + PACA + BFC + Lyon, portefeuille « AURA » seul (prod 19/10).
describe('LC.7 — huntingRegionCodes lit TOUTES les zones', () => {
  it('dit NON à « AURA seul » : portefeuille ET profil, sans doublon', () => {
    expect(
      huntingRegionCodes(
        ['AURA'],
        ['Lyon & Auvergne-Rhône-Alpes', 'Marseille & PACA', 'Bourgogne-Franche-Comté', 'Lyon'],
      ),
    ).toEqual(['84', '93', '27'])
  })
  it('profil seul, portefeuille vide : les zones du profil ; « International » n’est jamais deviné', () => {
    expect(huntingRegionCodes([], ['Lyon', 'International'])).toEqual(['84'])
    expect(huntingRegionCodes(null, null)).toEqual([])
  })
})

// LUDOVIC-E LC.6 — profil ARA + PACA + BFC + Lyon, Découvrir n'affichait qu'AURA (region=84 seul).
describe('LC.6 — les zones du profil se lisent quelle que soit leur écriture', () => {
  it('abréviation « ARA », région sans trait d’union ni accent, sigle seul', () => {
    expect(huntingRegionCodes([], ['ARA', 'PACA', 'BFC', 'Lyon'])).toEqual(['84', '93', '27'])
    expect(
      huntingRegionCodes([], ['Auvergne Rhone Alpes', 'Provence Alpes Cote d’Azur', 'Bourgogne Franche Comte']),
    ).toEqual(['84', '93', '27'])
    expect(huntingRegionCodes([], ['Île de France', 'Nouvelle Aquitaine'])).toEqual(['11', '75'])
  })
  it('dit NON à une sous-chaîne : « Nice » ne se lit pas dans « Venice », « National » reste vide', () => {
    expect(huntingRegionCodes([], ['Venice', 'National', 'Aurasie'])).toEqual([])
  })
  it('villes de la région : Saint-Étienne, Annecy, Aix-en-Provence', () => {
    expect(huntingRegionCodes([], ['Saint-Étienne', 'Annecy', 'Aix-en-Provence'])).toEqual(['84', '93'])
  })
})

// LUDOVIC-F F.1 (LC.6, Ludovic 20/10) — profil AURA + PACA + BFC + Lyon, la requête partait avec region=84 seul :
// une zone écrite en UNE chaîne (« A, B, C ») ne donnait que sa PREMIÈRE région.
describe('F.1 — toutes les zones du profil sont lues, aucune perdue en silence', () => {
  it('une chaîne qui porte plusieurs zones donne TOUTES les régions (virgule, +, /, ;, &, « et »)', () => {
    const expected = ['84', '93', '27']
    expect(
      huntingRegionCodes([], ['Auvergne-Rhône-Alpes, Provence-Alpes-Côte d’Azur, Bourgogne-Franche-Comté, Lyon']),
    ).toEqual(expected)
    expect(
      huntingRegionCodes([], ["Auvergne-Rhône-Alpes + Provence-Alpes-Côte d'Azur + Bourgogne-Franche-Comté"]),
    ).toEqual(expected)
    expect(huntingRegionCodes([], ['AURA / PACA ; BFC'])).toEqual(expected)
    expect(huntingRegionCodes([], ['ARA et PACA & Bourgogne Franche Comte'])).toEqual(expected)
  })
  it("l’apostrophe typographique ’ et droite ', les accents, « PACA », « BFC », « Lyon » donnent le même code", () => {
    expect(huntingRegionCodes([], ['Provence-Alpes-Côte d’Azur'])).toEqual(['93'])
    expect(huntingRegionCodes([], ["Provence-Alpes-Côte d'Azur"])).toEqual(['93'])
    expect(huntingRegionCodes([], ['provence alpes cote d azur'])).toEqual(['93'])
    expect(huntingRegionCodes([], ['PACA'])).toEqual(['93'])
    expect(huntingRegionCodes([], ['BFC'])).toEqual(['27'])
    expect(huntingRegionCodes([], ['Lyon'])).toEqual(['84'])
  })
  it('un code INSEE de région écrit tel quel est lu', () => {
    expect(huntingRegionCodes([], ['84', '93', '27'])).toEqual(['84', '93', '27'])
  })
  it('la liste de 4 zones du profil → 3 régions dans la requête, 4 zones lues', () => {
    const zones = ['Auvergne-Rhône-Alpes', 'Provence-Alpes-Côte d’Azur', 'Bourgogne-Franche-Comté', 'Lyon']
    expect(huntingRegionCodes([], zones)).toEqual(['84', '93', '27'])
    expect(unrecognizedZones(zones)).toEqual([])
  })
  it('SAIT DIRE NON : une zone inconnue se NOMME, « National » / « Full remote » ne sont pas des zones inconnues', () => {
    expect(unrecognizedZones(['AURA', 'Atlantide, Lyon', 'National (toute la France)', 'Full remote'])).toEqual([
      'Atlantide',
    ])
    expect(unrecognizedZones(['Venice'])).toEqual(['Venice'])
    expect(unrecognizedZones(null)).toEqual([])
  })
})

describe('Recette 21/10 B.2 — Paris et les grandes métropoles sont dans leur région', () => {
  it.each([
    ['Paris', '11'],
    ['Lille', '32'],
    ['Bordeaux', '75'],
    ['Toulouse', '76'],
    ['Nantes', '52'],
    ['Rennes', '53'],
    ['Strasbourg', '44'],
    ['Rouen', '28'],
    ['Orléans', '24'],
    ['Tours', '24'],
    ['Montpellier', '76'],
  ])('%s donne sa région', (ville, code) => {
    expect(offerTargetRegionCodes([ville])).toEqual([code])
    expect(unrecognizedZones([ville])).toEqual([])
  })
  it('une chaîne inconnue est toujours nommée', () => {
    expect(unrecognizedZones(['Paris', 'Atlantis'])).toEqual(['Atlantis'])
  })
})

describe('Recette 21/10 B.1 — les quatre zones du profil sortent, quelle que soit la forme reçue', () => {
  const quatre = 'Auvergne-Rhône-Alpes, PACA, BFC, Lyon'
  it('chaîne unique : les 3 régions, rien de non reconnu', () => {
    expect(huntingRegionCodes(['AURA'], quatre)).toEqual(['84', '93', '27'])
    expect(unrecognizedZones(quatre)).toEqual([])
  })
  it('liste de libellés du questionnaire : Lyon, Marseille, Paris, Lille', () => {
    const zones = [
      'Lyon & Auvergne-Rhône-Alpes',
      'Marseille & PACA',
      'Paris & Île-de-France',
      'Lille & Hauts-de-France',
    ]
    expect(huntingRegionCodes(['AURA'], zones)).toEqual(['84', '93', '11', '32'])
  })
})

describe('Recette 21/10 S.1 — les Implantations du profil sont des zones de chasse', () => {
  const implantations = ['Auvergne-Rhône-Alpes', "Provence-Alpes-Côte d'Azur", 'Bourgogne-Franche-Comté', 'Lyon']
  it('Zones ∪ Implantations ∪ portefeuille', () => {
    expect(huntingRegionCodes(['AURA'], [], implantations)).toEqual(['84', '93', '27'])
  })
  it('les implantations non reconnues se nomment', () => {
    expect(unrecognizedZones(['AURA'], [], ['Atlantis'])).toEqual(['Atlantis'])
  })
})

describe('Recette 21/10 S.2 — « National » = aucun filtre de région par défaut', () => {
  it('National + Implantations ARA : aucune région, la couverture est nommée', () => {
    const zones = ['National (toute la France)']
    expect(huntingRegionCodes(['AURA'], zones, ['Auvergne-Rhône-Alpes'])).toEqual([])
    expect(coversWholeCountry(['AURA'], zones, ['Auvergne-Rhône-Alpes'])).toBe(true)
  })
  it('sans National : les régions sont posées', () => {
    expect(huntingRegionCodes(['AURA'], ['Lyon & Auvergne-Rhône-Alpes'], [])).toEqual(['84'])
    expect(coversWholeCountry(['AURA'], ['Lyon & Auvergne-Rhône-Alpes'], [])).toBe(false)
  })
  it('« International » et « Full remote » ne valent pas toute la France', () => {
    expect(coversWholeCountry(['International', 'Full remote (pas de contrainte géo)'])).toBe(false)
    expect(huntingRegionCodes(['AURA'], ['International'])).toEqual(['84'])
  })
})

describe('huntingRegionCodes — territoire du client idéal (recette 21/10 U.1)', () => {
  it('« Clients basés en Île-de-France » s’ajoute à l’union des zones de chasse', async () => {
    const { huntingRegionCodes } = await import('./discover-offer-territory')
    expect(huntingRegionCodes(['AURA'], [], [], ['Clients basés en Île-de-France'])).toEqual(['84', '11'])
  })
  it('« National » garde la règle de S : aucune région, même avec un territoire client', async () => {
    const { huntingRegionCodes } = await import('./discover-offer-territory')
    expect(huntingRegionCodes(['National'], [], [], ['Clients basés en Île-de-France'])).toEqual([])
  })
  it('« En région » / « international » ne désignent aucune région du rail : rien n’est posé', async () => {
    const { huntingRegionCodes, clientTerritoryRegionCodes } = await import('./discover-offer-territory')
    expect(huntingRegionCodes([], [], [], ['Clients basés en région'])).toEqual([])
    expect(clientTerritoryRegionCodes(['Clients basés en région']).leftover).toEqual(['Clients basés en région'])
  })
})

describe('#4429 — une valeur non géographique n’est jamais « zone non reconnue »', () => {
  it.each([
    'Siège',
    'siège social',
    'Agences',
    'Sur site',
    'Hybride',
    'Remote',
    'Télétravail',
    'Sans préférence',
    'Indifférent',
    'Europe',
    'Monde',
  ])('« %s » est une zone non restrictive : ignorée, jamais nommée', valeur => {
    expect(unrecognizedZones([valeur])).toEqual([])
    expect(offerTargetRegionCodes([valeur])).toEqual([])
  })
  it('SAIT DIRE NON : une vraie zone inconnue reste nommée à côté de « Siège »', () => {
    expect(unrecognizedZones(['Siège', 'Atlantis'])).toEqual(['Atlantis'])
  })
})

describe('#4816 — Nancy se lit dans le Grand Est', () => {
  it('« Quéven et Nancy » : Nancy résout sa région, Quéven (hors table) reste non devinée', () => {
    expect(offerTargetRegionCodes('Nancy')).toEqual(['44'])
    expect(offerTargetRegionCodes('Quéven')).toEqual([])
  })
})
