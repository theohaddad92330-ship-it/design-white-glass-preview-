import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'
import { filterSettingsSections } from '@/components/sidebar/settings-nav-search'
import { settingsNavActiveTarget } from '@/components/sidebar/settings-nav-active'
import { pageTitleKeys } from '@/lib/page-titles'
import fr from '@/i18n/locales/fr/nav.json'
import en from '@/i18n/locales/en/nav.json'
import frRoutes from '@/i18n/locales/fr/routes.json'
import enRoutes from '@/i18n/locales/en/routes.json'

/**
 * GA-94 — LA PAGE DES RACCOURCIS S'ATTEINT EN CLIQUANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET CE QUI L'A RENDUE NÉCESSAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce lot, la liste des raccourcis était une MODALE que `⌘/` ouvrait —
 * c'est-à-dire que le seul endroit qui apprenait les raccourcis n'était
 * atteignable que par un raccourci que rien n'annonçait. Le lot du 29/08 a
 * ajouté une entrée de menu, puis a collé les touches en permanence sur les huit
 * lignes de la barre latérale ; Louis a mesuré le résultat le 30/08 : sept
 * capuchons visibles en continu, « ça pollue l'interface ».
 *
 * La réponse déménage, elle ne disparaît pas : une PAGE dédiée dans Réglages,
 * qui en dit PLUS que les capuchons (la portée de chaque raccourci, ce qu'il
 * fait, où il mène) et qui ne coûte rien tant qu'on ne l'ouvre pas.
 *
 * Une page ne vaut que par le clic qui y mène. `/actions/sequences` est resté
 * orphelin des mois — écran écrit, route déclarée, tests verts, personne pour le
 * trouver. Le mode d'échec est silencieux par construction : rien ne casse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Elle LIT un corpus non vide — la barre de Réglages a bien des entrées.
 * 2. La route EXISTE et l'arbre GÉNÉRÉ la connaît (une route ajoutée sans
 *    régénération est un fichier que le routeur n'a jamais vu).
 * 3. L'entrée est dans la barre de Réglages, section **Personnel** — un
 *    raccourci est un réglage de PERSONNE, pas d'espace : deux commerciaux du
 *    même espace n'ont pas le même clavier ni les mêmes habitudes.
 * 4. Les titres d'onglet et de page existent — sinon l'écran hérite du titre
 *    précédent, ce qu'un autre test du dépôt refuse déjà.
 * 5. Le libellé de l'entrée existe en FR ET en EN.
 *
 * ⚠️ Ce qu'elle ne prétend PAS savoir : si l'entrée est VISIBLE à l'écran (un
 * droit de plan, un repli, une largeur peuvent la cacher). Une garde qui
 * prétendrait le savoir accuserait du code correct — et une garde qui crie sur
 * du comportement correct se désactive dans la semaine. La visibilité RENDUE
 * est prouvée ailleurs, par GA-44, qui monte la page pour de vrai.
 */

const SRC = join(__dirname, '..')
const ROUTE_TREE = join(SRC, 'routeTree.gen.ts')
const ROUTE_FILE = join(SRC, 'routes', 'settings', 'shortcuts.tsx')

/** L'adresse, écrite UNE fois : la recopier la ferait dériver. */
const PAGE_PATH = '/settings/shortcuts'

/** La section où l'entrée doit vivre, au sens de `items.settings.ts`. */
const PERSONAL_SECTION = 'sections.personal'

/** Résout `items.shortcuts` dans un catalogue i18n, ou rend `undefined`. */
function lookup(catalog: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key]
  }, catalog)
}

describe('GA-94 — la page des raccourcis s’atteint en cliquant', () => {
  it('LIT quelque chose — la barre de Réglages n’est pas vide', () => {
    // Sans cette assertion, une barre vidée par erreur rendrait les suivantes
    // muettes plutôt que rouges : le faux zéro silencieux, la cause racine la
    // plus chère du dépôt.
    expect(SETTINGS_SECTIONS.length).toBeGreaterThanOrEqual(2)
    expect(SETTINGS_SECTIONS.flatMap(section => section.items).length).toBeGreaterThanOrEqual(10)
  })

  it('la route existe, et l’arbre GÉNÉRÉ la connaît', () => {
    expect(existsSync(ROUTE_FILE), `${ROUTE_FILE} absent`).toBe(true)
    expect(readFileSync(ROUTE_FILE, 'utf8')).toContain(`createFileRoute('${PAGE_PATH}')`)
    // L'arbre est généré : une route ajoutée sans régénération est un fichier
    // que le routeur n'a jamais vu, et le `<Link to>` ne se type même pas.
    expect(readFileSync(ROUTE_TREE, 'utf8')).toContain(`'${PAGE_PATH}'`)
  })

  it('#4535 — il n’y a PLUS d’entrée de menu dédiée : la page s’atteint par Préférences › Raccourcis', () => {
    const entries = SETTINGS_SECTIONS.flatMap(section => section.items).filter(item => item.to === PAGE_PATH)
    expect(entries, 'l’entrée « Raccourcis clavier » a été retirée du menu (#4535, défait la PR #1255)').toEqual([])
    // La page reste atteignable par ses liens : aide (HelpAndReportsView, HelpAndAboutGroups) et le registre.
    const linkers = [
      join(SRC, 'features', 'feedback', 'HelpAndReportsView.tsx'),
      join(SRC, 'features', 'settings', 'view', 'HelpAndAboutGroups.tsx'),
      join(SRC, 'features', 'shortcuts', 'shortcuts.ts'),
    ]
    for (const file of linkers) expect(readFileSync(file, 'utf8'), file).toContain(PAGE_PATH)
  })

  it('#4535 — sur /settings/shortcuts l’entrée « Préférences » est l’active, et la recherche « raccourcis » y mène', () => {
    expect(settingsNavActiveTarget(PAGE_PATH)).toBe('/settings')
    const labels: Record<string, string> = {
      'items.preferences': 'Préférences',
      'items.shortcuts': 'Raccourcis clavier',
    }
    const found = filterSettingsSections(SETTINGS_SECTIONS, 'raccourcis', key => labels[key] ?? key)
    expect(found.flatMap(section => section.items).map(item => item.to)).toEqual(['/settings'])
  })

  it('l’écran a son titre d’onglet et son titre de page', () => {
    const routeTitles = readFileSync(join(SRC, 'lib', 'route-titles.ts'), 'utf8')
    expect(routeTitles).toContain(`'${PAGE_PATH}'`)
    // ⚠️ Sans entrée EXPLICITE, `PageHeader` retombe sur le préfixe `/settings`
    // et titre la page « Préférences » — un écran qui hérite du titre du
    // précédent, exactement ce qu'un autre test du dépôt refuse.
    expect(pageTitleKeys[PAGE_PATH]).toBe('items.shortcuts')
  })

  it('le libellé et le titre existent en FR et en EN', () => {
    const missing: string[] = []
    for (const [name, catalog] of [
      ['fr', fr],
      ['en', en],
    ] as const) {
      if (typeof lookup(catalog, 'items.shortcuts') !== 'string') missing.push(`${name}:nav.items.shortcuts`)
    }
    for (const [name, catalog] of [
      ['fr', frRoutes],
      ['en', enRoutes],
    ] as const) {
      if (typeof lookup(catalog, 'settingsShortcuts.title') !== 'string') {
        missing.push(`${name}:routes.settingsShortcuts.title`)
      }
    }
    expect(missing).toEqual([])
  })
})
