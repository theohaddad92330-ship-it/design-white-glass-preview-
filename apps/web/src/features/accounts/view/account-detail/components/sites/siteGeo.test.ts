import { beforeAll, describe, expect, it } from 'vitest'
import { loadCommuneCoordinates } from '@/lib/zones/commune-coordinates'
import {
  countSites,
  countUnplottedSites,
  mergeRows,
  normaliseBranches,
  normaliseClaudeSites,
  pageOfCities,
} from './siteGeo'

// #5069 — les coordonnées d'une ville viennent du référentiel chargé à la demande : on l'attend une fois.
beforeAll(async () => {
  await loadCommuneCoordinates()
})

describe('normaliseClaudeSites', () => {
  it('keeps a site whose city is set', () => {
    const rows = normaliseClaudeSites([{ city: 'Lyon', type: 'bureau' }])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.city).toBe('Lyon')
  })

  it('drops noise cities so a placeholder is never counted as a site', () => {
    expect(normaliseClaudeSites([{ city: 'Non identifié' }, { city: '-' }, { city: '' }])).toHaveLength(0)
  })

  it('derives the region from a postal code when the model did not name one', () => {
    // Regression: the sites tab showed "Régions 0" while listing sites, because
    // Claude sites only carried a region when the model happened to emit one.
    const rows = normaliseClaudeSites([{ city: 'Lyon', postal_code: '69003' }])
    expect(rows[0]?.region).toBe('Auvergne-Rhône-Alpes')
  })

  it('derives the region from a known city when there is no postal code', () => {
    const rows = normaliseClaudeSites([{ city: 'Bordeaux' }])
    expect(rows[0]?.region).toBe('Nouvelle-Aquitaine')
  })

  it('prefers an explicit region over the derived one', () => {
    const rows = normaliseClaudeSites([{ city: 'Lyon', postal_code: '69003', region: 'Région déclarée' }])
    expect(rows[0]?.region).toBe('Région déclarée')
  })

  it('leaves the region null when nothing allows deriving it', () => {
    expect(normaliseClaudeSites([{ city: 'Villeneuve-sur-Zzz' }])[0]?.region).toBeNull()
  })

  // #2966 (#2119.57) — une présence observée par le modèle (jamais le registre
  // légal) est une INFÉRENCE : elle se marque comme telle et ne devient jamais
  // un établissement officiel, quoi que le modèle ait écrit dans `type`.
  it('marks every Claude site as inferred', () => {
    expect(normaliseClaudeSites([{ city: 'Lyon' }])[0]?.source).toBe('inferred')
  })

  it('never lets an inferred site claim to be the headquarters, even when the model says "siège"', () => {
    const rows = normaliseClaudeSites([{ city: 'Lyon', type: 'siège' }])
    expect(rows[0]?.is_headquarters).toBe(false)
  })
})

describe('normaliseBranches', () => {
  // #2966 (#2119.57) — le pendant du test ci-dessus : une branche du registre
  // légal (Pappers) est la vérité établie, jamais une inférence.
  it('marks every branch as registry-sourced', () => {
    expect(normaliseBranches([{ city: 'Lyon' }])[0]?.source).toBe('registry')
  })
})

describe('mergeRows', () => {
  it('keeps a Claude site that has no matching Pappers branch', () => {
    // Regression: mergeRows only wrote back rows that ALREADY existed on the
    // Pappers side, so a Claude-only site was silently dropped — the table said
    // "aucun site" while the header counted them.
    const merged = mergeRows([], normaliseClaudeSites([{ city: 'Lyon' }, { city: 'Lille' }]))
    expect(merged.map(row => row.city).sort()).toEqual(['Lille', 'Lyon'])
  })

  it('#4326.2 — un site sans coordonnées reste listé (coordonnées nulles, jamais inventées)', () => {
    const merged = mergeRows([], normaliseClaudeSites([{ city: 'Quimperlé-sur-Test' }]))
    expect(merged).toHaveLength(1)
    expect(merged[0]?.latitude).toBeNull()
    expect(merged[0]?.longitude).toBeNull()
  })

  it('merges a Claude site into the matching branch instead of duplicating it', () => {
    const branches = normaliseBranches([{ city: 'Lyon', postal_code: '69003', is_headquarters: true }])
    const merged = mergeRows(branches, normaliseClaudeSites([{ city: 'lyon', type: 'bureau' }]))
    expect(merged).toHaveLength(1)
    expect(merged[0]?.type).toBe('bureau')
    expect(merged[0]?.region).toBe('Auvergne-Rhône-Alpes')
  })

  it('returns every distinct city across both sources', () => {
    const branches = normaliseBranches([{ city: 'Paris', postal_code: '75001' }])
    const merged = mergeRows(branches, normaliseClaudeSites([{ city: 'Lyon' }]))
    expect(merged).toHaveLength(2)
  })

  // #2966 (#2119.57) — une inférence sur une ville déjà au registre reste ce
  // qu'elle a toujours été : un établissement ÉTABLI, pas une inférence.
  it('keeps a merged site registry-sourced, even when Claude also names the city', () => {
    const branches = normaliseBranches([{ city: 'Lyon', postal_code: '69003', is_headquarters: true }])
    const merged = mergeRows(branches, normaliseClaudeSites([{ city: 'lyon', type: 'bureau' }]))
    expect(merged[0]?.source).toBe('registry')
  })

  // #2966 (#2119.57) — une ville que SEUL le modèle nomme reste une inférence
  // après la fusion : c'est elle qui doit rester marquée à l'écran.
  it('keeps a Claude-only site inferred after merging', () => {
    const branches = normaliseBranches([{ city: 'Paris', postal_code: '75001' }])
    const merged = mergeRows(branches, normaliseClaudeSites([{ city: 'Lyon' }]))
    expect(merged.find(row => row.city === 'Lyon')?.source).toBe('inferred')
  })
})

