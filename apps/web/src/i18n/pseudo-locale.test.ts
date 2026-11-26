import { NAMESPACES } from '@/i18n/config'
import { resources } from '@/i18n/resources'
import { interpolationTokens, pseudoLocalize } from '@/i18n/pseudo-locale'

/**
 * #2437.15 (épopée #2863) — outillage QA i18n, volet pseudo-locale.
 *
 * Les fixtures sont les VRAIES ressources du produit (`resources.ts`, les
 * mêmes que charge le runtime) — pas des chaînes synthétiques : c'est ce qui
 * distingue cet outillage d'« un test unitaire de plus » (le refus déjà
 * écrit dans l'épopée #2863). Il tourne sur les deux langues, tous
 * namespaces, à chaque exécution de la suite — donc à chaque CI.
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

describe('i18n pseudo-locale', () => {
  it('la garde sait dire NON, et ne se trompe pas de forme', () => {
    expect(pseudoLocalize('')).toBe('')
    expect(pseudoLocalize('   ')).toBe('   ')
    expect(pseudoLocalize('aeiou')).toBe('⟦ȧėıōū~~⟧')
    // `{{name}}` et `<bold>` restent BYTE-IDENTIQUES à l'intérieur des bornes.
    const withPlaceholder = pseudoLocalize('Bonjour {{name}}')
    expect(withPlaceholder).toContain('{{name}}')
    const withTag = pseudoLocalize('Voir <bold>les détails</bold>')
    expect(withTag).toContain('<bold>')
    expect(withTag).toContain('</bold>')
  })

  it('est déterministe : même valeur, même sortie', () => {
    expect(pseudoLocalize('Créer une action')).toBe(pseudoLocalize('Créer une action'))
  })

  it.each([...NAMESPACES])('namespace "%s" : chaque valeur fr/en pseudo-localise sans perdre un placeholder', ns => {
    for (const lang of ['fr', 'en'] as const) {
      const flat = flatten(resources[lang][ns] as Tree)
      for (const [key, value] of flat) {
        const before = interpolationTokens(value)
        const after = interpolationTokens(pseudoLocalize(value))
        expect(after, `${lang}/${ns}.json:${key} — placeholders perdus ou réordonnés par la pseudo-locale`).toEqual(
          before,
        )
      }
    }
  })

  it.each([...NAMESPACES])('namespace "%s" : une valeur non vide ressort visiblement pseudo-localisée', ns => {
    for (const lang of ['fr', 'en'] as const) {
      const flat = flatten(resources[lang][ns] as Tree)
      for (const [key, value] of flat) {
        if (value.trim() === '') continue
        const transformed = pseudoLocalize(value)
        // Un texte codé en dur (jamais passé par `t()`) resterait, lui,
        // identique au texte source — c'est le signal que cette borne existe
        // pour rendre visible en recette, pas une simple curiosité.
        expect(transformed, `${lang}/${ns}.json:${key} — la pseudo-locale n'a rien changé`).not.toBe(value)
        expect(transformed.startsWith('⟦'), `${lang}/${ns}.json:${key} — borne de début manquante`).toBe(true)
        expect(transformed.endsWith('⟧'), `${lang}/${ns}.json:${key} — borne de fin manquante`).toBe(true)
      }
    }
  })
})
