import { describe, expect, it } from 'vitest'
import { CRM_PROVIDERS, CRM_PROVIDER_READ_SCOPE } from './crm-adapter.js'
import { CRM_IMPORT_FAMILIES, crmImportCoverage, crmImportUnread } from './crm-import-coverage.js'

// #4290.18 — le contrat entre les objets d'un CRM tiers et les nôtres : chaque famille est REPRISE, ou nommée non reprise.
describe('crmImportCoverage (#4290.18)', () => {
  it('dit chaque famille pour chaque CRM — aucune ne manque à l’appel', () => {
    for (const provider of CRM_PROVIDERS) {
      expect(crmImportCoverage(provider).map(entry => entry.family)).toEqual([...CRM_IMPORT_FAMILIES])
    }
  })

  it('lit le périmètre de lecture du contrat et rien d’autre (un seul endroit)', () => {
    for (const provider of CRM_PROVIDERS) {
      const read = crmImportCoverage(provider)
        .filter(entry => entry.read)
        .map(entry => entry.family)
      expect(read).toEqual(
        CRM_IMPORT_FAMILIES.filter(family => (CRM_PROVIDER_READ_SCOPE[provider] as readonly string[]).includes(family)),
      )
    }
  })

  it('Zoho : les activités ne sont pas reprises (hors périmètre de lecture), les besoins passent par un fichier', () => {
    expect(crmImportUnread('zoho')).toEqual([
      { family: 'activities', reason: 'not_in_read_scope' },
      { family: 'needs', reason: 'file_only' },
    ])
  })

  it('HubSpot lit tout ce qu’il expose : seuls les besoins restent nommés', () => {
    expect(crmImportUnread('hubspot')).toEqual([{ family: 'needs', reason: 'file_only' }])
  })

  it('les propriétaires non lus ne font pas de ligne (attribution, pas une famille de fiches) — comme la note de lecture', () => {
    expect(crmImportCoverage('attio').find(entry => entry.family === 'owners')?.read).toBe(false)
    expect(crmImportUnread('attio').map(entry => entry.family)).not.toContain('owners')
  })
})
