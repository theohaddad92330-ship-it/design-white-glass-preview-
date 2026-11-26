import { describe, expect, it } from 'vitest'
import { redactSupplierNamesDeep, supplierNamesIn } from './tool-naming.js'

const redactSupplierNames = (text: string): string => redactSupplierNamesDeep(text)

describe('redactSupplierNames — R25 : un dossier ancien ne montre jamais « Apollo »', () => {
  it('réécrit le nom du fournisseur, casse et identifiant compris', () => {
    for (const text of ['Selon Apollo, 12 DSI', 'données apollo_enrich', 'APOLLO ne dit pas']) {
      expect(supplierNamesIn(redactSupplierNames(text))).toEqual([])
    }
    expect(redactSupplierNames('Selon Apollo, 12 DSI')).toBe('Selon une source de données, 12 DSI')
  })
  it('laisse un texte propre identique, et un mot ordinaire intact', () => {
    expect(redactSupplierNames('Les apollons du CAC')).toBe('Les apollons du CAC')
    expect(redactSupplierNames('Rien à signaler')).toBe('Rien à signaler')
  })
  it('traverse la structure mais épargne les clés techniques', () => {
    const out = redactSupplierNamesDeep({
      why: ['vu chez Pappers et Apollo'],
      n: 3,
      source: 'apollo',
      nested: { t: 'Firecrawl' },
    })
    expect(out).toEqual({
      why: ['vu chez une source de données et une source de données'],
      n: 3,
      source: 'apollo',
      nested: { t: 'une source de données' },
    })
  })
})
