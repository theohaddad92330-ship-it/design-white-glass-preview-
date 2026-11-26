import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LauraPageContext } from '@bellum/contracts'
import { allNavRoutes } from '@/components/navigation/sections'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'
import { declaredEntityLabel, declaredRecommendedAction, findDestinations, sectionOfRoute } from './product-index'

/**
 * CE QUE LA BULLE DIT DE L'ÉCRAN, ET OÙ ELLE PROPOSE D'ALLER — sans modèle.
 *
 * Les libellés sont ceux du VRAI fichier de traduction français : une question
 * posée « trouver un contact » doit recouvrir l'onglet tel que la personne le
 * lit, pas une clé i18n.
 */
type NavTree = { [key: string]: string | NavTree }
const NAV_FR = JSON.parse(readFileSync(resolve(__dirname, '../../../i18n/locales/fr/nav.json'), 'utf8')) as NavTree

function label(key: string): string {
  let node: string | NavTree | undefined = NAV_FR
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined
  return typeof node === 'string' ? node : key
}

const SETTINGS_ROUTES = SETTINGS_SECTIONS.flatMap(section =>
  section.items.flatMap(item => (typeof item.to === 'string' ? [item.to] : [])),
)

describe('#1904.15 — aucun écran de navigation n’est « rattaché à aucune section »', () => {
  it('LIT les deux barres — sinon la garde ne garde rien', () => {
    // #4197 (L6) — la navigation passe à neuf destinations métier : 26 routes lues
    // le 15/10/2026, le plancher suit la refonte sans cesser de prouver la lecture.
    // 20 → 19 avec Théo A today-jour.A8 : l'onglet « Tableau de bord » est retiré.
    expect(allNavRoutes().length).toBeGreaterThan(18)
    expect(SETTINGS_ROUTES.length).toBeGreaterThan(18)
  })

  it('chaque écran de la barre principale a sa section', () => {
    for (const route of allNavRoutes()) {
      expect(sectionOfRoute(route, label), `écran de navigation sans section : ${route}`).not.toBeNull()
    }
  })

  it('chaque écran de la barre des Réglages est rattaché aux Réglages — Intégrations et Facturation compris', () => {
    for (const route of SETTINGS_ROUTES) {
      expect(sectionOfRoute(route, label)?.section, `écran de réglages sans section : ${route}`).toBe(
        label('items.settings'),
      )
    }
  })

  it('n’invente aucun rattachement : le back-office et l’écran de connexion restent sans section', () => {
    // Témoin du voisin légitime : ces deux écrans existent au routeur et ne
    // vivent dans AUCUNE barre. « Je ne sais pas où il vit » y reste vrai.
    expect(sectionOfRoute('/bak/home', label)).toBeNull()
    expect(sectionOfRoute('/login', label)).toBeNull()
  })
})

/**
 * #1903 — LES MOTS D'UNE INTENTION MÈNENT À SON ÉCRAN, sans classifieur.
 *
 * `findDestinations` recouvre les mots de la question avec les libellés et les
 * routes de la navigation. Ce tableau épingle les intentions de #1903 qui ont
 * une MAISON dans la barre ; celles qui n'en ont pas (comprendre, prioriser,
 * analyser une entreprise, préparer un message, corriger une information) sont
 * des outils de Laura, choisis par le modèle — elles relèvent d'une évaluation
 * en ligne, pas d'une table de mots.
 */
describe('#1903 — une intention nommée propose son écran, sans modèle', () => {
  it.each([
    ['trouver un contact chez SOCOTEC', '/contacts'],
    ['créer une séquence de relance', '/actions/sequences'],
    ['découvrir des comptes', '/discover'],
    ['positionner un consultant', '/consultants'],
    // #4351.1 — « En cours » a quitté la barre : Missions s'ouvre sur Planning.
    ['suivre une mission', '/missions/planification'],
    ['trouver un besoin client', '/projects'],
  ])('« %s » propose %s', (question, route) => {
    expect(findDestinations(question, label).map(destination => destination.route)).toContain(route)
  })

  it('ne propose rien quand aucun mot ne recouvre un écran — un silence plutôt qu’un hasard', () => {
    expect(findDestinations('bonjour', label)).toEqual([])
  })
})

/**
 * #1904.3 / #1904.9 — CE QUE LA BULLE MONTRE DE L'OBJET OUVERT ET DU GESTE
 * RECOMMANDÉ — LA MOITIÉ « TRANSPARENCE » DE LA RÈGLE : la personne doit voir
 * ce qui part vers Laura, pas seulement Laura le recevoir (voir
 * `laura-context.test.ts`, côté contrat, pour la moitié « ça part »).
 *
 * Même patron que `declaredScreenTitle` : `null` quand l'écran ne déclare
 * rien, jamais une valeur devinée.
 */
const CONTEXT: LauraPageContext = {
  kind: 'account',
  label: 'ACME SA',
  entityId: '11111111-2222-3333-4444-555555555555',
  facets: [],
  state: 'ready',
}

describe('#1904.3 — l’objet ouvert, visible sans qu’il faille cliquer', () => {
  it('rend le nom déclaré', () => {
    expect(declaredEntityLabel({ ...CONTEXT, entityLabel: 'Groupe Vallée' })).toBe('Groupe Vallée')
  })

  it('rend null sans écran, ou sans déclaration', () => {
    expect(declaredEntityLabel(null)).toBeNull()
    expect(declaredEntityLabel(CONTEXT)).toBeNull()
  })

  it('rend null pour une déclaration à blanc — jamais une ligne à trou', () => {
    expect(declaredEntityLabel({ ...CONTEXT, entityLabel: '   ' })).toBeNull()
  })
})

describe('#1904.9 — le geste recommandé, visible sans qu’il faille cliquer', () => {
  it('rend le geste déclaré', () => {
    expect(declaredRecommendedAction({ ...CONTEXT, recommendedAction: 'Relancer' })).toBe('Relancer')
  })

  it('rend null sans écran, ou sans déclaration', () => {
    expect(declaredRecommendedAction(null)).toBeNull()
    expect(declaredRecommendedAction(CONTEXT)).toBeNull()
  })

  it('rend null pour une déclaration à blanc — jamais une ligne à trou', () => {
    expect(declaredRecommendedAction({ ...CONTEXT, recommendedAction: '  ' })).toBeNull()
  })
})
