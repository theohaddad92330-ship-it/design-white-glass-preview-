import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COCKPIT, NAV_SECTIONS, resolveEnvironment } from '../app/_components/nav-sections'

/**
 * #1644 (le rail à 6 sections) et #1675 (l'identité de l'environnement servi).
 *
 * Les deux tiennent dans la même garde parce qu'ils tiennent dans la même
 * coque : ce que l'opérateur voit en permanence, où qu'il soit dans la console.
 *
 * LE POINT QUI COMPTE — aucun lien mort. #1644 liste sous chaque section des
 * entrées qui n'existent pas encore (« MRR », « Adoption », « Audit »). Les
 * afficher aurait donné un rail dont un tiers mène à un 404, et un lien mort
 * apprend à se méfier du rail entier. La garde mesure donc chaque href contre
 * le SYSTÈME DE FICHIERS, pas contre une liste recopiée à la main : une liste
 * ne voit jamais la route qu'on ajoutera demain.
 */

const APP = fileURLToPath(new URL('../app/', import.meta.url))

/** La barre horizontale d'avant le rail — ce qui ne doit RIEN perdre. */
const ANCIENNE_NAV = [
  '/monitoring',
  '/clients',
  '/facturation',
  '/integrations',
  '/health',
  '/queues',
  '/banners',
  '/flags',
  '/api',
  '/feedback',
  '/laura-site',
]

function cheminDe(href: string): string {
  return (href.split('?')[0] ?? href).replace(/^\//, '')
}

function routeExiste(href: string): boolean {
  return existsSync(join(APP, cheminDe(href), 'page.tsx'))
}

const TOUS_LES_HREFS = [COCKPIT.href, ...NAV_SECTIONS.flatMap(section => section.items.map(item => item.href))]

describe('le rail du back-office (#1644, #1675)', () => {
  it('LIT quelque chose — les sections et le dossier des routes existent', () => {
    // Contrôle positif : sans lui, un `APP` faux ou des sections vides
    // rendraient chaque assertion ci-dessous creuse.
    expect(NAV_SECTIONS.length).toBeGreaterThan(3)
    expect(TOUS_LES_HREFS.length).toBeGreaterThan(10)
    expect(existsSync(join(APP, 'changelog', 'page.tsx'))).toBe(true)
  })

  it('six sections, et Cockpit n’est dans aucune', () => {
    // « Le bouton Cockpit est TOUJOURS visible, jamais dans une section. »
    expect(NAV_SECTIONS).toHaveLength(5)
    expect(NAV_SECTIONS.flatMap(s => s.items.map(i => i.href))).not.toContain(COCKPIT.href)
    expect(NAV_SECTIONS.map(s => s.label)).toEqual([
      'Revenus',
      'Produit',
      'Technique',
      'Administration',
      'Configuration',
    ])
  })

  it('aucun lien mort — chaque href du rail a sa page', () => {
    const morts = TOUS_LES_HREFS.filter(href => !routeExiste(href))
    expect(morts, ['Un lien du rail ne mène nulle part :', ...morts].join('\n')).toEqual([])
  })

  it('sait dire NON — une route inventée est refusée', () => {
    // Deuxième preuve : la mesure attrape vraiment une absence.
    //
    // ⚠️ `/revenus` servait ici de contre-exemple jusqu'au 07/09/2026 — c'était
    // la route la plus crédible qui n'existait pas. #1651 l'a écrite, et une
    // garde dont le contre-exemple devient vrai cesse de prouver quoi que ce
    // soit : elle passerait au vert en ayant mesuré l'inverse de son sujet.
    // Les deux chemins ci-dessous n'existent pas et ne sont prévus nulle part.
    expect(routeExiste('/revenus-inexistant')).toBe(false)
    expect(routeExiste('/produit/ecrans')).toBe(false)
    // Et le contrôle positif du même geste : la route qui vient d'apparaître est
    // vue comme existante. Sans lui, `routeExiste` pourrait rendre `false`
    // partout — un faux zéro qui ressemble à une réponse.
    expect(routeExiste('/revenus')).toBe(true)
  })

  it('ZÉRO régression — les onze entrées de l’ancienne barre sont toutes placées', () => {
    const chemins = new Set(TOUS_LES_HREFS.map(cheminDe))
    const perdues = ANCIENNE_NAV.filter(href => !chemins.has(cheminDe(href)))
    expect(perdues, ['Le rail a perdu une entrée de l’ancienne barre :', ...perdues].join('\n')).toEqual([])
  })

  it('chaque destination n’est listée qu’une fois (loi 4 du tome 7)', () => {
    const doublons = TOUS_LES_HREFS.filter((href, index) => TOUS_LES_HREFS.indexOf(href) !== index)
    expect(doublons).toEqual([])
  })
})

describe('l’environnement servi se dit, il ne se devine pas (#1675)', () => {
  it('nomme les trois environnements', () => {
    expect(resolveEnvironment('production')?.label).toBe('PROD')
    expect(resolveEnvironment('production')?.token).toBe('var(--red)')
    expect(resolveEnvironment('preview')?.label).toBe('STAGING')
    expect(resolveEnvironment('development')?.label).toBe('LOCAL')
  })

  it('ne DEVINE jamais « production »', () => {
    // Le mensonge le plus coûteux des trois : une console qui se croit locale
    // pendant qu'elle supprime un compte réel — ou l'inverse, qui banalise le
    // rouge. Une valeur inconnue ne produit aucun badge.
    expect(resolveEnvironment(undefined)).toBeNull()
    expect(resolveEnvironment('')).toBeNull()
    expect(resolveEnvironment('prod')).toBeNull()
    expect(resolveEnvironment('n’importe quoi')).toBeNull()
  })

  it('le titre de l’onglet porte l’environnement', () => {
    // Deux onglets du manager côte à côte sont indiscernables ; l'un peut être
    // la production. Le préfixe est ce qui les distingue dans la barre.
    const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8')
    expect(layout).toContain('${ENVIRONMENT.label} · BellumAI — Dashboard Manager')
    expect(layout).toContain('NEXT_PUBLIC_VERCEL_ENV')
    expect(layout).toContain('NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA')
  })
})
