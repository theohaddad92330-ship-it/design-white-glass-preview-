import { describe, expect, it } from 'vitest'
import {
  capAdvancedFilters,
  formatPillLabel,
  isDirty,
  MAX_ADVANCED_FILTERS,
  readFilterFromSearch,
  withFilterInSearch,
} from './FilterBar.logic'

/**
 * #1673.1 — LA logique du composant `FilterBar` unique : le libellé d'une
 * pilule, la présence du bouton « Effacer », le plafond des filtres avancés,
 * et le motif URL-comme-source-de-vérité (#1673.2) copié de
 * `app/queues/page.tsx:97,126` puis généralisé ici pour que Clients ET
 * Utilisateurs le réutilisent au lieu d'écrire chacun leur `useState`.
 */

describe('formatPillLabel — un compte non mesuré ne s’affiche jamais « · 0 »', () => {
  it('affiche « libellé · compte » quand le compte est MESURÉ, y compris zéro', () => {
    expect(formatPillLabel({ key: 'tous', label: 'Tous', count: 12 })).toBe('Tous · 12')
    // Un ZÉRO mesuré est un vrai zéro (« aucune alerte en ce moment ») — la
    // doctrine interdit de PRÉTENDRE zéro quand c'est inconnu, pas d'afficher
    // un zéro réel.
    expect(formatPillLabel({ key: 'alertes', label: 'Alertes de churn', count: 0 })).toBe('Alertes de churn · 0')
  })

  it('n’affiche AUCUN compte quand il est `null` — « non mesuré » n’est pas « 0 »', () => {
    expect(formatPillLabel({ key: 'tous', label: 'Tous', count: null })).toBe('Tous')
  })
})

describe('isDirty — le bouton « Effacer » ne s’affiche que si un filtre est actif', () => {
  it('est FAUX sur la valeur par défaut', () => {
    expect(isDirty('tous', 'tous')).toBe(false)
  })

  it('est VRAI dès qu’on s’écarte de la valeur par défaut', () => {
    expect(isDirty('alertes', 'tous')).toBe(true)
  })
})

describe('capAdvancedFilters — le panneau « Filtres avancés » ne dépasse jamais 6 champs', () => {
  it('sait dire NON : au-delà de 6, le surplus est coupé et signalé', () => {
    const huit = Array.from({ length: 8 }, (_, i) => ({ key: `f${i}`, label: `Champ ${i}` }))
    const { fields, truncated } = capAdvancedFilters(huit)
    expect(fields).toHaveLength(MAX_ADVANCED_FILTERS)
    expect(fields.map(f => f.key)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5'])
    expect(truncated).toBe(true)
  })

  it('ne coupe rien sous le plafond — contrôle positif', () => {
    const trois = Array.from({ length: 3 }, (_, i) => ({ key: `f${i}`, label: `Champ ${i}` }))
    const { fields, truncated } = capAdvancedFilters(trois)
    expect(fields).toHaveLength(3)
    expect(truncated).toBe(false)
  })

  it('accepte exactement le plafond sans le déclarer tronqué', () => {
    const six = Array.from({ length: MAX_ADVANCED_FILTERS }, (_, i) => ({ key: `f${i}`, label: `Champ ${i}` }))
    const { fields, truncated } = capAdvancedFilters(six)
    expect(fields).toHaveLength(6)
    expect(truncated).toBe(false)
  })
})

describe('withFilterInSearch — le filtre vit dans l’URL, pas dans un useState (#1673.2)', () => {
  it('ajoute la clé quand la valeur s’écarte du défaut', () => {
    expect(withFilterInSearch('', 'filtre', 'alertes', 'tous')).toBe('filtre=alertes')
  })

  it('retire la clé quand on revient à la valeur par défaut — un lien « par défaut » reste propre', () => {
    expect(withFilterInSearch('filtre=alertes', 'filtre', 'tous', 'tous')).toBe('')
  })

  it('préserve les AUTRES paramètres déjà présents (ex. `search=`)', () => {
    const next = withFilterInSearch('search=acme&filtre=tous', 'filtre', 'suspendus', 'tous')
    const qs = new URLSearchParams(next)
    expect(qs.get('search')).toBe('acme')
    expect(qs.get('filtre')).toBe('suspendus')
  })

  it('sait dire NON : une clé qui n’est pas celle demandée n’est jamais touchée', () => {
    const next = withFilterInSearch('vue=esn', 'filtre', 'actifs', 'tous')
    const qs = new URLSearchParams(next)
    expect(qs.get('vue')).toBe('esn')
  })
})

describe('readFilterFromSearch — une valeur hors liste retombe sur le défaut, jamais sur `undefined`', () => {
  const FILTRES = ['tous', 'actifs', 'suspendus'] as const

  it('lit une valeur valide', () => {
    expect(readFilterFromSearch('filtre=actifs', 'filtre', FILTRES, 'tous')).toBe('actifs')
  })

  it('retombe sur le défaut si la clé est absente', () => {
    expect(readFilterFromSearch('', 'filtre', FILTRES, 'tous')).toBe('tous')
  })

  it('sait dire NON : une valeur inventée (ni dans la liste, ni un espace vide) retombe sur le défaut', () => {
    expect(readFilterFromSearch('filtre=invente-par-lurl', 'filtre', FILTRES, 'tous')).toBe('tous')
  })
})
