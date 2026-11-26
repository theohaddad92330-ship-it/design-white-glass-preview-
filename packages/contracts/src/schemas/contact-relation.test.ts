import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PERSON_COMPANY_RELATION_VALUES } from './contact.js'

/**
 * #219.8 (#3231) — le vocabulaire TS est le miroir EXACT du vocabulaire Python
 * et de la contrainte SQL : on lit les DEUX fichiers, on ne recopie pas.
 */
const root = join(__dirname, '../../../..')
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8')

describe('relation personne↔entreprise déclarée — un seul vocabulaire', () => {
  it('égale les valeurs de PersonCompanyRelation (Python)', () => {
    const py = read('apps/ia/app/services/person_company_relation.py')
    const block = py.slice(py.indexOf('class PersonCompanyRelation'), py.indexOf('PERSON_COMPANY_RELATION_VALUES'))
    const values = [...block.matchAll(/=\s*"([a-z_]+)"/g)].map(m => m[1])
    expect(values.length).toBe(13)
    expect([...PERSON_COMPANY_RELATION_VALUES].sort()).toEqual([...values].sort())
  })

  it('égale la liste de la contrainte SQL', () => {
    const sql = read('apps/api/src/migrations/1796376150639-ContactDeclaredPersonCompanyRelation.ts')
    const check = sql.slice(sql.indexOf('CHECK ('))
    const values = [...check.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect([...PERSON_COMPANY_RELATION_VALUES].sort()).toEqual([...values].sort())
  })
})