describe('#4326 — tous les établissements comptent', () => {
  it('compte chaque établissement du registre, pas seulement une ligne par ville', () => {
    const branches = normaliseBranches([
      { city: 'Paris', postal_code: '75001' },
      { city: 'Paris', postal_code: '75008' },
      { city: 'Brest', postal_code: '29200' },
    ])
    const merged = mergeRows(branches, [])
    expect(merged).toHaveLength(2)
    expect(countSites(merged)).toBe(3)
  })

  it('une ligne du modèle compte pour un site, sauf si la ville est déjà au registre', () => {
    const branches = normaliseBranches([{ city: 'Lyon', postal_code: '69003' }])
    const merged = mergeRows(branches, normaliseClaudeSites([{ city: 'Lyon' }, { city: 'Lille' }]))
    expect(countSites(merged)).toBe(2)
  })

  it('déduit la région du code postal lu dans les notes d’un site officiel', () => {
    const rows = normaliseClaudeSites([{ city: 'Quimper', notes: 'CP 29000 · source officielle' }])
    expect(rows[0]?.region).toBe('Bretagne')
  })

  it('ne devine pas une région sans code postal ni ville connue', () => {
    expect(normaliseClaudeSites([{ city: 'Quimperlé-sur-Test' }])[0]?.region).toBeNull()
  })
})

// #4326.1 — Paris et Bordeaux disparaissaient de la liste et de la carte d'un compte à 525 sites.
describe('#4326.1 — une ville ne disparaît ni de la liste ni de la carte', () => {
  const parisienne = (label: string, postal: string) => ({ city: label, postal_code: postal })

  it('regroupe les arrondissements parisiens (et le CEDEX) en UNE ligne « Paris », placée sur la carte', () => {
    const merged = mergeRows(
      normaliseBranches([
        parisienne('PARIS 8E ARRONDISSEMENT', '75008'),
        parisienne('Paris 08', '75008'),
        parisienne('PARIS CEDEX 09', '75009'),
        parisienne('Paris', '75001'),
      ]),
      [],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.city).toBe('Paris')
    expect(merged[0]?.establishments).toBe(4)
    expect(merged[0]?.latitude).not.toBeNull()
  })

  it('rapproche « BORDEAUX », « Bordeaux Cedex » et un accent différent de la même ville', () => {
    const merged = mergeRows(
      normaliseBranches([parisienne('BORDEAUX', '33000'), parisienne('Bordeaux Cedex', '33071')]),
      normaliseClaudeSites([{ city: 'bordeaux' }]),
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.latitude).not.toBeNull()
  })

  it('ne confond pas une ville dont le nom finit par un chiffre ordinaire avec un arrondissement', () => {
    const merged = mergeRows(normaliseBranches([parisienne('Saint-Ouen', '93400'), parisienne('Paris', '75001')]), [])
    expect(merged.map(row => row.city).sort()).toEqual(['Paris', 'Saint-Ouen'])
  })

  it('plus de 300 sites : aucune ville ne tombe, la pagination de la liste les couvre toutes', () => {
    const many = Array.from({ length: 420 }, (_, i) => parisienne(`Commune-${String(i).padStart(3, '0')}`, '29200'))
    // Paris et Bordeaux arrivent TARD dans l'ordre du registre — jamais en première page.
    const branches = [...many, parisienne('PARIS 8E ARRONDISSEMENT', '75008'), parisienne('BORDEAUX', '33000')]
    const merged = mergeRows(normaliseBranches(branches), [])
    expect(merged).toHaveLength(422)
    expect(countSites(merged)).toBe(422)
    const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(page => pageOfCities(merged, page, 50))
    const listed = pages.flatMap(page => page.rows.map(row => row.city))
    expect(new Set(listed).size).toBe(422)
    expect(listed).toContain('Paris')
    expect(listed).toContain('Bordeaux')
    expect(pages[0]?.totalPages).toBe(9)
  })

  it('dit combien de SITES ne sont pas placés sur la carte, pas combien de villes', () => {
    const merged = mergeRows(
      normaliseBranches([
        parisienne('Paris', '75001'),
        parisienne('Quimperlé-sur-Test', '29300'),
        parisienne('Quimperlé-sur-Test', '29300'),
        parisienne('Quimperlé-sur-Test', '29300'),
      ]),
      [],
    )
    expect(countUnplottedSites(merged)).toBe(3)
  })
})
