import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTERNAL_CLIENT_MODES } from './account.js'
import { accountCorePatchSchema } from './crm-record.js'

/**
 * #219.6 (#3231) — le vocabulaire TS est le miroir EXACT du vocabulaire Python
 * et de la contrainte SQL : on lit les DEUX fichiers, on ne recopie pas.
 */
const root = join(__dirname, '../../../..')
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8')

describe('client interne déclaré — un seul vocabulaire', () => {
  it('égale INTERNAL_CLIENT_MODES (Python)', () => {
    const py = read('apps/ia/app/services/internal_client.py')
    const line = py.split('\n').find(l => l.startsWith('INTERNAL_CLIENT_MODES')) ?? ''
    const values = [...line.matchAll(/"([a-z_]+)"/g)].map(m => m[1])
    expect(values.length).toBe(2)
    expect([...INTERNAL_CLIENT_MODES].sort()).toEqual([...values].sort())
  })

  it('égale la liste de la contrainte SQL', () => {
    const sql = read('apps/api/src/migrations/1796424417731-AccountDeclaredInternalClientMode.ts')
    const check = sql.slice(sql.indexOf('CHECK ('))
    const values = [...check.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect([...INTERNAL_CLIENT_MODES].sort()).toEqual([...values].sort())
  })

  it('le patch CRM accepte une valeur du vocabulaire et null, refuse le reste', () => {
    expect(accountCorePatchSchema.safeParse({ declaredInternalClientMode: 'internal_service' }).success).toBe(true)
    expect(accountCorePatchSchema.safeParse({ declaredInternalClientMode: null }).success).toBe(true)
    expect(accountCorePatchSchema.safeParse({ declaredInternalClientMode: 'filiale' }).success).toBe(false)
  })
})

describe('#219.6 — les quatre rôles déclarés (J05)', () => {
  it.each(['declaredInternalSponsor', 'declaredInternalUsers', 'declaredLegalEntity', 'declaredEndClient'])(
    'le patch CRM accepte un nom de %s, null, et refuse un texte démesuré',
    key => {
      expect(accountCorePatchSchema.safeParse({ [key]: 'Direction Digital France' }).success).toBe(true)
      expect(accountCorePatchSchema.safeParse({ [key]: null }).success).toBe(true)
      expect(accountCorePatchSchema.safeParse({ [key]: 'x'.repeat(201) }).success).toBe(false)
    },
  )
})
