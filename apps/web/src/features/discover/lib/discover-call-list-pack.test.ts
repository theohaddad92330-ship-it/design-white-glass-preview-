import { describe, expect, it } from 'vitest'
import { orderCallListByPack } from './discover-call-list-pack'
import type { DiscoverSignal } from './discover-types'

// LUDOVIC-C LC.3 — Liste d'appels AURA en prod (19/10) : Enedis, France Travail, La Poste, Orange,
// SNCF, Ville de Paris, Carrefour, triées par TAILLE, pour un pack industriel.
type C = { name: string; nafCode: string | null; signals: DiscoverSignal[] }
const c = (name: string, nafCode: string, signals: Array<{ type: string; label: string }> = []): C => ({
  name,
  nafCode,
  signals: signals as unknown as DiscoverSignal[],
})
const bySize = [
  c('France Travail', '84.13Z'),
  c('Ville de Paris', '84.11Z'),
  c('Carrefour', '47.11F'),
  c('Enedis', '35.13Z'),
  c('Dalkia', '35.30Z'),
  c('STILL', '28.22Z', [{ type: 'hiring', label: 'Recrutement technicien après-vente' }]),
]
const profile = { placedRoles: ['technicien après-vente'], noGoSectors: [] }

describe('LC.3 — orderCallListByPack', () => {
  it('pack industriel : administrations et distribution écartées (comptées), signal dans SES métiers d’abord, puis secteur ciblé, puis taille', () => {
    const { kept, outOfPack } = orderCallListByPack(bySize, {
      industrial: true,
      targetSectors: ['power_grid_distribution'],
      relevanceProfile: profile,
    })
    expect(kept.map(k => k.name)).toEqual(['STILL', 'Enedis', 'Dalkia'])
    expect(outOfPack).toBe(3)
  })

  it('un profil qui CIBLE le secteur public le garde', () => {
    const { kept } = orderCallListByPack(bySize, {
      industrial: true,
      targetSectors: ['public_sector'],
      relevanceProfile: profile,
    })
    expect(kept.map(k => k.name)).toContain('France Travail')
  })

  it('dit NON hors pack industriel : liste inchangée, rien écarté', () => {
    const { kept, outOfPack } = orderCallListByPack(bySize, {
      industrial: false,
      targetSectors: [],
      relevanceProfile: profile,
    })
    expect(kept).toEqual(bySize)
    expect(outOfPack).toBe(0)
  })
})

// LUDOVIC-E LC.3 — recette prod 20/10 : « 2 entreprises hors pack écartées », mais Carrefour Proximité
// (signal « Gérant de Magasin »), « Député employeur de collaborateurs » et La Poste (« Chargé de
// clientèle ») restaient : le filtre ne lisait que le NAF, absent ou hors table sur ces trois fiches.
describe('LC.3b — le pack lit aussi le nom et le métier du signal', () => {
  const industrial = { industrial: true, targetSectors: ['power_grid_distribution'], relevanceProfile: profile }
  const list = [
    c('CARREFOUR PROXIMITE FRANCE', '', [{ type: 'hiring', label: 'Gérant de Magasin' }]),
    c('DEPUTE EMPLOYEUR DE COLLABORATEURS', '94.92Z'),
    c('LA POSTE', '53.10A', [{ type: 'hiring', label: 'Chargé de clientèle' }]),
    c('EDF', '35.11Z'),
    c('STILL', '28.22Z', [{ type: 'hiring', label: 'Recrutement technicien après-vente' }]),
  ]
  it('écarte distribution, parlementaire et service public par le NOM ou le NAF, et les compte', () => {
    const { kept, outOfPack } = orderCallListByPack(
      list.map(item => (item.nafCode === '' ? { ...item, nafCode: null } : item)),
      industrial,
    )
    expect(kept.map(k => k.name)).toEqual(['STILL', 'EDF'])
    expect(outOfPack).toBe(3)
  })
  it('EDF sans signal ne passe pas devant une entreprise qui recrute dans ses métiers, même sans métier déclaré', () => {
    const deduced = {
      placedRoles: [],
      noGoSectors: [],
      inferredPlacedRoles: [{ role: 'technicien après-vente', terms: ['après-vente'] }],
    }
    const { kept } = orderCallListByPack([c('EDF', '35.11Z'), list[4]!], {
      ...industrial,
      relevanceProfile: deduced,
    })
    expect(kept.map(k => k.name)).toEqual(['STILL', 'EDF'])
  })
  it('un signal HORS métiers ne fait pas passer une entreprise devant', () => {
    const { kept } = orderCallListByPack(
      [c('ACME', '28.22Z', [{ type: 'hiring', label: 'Chargé de clientèle' }]), c('ENEDIS', '35.13Z')],
      industrial,
    )
    expect(kept.map(k => k.name)).toEqual(['ENEDIS', 'ACME'])
  })
  it('profil qui cible le commerce de détail : Carrefour reste', () => {
    const { kept } = orderCallListByPack([c('CARREFOUR PROXIMITE FRANCE', '47.11F')], {
      ...industrial,
      targetSectors: ['retail'],
    })
    expect(kept).toHaveLength(1)
  })
})
