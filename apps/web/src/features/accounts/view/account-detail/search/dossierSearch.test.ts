import { describe, expect, it } from 'vitest'
import { TAB_KEYS, sectionOfTab } from '../components/AccountDetailTabsBar'
import {
  DOSSIER_SEARCH_KINDS,
  dossierItemAnchorId,
  dossierItemRef,
  parseDossierItemRef,
  searchDossier,
  tabOfKind,
  type DossierSearchItem,
} from './dossierSearch'

const item = (overrides: Partial<DossierSearchItem> & Pick<DossierSearchItem, 'kind' | 'id' | 'label'>) =>
  ({ context: null, date: null, ...overrides }) satisfies DossierSearchItem

/**
 * #2128.31-49 — LE SOCLE : UN INDEX TRANSVERSAL DU DOSSIER.
 *
 * Onze points du registre disaient « ABSENT parce que la recherche transversale
 * est absente ». Ce fichier tient ce socle-là, une fois : dix types d'objets,
 * six champs par résultat, une seule fonction de recherche.
 */
describe('searchDossier — la recherche transversale du dossier (#2128.31)', () => {
  const items: DossierSearchItem[] = [
    item({ kind: 'contact', id: 'c1', label: 'Sarah Martin', context: 'DSI · Équipe data', date: '2026-09-01' }),
    item({ kind: 'signal', id: 's1', label: 'Levée de fonds série B', context: 'Presse', date: '2026-08-20' }),
    item({ kind: 'project', id: 'p1', label: 'Migration data cloud', context: 'En cours', date: '2026-07-10' }),
    item({ kind: 'mission', id: 'm1', label: 'Refonte ERP', context: 'Équipe data', date: '2026-09-10' }),
    item({ kind: 'proof', id: 'pr1', label: 'REX datalake', context: null, date: null }),
  ]

  it('rend une liste vide sur une requête vide ou blanche — rien ne s’affiche avant de taper', () => {
    expect(searchDossier(items, '')).toEqual([])
    expect(searchDossier(items, '   ')).toEqual([])
  })

  it('plie la casse ET les accents — « equipe » trouve « Équipe »', () => {
    const ids = searchDossier(items, 'EQUIPE').map(result => result.id)
    expect(ids.sort()).toEqual(['c1', 'm1'])
  })

  it('exige CHAQUE mot — « data martin » ne rend que Sarah Martin', () => {
    expect(searchDossier(items, 'data martin').map(result => result.id)).toEqual(['c1'])
  })

  it('classe le libellé qui COMMENCE par la requête avant celui qui la contient, puis le contexte seul', () => {
    const ranked = searchDossier(
      [
        item({ kind: 'project', id: 'context-only', label: 'Refonte', context: 'data' }),
        item({ kind: 'project', id: 'contains', label: 'Migration data' }),
        item({ kind: 'project', id: 'prefix', label: 'Data platform' }),
      ],
      'data',
    ).map(result => result.id)
    expect(ranked).toEqual(['prefix', 'contains', 'context-only'])
  })

  it('à pertinence égale, le plus RÉCENT d’abord et le non daté en dernier — jamais une date inventée', () => {
    const ranked = searchDossier(
      [
        item({ kind: 'signal', id: 'undated', label: 'Cloud' }),
        item({ kind: 'signal', id: 'old', label: 'Cloud', date: '2026-01-01' }),
        item({ kind: 'signal', id: 'recent', label: 'Cloud', date: '2026-09-01' }),
      ],
      'cloud',
    )
    expect(ranked.map(result => result.id)).toEqual(['recent', 'old', 'undated'])
    expect(ranked[2]?.date).toBeNull()
  })

  it('chaque résultat porte son type, son libellé, son contexte, sa date, sa section et sa sous-partie (#2128.44-48)', () => {
    const [result] = searchDossier(items, 'levée')
    expect(result).toEqual({
      kind: 'signal',
      id: 's1',
      label: 'Levée de fonds série B',
      context: 'Presse',
      date: '2026-08-20',
      tab: 'veille',
      section: 'opportunities',
    })
  })

  it('borne le nombre de résultats', () => {
    const many = Array.from({ length: 40 }, (_, index) => item({ kind: 'action', id: `a${index}`, label: 'Relancer' }))
    expect(searchDossier(many, 'relancer')).toHaveLength(20)
    expect(searchDossier(many, 'relancer', 5)).toHaveLength(5)
  })
})

describe('les dix types couverts (#2128.34-43)', () => {
  it('nomme exactement les dix types du retour', () => {
    expect([...DOSSIER_SEARCH_KINDS]).toEqual([
      'contact',
      'entity',
      'signal',
      'project',
      'need',
      'mission',
      'action',
      'proof',
      'history',
      'source',
    ])
  })

  it('chaque type vit dans une sous-partie qui EXISTE, donc dans une section du dossier', () => {
    for (const kind of DOSSIER_SEARCH_KINDS) {
      expect(TAB_KEYS as readonly string[]).toContain(tabOfKind(kind))
    }
    expect(sectionOfTab(tabOfKind('contact'))).toBe('people')
    expect(sectionOfTab(tabOfKind('history'))).toBe('historyProofs')
    expect(sectionOfTab(tabOfKind('entity'))).toBe('perimeters')
  })
})

describe('le lien stable d’un objet du dossier (#2128.50)', () => {
  it('fait l’aller-retour type:identifiant', () => {
    const ref = dossierItemRef({ kind: 'mission', id: 'abc-123' })
    expect(ref).toBe('mission:abc-123')
    expect(parseDossierItemRef(ref)).toEqual({ kind: 'mission', id: 'abc-123' })
  })

  it('garde un identifiant qui contient lui-même un deux-points', () => {
    expect(parseDossierItemRef('source:https://example.org/a')).toEqual({ kind: 'source', id: 'https://example.org/a' })
  })

  it('refuse un type inconnu, un identifiant vide ou une valeur qui n’est pas une chaîne', () => {
    expect(parseDossierItemRef('pirate:1')).toBeUndefined()
    expect(parseDossierItemRef('contact:')).toBeUndefined()
    expect(parseDossierItemRef('contact')).toBeUndefined()
    expect(parseDossierItemRef(42)).toBeUndefined()
  })

  it('pose une ancre HTML valide, préfixée comme les sous-parties (`dossier-`)', () => {
    expect(dossierItemAnchorId({ kind: 'source', id: 'https://example.org/a b' })).toMatch(
      /^dossier-source-[A-Za-z0-9_-]+$/,
    )
    expect(dossierItemAnchorId({ kind: 'contact', id: 'c1' })).toBe('dossier-contact-c1')
  })
})
