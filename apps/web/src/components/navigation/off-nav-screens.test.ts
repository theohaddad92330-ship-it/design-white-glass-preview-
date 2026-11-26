import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OFF_NAV_SCREENS, offNavRoutes, type OffNavScreen } from './off-nav-screens'
import { allNavRoutes, NAV_SECTIONS, sectionForPath } from './sections'

/**
 * #2151.1 / #2151.26 — LA DÉCLARATION DES ÉCRANS HORS NAVIGATION SE TIENT.
 *
 * `off-nav-screens.ts` est la seule liste dont partent trois dérivations : la
 * liste blanche de liens de Laura (`appRouteTarget`), l'allumage de la barre
 * (`sectionForPath`) et les deux gardes Python qui relisent la navigation du web
 * sur le disque. Une liste fausse ne casse donc pas un écran, elle en casse
 * trois — dont deux en SILENCE (un lien qui ne s'ouvre pas, une barre éteinte).
 *
 * Les trois preuves que CLAUDE.md exige d'une garde :
 *  - elle LIT quelque chose (le routeur du disque, le modèle de sections) ;
 *  - elle sait dire NON (chaque règle est jouée sur une déclaration fabriquée) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas (une route de nav normale, une
 *    fiche, une route de backoffice restent ce qu'elles sont).
 */

const ROUTE_TREE = join(__dirname, '..', '..', 'routeTree.gen.ts')

/** Les chemins que le routeur SERT réellement, lus dans l'arbre généré. */
function servedRoutes(): Set<string> {
  const source = readFileSync(ROUTE_TREE, 'utf8')
  const found = new Set<string>()
  for (const match of source.matchAll(/fullPath: '([^']*)'/g)) {
    const path = String(match[1])
    found.add(path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path)
  }
  return found
}

/** Ce que la déclaration promet et que le reste du dépôt doit pouvoir tenir. */
function problems(screens: readonly OffNavScreen[], served: Set<string>, nav: string[]): string[] {
  const out: string[] = []
  for (const screen of screens) {
    if (!served.has(screen.route)) out.push(`route non servie par le routeur : ${screen.route}`)
    if (!NAV_SECTIONS.some(section => section.key === screen.sectionKey)) {
      out.push(`section inconnue pour ${screen.route} : ${screen.sectionKey}`)
    }
    if (nav.includes(screen.route)) out.push(`revenue dans la navigation, à retirer d'ici : ${screen.route}`)
  }
  return out
}

describe('les écrans servis hors navigation', () => {
  it('lit un corpus non vide — le routeur du disque et le modèle de sections', () => {
    expect(servedRoutes().size).toBeGreaterThan(50)
    expect(NAV_SECTIONS.length).toBeGreaterThan(5)
    expect(offNavRoutes()).toContain('/accounts/partners')
  })

  it('ne déclare que des écrans SERVIS, rangés sous une section réelle, et absents de la nav', () => {
    expect(problems(OFF_NAV_SCREENS, servedRoutes(), allNavRoutes())).toEqual([])
  })

  it('dit NON à une route que le routeur ne sert pas', () => {
    const fabrique = [{ route: '/route-inventee-pour-la-preuve', sectionKey: 'accounts' }]
    expect(problems(fabrique, servedRoutes(), allNavRoutes())).toEqual([
      'route non servie par le routeur : /route-inventee-pour-la-preuve',
    ])
  })

  it('dit NON à une section devinée', () => {
    const fabrique = [{ route: '/accounts/partners', sectionKey: 'section-qui-nexiste-pas' }]
    expect(problems(fabrique, servedRoutes(), allNavRoutes())).toEqual([
      'section inconnue pour /accounts/partners : section-qui-nexiste-pas',
    ])
  })

  it('dit NON à un écran revenu dans la navigation — la déclaration serait périmée', () => {
    const fabrique = [{ route: '/contacts', sectionKey: 'accounts' }]
    expect(problems(fabrique, servedRoutes(), allNavRoutes())).toEqual([
      "revenue dans la navigation, à retirer d'ici : /contacts",
    ])
  })

  it('allume l’entrée de la section — un écran sorti de la nav dit toujours OÙ l’on est', () => {
    for (const screen of OFF_NAV_SCREENS) {
      expect(sectionForPath(screen.route)?.section.key, screen.route).toBe(screen.sectionKey)
    }
  })

  it('n’attrape pas ce qu’elle ne vise pas — hors nav ne veut pas dire hors modèle', () => {
    // Une route de nav garde sa section, une fiche garde celle de sa liste, et
    // une route que le modèle ne possède pas rend toujours `null`.
    expect(sectionForPath('/contacts')?.activeTab).toBe('/contacts')
    expect(sectionForPath('/accounts/abc-123')?.section.key).toBe('accounts')
    expect(sectionForPath('/bak/home')).toBeNull()
    expect(sectionForPath('/watchlist-archive')).toBeNull()
  })
})
