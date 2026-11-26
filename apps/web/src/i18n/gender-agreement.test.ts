import { describe, expect, it } from 'vitest'
import { NAMESPACES } from './config'
import { hasHardcodedGenderToggle } from './gender-agreement'
import { resources } from './resources'

/**
 * #2437.15 (épopée #2863) — outillage QA i18n, volet genres grammaticaux.
 *
 * Comme `pseudo-locale.test.ts` : les fixtures sont les VRAIES ressources du
 * produit, tous namespaces, fr + en — pas des chaînes synthétiques. C'est ce
 * qui en fait un outillage QA et pas « un test unitaire de plus ».
 */

type Tree = Record<string, unknown>

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out.set(path, value)
    } else if (value && typeof value === 'object') {
      for (const [subPath, subValue] of flatten(value as Tree, path)) {
        out.set(subPath, subValue)
      }
    }
  }
  return out
}

describe('gender-agreement — accord de genre codé en dur', () => {
  it('la garde sait dire NON sur du texte normal', () => {
    expect(hasHardcodedGenderToggle('Créer une action')).toBe(false)
    expect(hasHardcodedGenderToggle('Compte connecté avec succès')).toBe(false)
    expect(hasHardcodedGenderToggle('Mis à jour le 12.05.2026')).toBe(false)
    expect(hasHardcodedGenderToggle('Annuler')).toBe(false)
  })

  it('la garde sait dire OUI sur les deux formes du hack', () => {
    expect(hasHardcodedGenderToggle('Vous êtes connecté(e)')).toBe(true)
    expect(hasHardcodedGenderToggle('Prêt(e) à commencer ?')).toBe(true)
    expect(hasHardcodedGenderToggle('Assigné(le) à ce compte')).toBe(true)
    expect(hasHardcodedGenderToggle('Connecté·e à votre espace')).toBe(true)
  })

  it.each([...NAMESPACES])('namespace "%s" : aucune valeur fr/en ne code un accord de genre en dur', ns => {
    for (const lang of ['fr', 'en'] as const) {
      const flat = flatten(resources[lang][ns] as Tree)
      const offenders = [...flat.entries()].filter(([, value]) => hasHardcodedGenderToggle(value))
      expect(
        offenders,
        offenders
          .map(
            ([key, value]) =>
              `${lang}/${ns}.json:${key} — accord de genre codé en dur (« ${value} ») : déclarer deux clés ` +
              'plutôt qu’un suffixe entre parenthèses ou un point médian.',
          )
          .join('\n'),
      ).toEqual([])
    }
  })
})
