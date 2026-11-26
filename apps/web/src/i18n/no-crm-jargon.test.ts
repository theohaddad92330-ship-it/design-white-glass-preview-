import { NAMESPACES } from '@/i18n/config'
import { resources } from '@/i18n/resources'

/**
 * #4198 (épopée #4191, lot L7) — AUCUN TERME INTERNE À L'ÉCRAN.
 *
 * « BTMMP », « Reverse Market », « Staffable » et « Ces mots, précisément » sont
 * le vocabulaire de l'équipe, pas celui d'un commercial ESN : le commercial lit
 * « qualification (budget, besoin, décideur…) », « trouver des missions »,
 * « peut être pourvu ». Garde sur les fichiers FR.
 */
type Tree = { [key: string]: Tree | string }

function leaves(tree: Tree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  )
}

const BANNED = /btmmp|reverse[ -]?market|staffable|staffabilit|ces mots, précisément|ouvrir le dossier complet/i

// Le journal des nouveautés raconte ce qui a été livré, à la date où c'était
// vrai : on ne réécrit pas l'histoire (`changelog` est exclu, nommément).
const HISTORIQUE = new Set<string>(['changelog'])

describe('aucun jargon interne dans une chaîne FR affichée', () => {
  it.each([...NAMESPACES].filter(ns => !HISTORIQUE.has(ns)))('fr — namespace "%s"', ns => {
    const offenders = leaves(resources.fr[ns] as Tree)
      .filter(([, value]) => BANNED.test(value))
      .map(([path, value]) => `${path}: ${value.slice(0, 70)}`)
    expect(offenders).toEqual([])
  })
})
