import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAG_CATEGORIES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * #3439.a (lot M07, 09/10) — UNE CATÉGORIE DISTILLÉE A TOUJOURS UN LIBELLÉ LISIBLE.
 *
 * Recette prod 09/10 : `/settings/knowledge` affichait les types BRUTS
 * (`objection_answer`, `winning_angle`, `access_fact`, `sector_insight`,
 * `account_fact`). Le lot H05 (`695dc7db`) les a traduits dans « Mes
 * documents » — cette garde empêche que la prochaine catégorie ajoutée à
 * `RAG_CATEGORIES` (`@bellum/contracts`) reparte en brut : elle échoue si une
 * catégorie n'a pas de libellé FR ET EN, si le libellé recopie le type, ou si
 * l'écran ne passe plus par la table de libellés.
 */

const ROOT = join(__dirname, '..')

type Dict = { [key: string]: string | Dict }

function readLocale(lang: 'fr' | 'en'): Dict {
  return JSON.parse(readFileSync(join(ROOT, 'i18n', 'locales', lang, 'knowledge.json'), 'utf8')) as Dict
}

/** Categories with no readable label: missing, empty, or a copy of the raw type. */
function categoriesWithoutLabel(categories: readonly string[], locale: Dict): string[] {
  const documents = locale.documents
  const labels = typeof documents === 'object' ? documents.category : undefined
  return categories.filter(category => {
    const label = typeof labels === 'object' ? labels[category] : undefined
    return typeof label !== 'string' || label.trim() === '' || label.trim() === category
  })
}

describe('#3439.a — chaque catégorie distillée a un libellé lisible FR et EN', () => {
  it.each(['fr', 'en'] as const)('%s : aucune catégorie de RAG_CATEGORIES sans libellé', lang => {
    expect(categoriesWithoutLabel(RAG_CATEGORIES, readLocale(lang))).toEqual([])
  })

  it('l’écran passe par la table de libellés, jamais par la valeur brute seule', () => {
    const source = readFileSync(join(ROOT, 'features', 'knowledge', 'view', 'Knowledge.tsx'), 'utf8')
    expect(source).toContain('RAG_CATEGORY_LABEL_KEY: Record<RagCategory, string>')
    expect(source).toMatch(/t\(RAG_CATEGORY_LABEL_KEY\[doc\.category\]\)/)
    for (const category of RAG_CATEGORIES) {
      expect(source).toContain(`${category}: 'documents.category.${category}'`)
    }
  })

  it('sait dire NON : un libellé absent, vide ou recopiant le type est attrapé', () => {
    const locale: Dict = {
      documents: { category: { account_fact: 'Fait sur un compte', winning_angle: '', access_fact: 'access_fact' } },
    }
    expect(
      categoriesWithoutLabel(['account_fact', 'winning_angle', 'access_fact', 'objection_answer'], locale),
    ).toEqual(['winning_angle', 'access_fact', 'objection_answer'])
  })
})
