import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IMPORT_SOURCES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * #4067.9 (recette R47, /settings/import) — UNE SOURCE D'IMPORT A TOUJOURS UN LIBELLÉ LISIBLE.
 *
 * Les cartes affichaient `need_documents` et `testimonials` comme TITRES : l'assistant traduit
 * `sources.<clé>` avec `defaultValue: clé`, donc une source ajoutée au catalogue sans libellé
 * repart en brut sans qu'aucun test ne le voie. Échoue si une clé de `IMPORT_SOURCES` n'a pas
 * de libellé FR ET EN, vide, ou qui recopie la clé.
 */

const ROOT = join(__dirname, '..')

type Dict = { [key: string]: string | Dict }

function readSources(lang: 'fr' | 'en'): Dict {
  const locale = JSON.parse(readFileSync(join(ROOT, 'i18n', 'locales', lang, 'importWizard.json'), 'utf8')) as Dict
  const sources = locale.sources
  return typeof sources === 'object' ? sources : {}
}

function keysWithoutLabel(keys: readonly string[], labels: Dict): string[] {
  return keys.filter(key => {
    const label = labels[key]
    return typeof label !== 'string' || label.trim() === '' || label.trim() === key
  })
}

describe('#4067.9 — chaque source d’import a un libellé FR et EN', () => {
  it.each(['fr', 'en'] as const)('%s : aucune clé de IMPORT_SOURCES sans libellé', lang => {
    expect(
      keysWithoutLabel(
        IMPORT_SOURCES.map(source => source.key),
        readSources(lang),
      ),
    ).toEqual([])
  })

  it('sait dire NON : absente, vide ou recopiant la clé, la source est attrapée', () => {
    expect(keysWithoutLabel(['a', 'b', 'c', 'd'], { a: 'Alpha', b: '', c: 'c' })).toEqual(['b', 'c', 'd'])
  })
})
