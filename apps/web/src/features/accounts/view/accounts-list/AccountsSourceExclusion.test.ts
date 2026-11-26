import { describe, expect, it } from 'vitest'
import { crmChipSearch, importedChipSearch } from './AccountsCrmChip'
import { searchForPortfolioTab } from './AccountsPortfolioTabs'

/** #4643 — « Archives » et les puces de source ne se cumulent jamais ; deux puces compatibles, si. */
describe('exclusion Archives ⟂ puces de source', () => {
  it('allumer « Importés » quitte « Archives »', () => {
    const next = importedChipSearch({ status: 'archived' }, true)
    expect(next.imported).toBe('only')
    expect(next.status).toBeUndefined()
  })

  it('allumer « Mon CRM » quitte « Archives » et garde les autres statuts', () => {
    const next = crmChipSearch({ status: ['archived', 'analyzed'] }, true)
    expect(next.crm).toBe('only')
    expect(next.status).toBe('analyzed')
  })

  it('ouvrir « Archives » relâche les puces de source', () => {
    const next = searchForPortfolioTab(
      { crm: 'only', imported: 'only', importJob: 'j1', headline: 'toResume' },
      'archives',
    )
    expect(next.status).toBe('archived')
    expect(next.crm).toBeUndefined()
    expect(next.imported).toBeUndefined()
    expect(next.importJob).toBeUndefined()
    expect(next.headline).toBeUndefined()
  })

  it('SAIT DIRE NON : « Mon CRM » et « Importés » sont compatibles et restent cumulables', () => {
    const both = importedChipSearch(crmChipSearch({}, true), true)
    expect(both.crm).toBe('only')
    expect(both.imported).toBe('only')
  })

  it('SAIT DIRE NON : sans « Archives », rien d’autre ne bouge dans le statut', () => {
    expect(importedChipSearch({ status: 'analyzed' }, true).status).toBe('analyzed')
    const other = searchForPortfolioTab({ crm: 'only' }, 'favorites')
    expect(other.crm).toBe('only')
  })
})
