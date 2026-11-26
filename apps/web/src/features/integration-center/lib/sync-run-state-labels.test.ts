import { SYNC_RUN_STATUSES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import fr from '../../../i18n/locales/fr/integrationCenter.json'
import en from '../../../i18n/locales/en/integrationCenter.json'
import { SYNC_RUN_STEPS, syncRunStateLabelKey } from './sync-run-state-labels'

function resolve(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) return (acc as Record<string, unknown>)[part]
    return undefined
  }, dict)
}

describe('syncRunStateLabelKey — #2110.22 à .31 (#2980)', () => {
  it('chaque état de SYNC_RUN_STATUSES a un libellé FR et EN, non vide', () => {
    for (const status of SYNC_RUN_STATUSES) {
      const key = syncRunStateLabelKey(status)
      expect(resolve(fr, key), `fr manquant pour "${status}" (${key})`).toEqual(expect.any(String))
      expect(resolve(en, key), `en manquant pour "${status}" (${key})`).toEqual(expect.any(String))
    }
  })

  it('un état intermédiaire ne retombe jamais sur le texte générique historique', () => {
    for (const status of SYNC_RUN_STEPS) {
      if (status === 'pending') continue
      expect(resolve(fr, syncRunStateLabelKey(status))).not.toEqual(resolve(fr, 'syncSummary.running'))
      expect(resolve(en, syncRunStateLabelKey(status))).not.toEqual(resolve(en, 'syncSummary.running'))
    }
  })

  it('SYNC_RUN_STEPS respecte l’ordre réel du worker, sans état terminal', () => {
    expect(SYNC_RUN_STEPS).toEqual([
      'pending',
      'reading_sources',
      'matching_accounts',
      'matching_contacts',
      'detecting_events',
      'preparing_summary',
    ])
  })
})
