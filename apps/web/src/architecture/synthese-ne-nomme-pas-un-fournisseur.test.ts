import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { redactSupplierNamesDeep, supplierNamesIn } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * R25 (15/10) — GARDE : la Synthèse d'un dossier ne nomme jamais NOTRE fournisseur. « Apollo » s'affichait sur EDF et
 * Decathlon : le texte du modèle, stocké avant la règle, passait tel quel (la garde GA-44 ne lit que les LITTÉRAUX
 * des écrans). Le lecteur unique de la Synthèse réécrit désormais tout texte du dossier ; cette garde exige que
 * le chemin reste branché ET prouve que la réécriture sait dire non (rien d'autre n'est touché).
 */
const READER = join(__dirname, '../features/accounts/view/account-detail/tabs/useAccountOverviewData.ts')

describe('la Synthèse ne nomme jamais un fournisseur (R25)', () => {
  it('le lecteur de la Synthèse passe le dossier par la réécriture', () => {
    const source = readFileSync(READER, 'utf8')
    expect(source).toContain('redactSupplierNamesDeep(account.raw_analysis)')
    expect(source).toContain('redactSupplierNamesDeep(account.priority_justification)')
  })

  it('un dossier propre sort identique, un dossier qui nomme Apollo ou Pappers sort propre', () => {
    const clean = { why: ['Recrutement DSI en cours'], score: 7 }
    expect(redactSupplierNamesDeep(clean)).toEqual(clean)
    const dirty = redactSupplierNamesDeep({ why: ['Selon Apollo et Pappers, 12 DSI'] })
    expect(supplierNamesIn(JSON.stringify(dirty))).toEqual([])
  })
})
