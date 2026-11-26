import { describe, expect, it } from 'vitest'
import enNav from '../../i18n/locales/en/nav.json'
import frNav from '../../i18n/locales/fr/nav.json'
import { NAV_SECTIONS } from './sections'

// Décision Louis 14/10/2026 (#4163) : la barre d'Actions s'écrivait « Aujourd'hui / Séquences / Automatisations ».
// Décision Louis 19/10/2026 (#4357.1) : Séquences et Automatisations ne font plus qu'UN parcours.
// ⚠️ RENVERSÉ le 22/10/2026 (lot r22-ecran-c1, maquettes Théo V22, `agent_docs/doctrine.md`) côté NAVIGATION :
// la barre s'écrit « À traiter / Séquences / Automatisations » ; le moteur reste commun.
describe('onglets d’Actions (#4163)', () => {
  const actions = NAV_SECTIONS.find(section => section.key === 'actions')
  const labels = (nav: typeof frNav): string[] =>
    (actions?.tabs ?? [])
      .map(tab => (nav.tabs as Record<string, string>)[tab.labelKey.replace('tabs.', '')])
      .filter((label): label is string => typeof label === 'string')

  it('le premier onglet est « À traiter » (Théo C actions-aujourdhui.R6)', () => {
    expect(labels(frNav)[0]).toBe('À traiter')
    expect(labels(enNav as typeof frNav)[0]).toBe('To do')
  })

  it('la barre est EXACTEMENT « À traiter / Séquences / Automatisations », dans les deux langues', () => {
    expect(labels(frNav)).toEqual(['À traiter', 'Séquences', 'Automatisations'])
    expect(labels(enNav as typeof frNav)).toEqual(['To do', 'Sequences', 'Automations'])
    expect((actions?.tabs ?? []).map(tab => tab.to)).toEqual([
      '/actions',
      '/actions/sequences',
      '/actions/automatisations',
    ])
  })
})
