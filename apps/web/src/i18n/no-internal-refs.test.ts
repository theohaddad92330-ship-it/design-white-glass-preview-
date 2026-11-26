import { NAMESPACES } from '@/i18n/config'
import { resources } from '@/i18n/resources'

/**
 * Aucune référence interne à l'écran (recette prod 01/10, #3504) : le bandeau
 * « à revérifier » affichait « (#3504) », un numéro d'issue que l'utilisateur
 * ne peut ni ouvrir ni comprendre. Un numéro de chantier se garde dans le
 * commit et le commentaire de code, jamais dans une chaîne affichée.
 */
type Tree = { [key: string]: Tree | string }

function leaves(tree: Tree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  )
}

const INTERNAL_REF = /#\d{3,}/

describe('aucune référence interne (#NNNN) dans une chaîne affichée', () => {
  for (const lang of ['fr', 'en'] as const) {
    it.each([...NAMESPACES])(`${lang} — namespace "%s"`, ns => {
      const offenders = leaves(resources[lang][ns] as Tree)
        .filter(([, value]) => INTERNAL_REF.test(value))
        .map(([path, value]) => `${path}: ${value.slice(0, 60)}`)
      expect(offenders).toEqual([])
    })
  }
})
