import { describe, expect, it } from 'vitest'
import navEn from '@/i18n/locales/en/nav.json'
import navFr from '@/i18n/locales/fr/nav.json'
import { OFF_NAV_SCREENS } from './off-nav-screens'
import { NAV_SECTIONS, sectionForPath } from './sections'

/**
 * #4197 (épopée #4191, L6) — AFFAIRES · TALENTS · MISSIONS.
 *
 * Décision de Louis du 14/10/2026 : trois sections de trois onglets chacune.
 * ⚠️ RENVERSÉE pour Affaires et Talents le 19/10/2026 (call refonte UX + QCM,
 * #4340/#4341/#4344/#4349, écrit daté dans `agent_docs/doctrine.md`) :
 * Affaires = le Pipe seul, Talents = le Vivier seul — donc AUCUN onglet (une
 * barre à un onglet est un ornement). Missions garde ses trois onglets. Les URL
 * existantes sont CONSERVÉES : celles qui ont perdu leur onglet redirigent
 * (`tabs-removed-19-10.test.ts`).
 */
type Expected = {
  section: { fr: string; en: string; to: string }
  tabs: readonly { to: string; fr: string; en: string }[]
}
const EXPECTED: Record<'projects' | 'talents' | 'missions', Expected> = {
  projects: { section: { fr: 'Affaires', en: 'Deals', to: '/projects' }, tabs: [] },
  talents: { section: { fr: 'Talents', en: 'Talents', to: '/consultants' }, tabs: [] },
  missions: {
    section: { fr: 'Missions', en: 'Missions', to: '/missions/planification' },
    tabs: [
      // #4491.2 (PR 12C) — les sept onglets V22 du « Cycle Missions et finance ».
      { to: '/missions/planification', fr: 'Planning', en: 'Planning' },
      { to: '/missions/cra', fr: 'Relevés d’activité', en: 'Timesheets' },
      { to: '/missions/notes-de-frais', fr: 'Notes de frais', en: 'Expense reports' },
      { to: '/missions/facturation', fr: 'Prêt à facturer', en: 'Ready to invoice' },
      { to: '/missions/factures', fr: 'Factures', en: 'Invoices' },
      { to: '/missions/encaissements', fr: 'Encaissements', en: 'Collections' },
      { to: '/missions/finance', fr: 'Vue financière', en: 'Financial view' },
    ],
  },
}

function lookup(bundle: Record<string, unknown>, key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle)
  return typeof value === 'string' ? value : undefined
}
const straight = (label: string | undefined) => label?.replace(/’/g, "'")

describe('#4197 / 19/10 — Affaires · Talents · Missions', () => {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const section = NAV_SECTIONS.find(candidate => candidate.key === key)

    it(`${key} : la section porte son nom et ses onglets, dans l’ordre`, () => {
      expect(section, key).toBeDefined()
      expect(lookup(navFr, section!.labelKey)).toBe(expected.section.fr)
      expect(lookup(navEn, section!.labelKey)).toBe(expected.section.en)
      expect(section!.tabs.map(tab => tab.to)).toEqual(expected.tabs.map(tab => tab.to))
      expect(section!.to).toBe(expected.section.to)
    })

    it(`${key} : les libellés sont exacts, en français ET en anglais`, () => {
      section!.tabs.forEach((tab, index) => {
        expect(straight(lookup(navFr, tab.labelKey)), tab.to).toBe(straight(expected.tabs[index]!.fr))
        expect(straight(lookup(navEn, tab.labelKey)), tab.to).toBe(straight(expected.tabs[index]!.en))
      })
    })

    it(`${key} : plus de groupes déroulants`, () => {
      expect(section!.groups).toBeUndefined()
      expect(section!.tabs.every(tab => tab.group === undefined)).toBe(true)
    })
  }

  it('compte SEPT onglets sur les trois sections — ceux de Missions (V22, #4491.2)', () => {
    const total = ['projects', 'talents', 'missions']
      .map(key => NAV_SECTIONS.find(section => section.key === key)!.tabs.length)
      .reduce((sum, count) => sum + count, 0)
    expect(total).toBe(7) // #4491.2 (PR 12C) — le cycle V22 ; avant : #4344/#4349 — Affaires et Talents sans onglet ; #4351.1 — Missions : Planning + Facturation ; Théo C — + Notes de frais
  })

  it('« Besoins ouverts » vit sous Affaires, et la fiche d’un besoin y reste (#4344)', () => {
    expect(sectionForPath('/projects/needs')?.section.key).toBe('projects')
    expect(sectionForPath('/projects/needs/abc')?.section.key).toBe('projects')
    expect(sectionForPath('/projects/abc')?.section.key).toBe('projects')
    expect(sectionForPath('/consultants/abc')?.section.key).toBe('talents')
  })

  it('les écrans sortis de la barre restent dans Missions (off-nav) — aucun n’est perdu', () => {
    const offNav = OFF_NAV_SCREENS.filter(screen => screen.sectionKey === 'missions').map(screen => screen.route)
    // #4491.2 (PR 12C) — relevés, factures, encaissements et vue financière sont redevenus des ONGLETS.
    for (const route of ['/missions/cra', '/missions/factures', '/missions/encaissements', '/missions/finance']) {
      expect(offNav, route).not.toContain(route)
      expect(sectionForPath(route)?.activeTab, route).toBe(route)
    }
    for (const route of [
      '/missions/adv',
      '/expenses/bareme',
      '/missions/suivi',
      '/pilotage/rex',
      '/missions/nouvelle',
    ]) {
      expect(offNav, route).toContain(route)
      expect(sectionForPath(route)?.section.key, route).toBe('missions')
    }
  })
})
