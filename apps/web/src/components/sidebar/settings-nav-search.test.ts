import { describe, expect, it } from 'vitest'
import { Settings2, User } from 'lucide-react'
import { filterSettingsSections } from './settings-nav-search'
import type { SidebarSection } from './items'

/**
 * Théo D settings-prefs.N2 — « Rechercher un réglage… » : la recherche filtre
 * les rubriques de la navigation des Réglages, sur leur libellé affiché, sans
 * accent ni casse. Une rubrique ne disparaît jamais sans que la personne l'ait
 * demandé : requête vide = tout.
 */
const SECTIONS: SidebarSection[] = [
  {
    labelKey: 'sections.personal',
    items: [
      { labelKey: 'items.preferences', to: '/settings', icon: Settings2 },
      { labelKey: 'items.profile', to: '/settings/profile', icon: User },
    ],
  },
]
const LABELS: Record<string, string> = { 'items.preferences': 'Préférences', 'items.profile': 'Profil commercial' }
const label = (key: string): string => LABELS[key] ?? key

describe('filterSettingsSections', () => {
  it('une requête vide rend tout, sans toucher à rien', () => {
    expect(filterSettingsSections(SECTIONS, '   ', label)).toBe(SECTIONS)
  })

  it('trouve une rubrique sans tenir compte des accents ni de la casse', () => {
    const found = filterSettingsSections(SECTIONS, 'PREFERENCES', label)
    expect(found).toHaveLength(1)
    expect(found[0]!.items.map(i => i.to)).toEqual(['/settings'])
  })

  it('retire la section entière quand plus aucune de ses rubriques ne correspond', () => {
    expect(filterSettingsSections(SECTIONS, 'zzz', label)).toEqual([])
  })
})
