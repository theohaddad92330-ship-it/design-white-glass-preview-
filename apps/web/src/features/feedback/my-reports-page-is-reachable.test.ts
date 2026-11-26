import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'
import { pageTitleKeys } from '@/lib/page-titles'
import frNav from '@/i18n/locales/fr/nav.json'
import enNav from '@/i18n/locales/en/nav.json'
import frRoutes from '@/i18n/locales/fr/routes.json'
import enRoutes from '@/i18n/locales/en/routes.json'

/**
 * #1960.10 — « MES SIGNALEMENTS » S'ATTEINT EN CLIQUANT, par ses deux portes.
 *
 * Une page ne vaut que par le clic qui y mène : `/actions/sequences` est resté
 * orphelin des mois — écran écrit, route déclarée, tests verts, personne pour
 * le trouver. Même modèle que GA-94 (la page des raccourcis).
 *
 * Les deux portes : la barre de Réglages (section Personnel, juste après « Mes
 * données ») et le dialogue du widget, une fois le signalement envoyé.
 */

const SRC = join(__dirname, '..', '..')
const ROUTE_TREE = join(SRC, 'routeTree.gen.ts')
const ROUTE_FILE = join(SRC, 'routes', 'settings', 'mes-signalements.tsx')
const WIDGET = join(SRC, 'features', 'feedback', 'FeedbackWidget.tsx')

/** L'adresse, écrite UNE fois : la recopier la ferait dériver. */
const PAGE_PATH = '/settings/mes-signalements'

function lookup(catalog: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key]
  }, catalog)
}

describe('#1960.10 — Mes signalements s’atteint en cliquant', () => {
  it('LIT quelque chose — la barre de Réglages n’est pas vide', () => {
    expect(SETTINGS_SECTIONS.flatMap(section => section.items).length).toBeGreaterThanOrEqual(10)
  })

  it('la route existe, et l’arbre GÉNÉRÉ la connaît', () => {
    expect(existsSync(ROUTE_FILE), `${ROUTE_FILE} absent`).toBe(true)
    expect(readFileSync(ROUTE_FILE, 'utf8')).toContain(`createFileRoute('${PAGE_PATH}')`)
    expect(readFileSync(ROUTE_TREE, 'utf8')).toContain(`'${PAGE_PATH}'`)
  })

  it('une entrée de la section PERSONNEL y mène, juste après « Mes données »', () => {
    const personal = SETTINGS_SECTIONS.find(section => section.labelKey === 'sections.personal')
    const routes = personal?.items.map(item => String(item.to)) ?? []
    expect(routes, `entrées vues : ${routes.join(', ')}`).toContain(PAGE_PATH)
    expect(routes[routes.indexOf(PAGE_PATH) - 1]).toBe('/settings/mes-donnees')
    const entry = personal?.items.find(item => item.to === PAGE_PATH)
    expect(entry?.labelKey).toBe('items.myReports')
    // Un signalement est personnel : aucune restriction de rôle ne s'y applique.
    expect(entry?.managerOnly).toBeFalsy()
  })

  it('le dialogue du widget y mène une fois le signalement envoyé', () => {
    expect(readFileSync(WIDGET, 'utf8')).toContain(`to="${PAGE_PATH}"`)
  })

  it('l’écran a son titre d’onglet et son titre de page', () => {
    expect(readFileSync(join(SRC, 'lib', 'route-titles.ts'), 'utf8')).toContain(`'${PAGE_PATH}'`)
    expect(pageTitleKeys[PAGE_PATH]).toBe('items.myReports')
  })

  it('le libellé et le titre existent en FR et en EN', () => {
    const missing: string[] = []
    for (const [name, catalog] of [
      ['fr', frNav],
      ['en', enNav],
    ] as const) {
      if (typeof lookup(catalog, 'items.myReports') !== 'string') missing.push(`${name}:nav.items.myReports`)
    }
    for (const [name, catalog] of [
      ['fr', frRoutes],
      ['en', enRoutes],
    ] as const) {
      if (typeof lookup(catalog, 'settingsMyReports.title') !== 'string') {
        missing.push(`${name}:routes.settingsMyReports.title`)
      }
    }
    expect(missing).toEqual([])
  })
})
