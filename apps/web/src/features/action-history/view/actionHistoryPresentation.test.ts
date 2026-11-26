import { describe, expect, it } from 'vitest'
import { getActionHistoryFilters } from './actionHistoryPresentation'
import { i18n } from '@/i18n'

/**
 * #2200.38 — le canal (LinkedIn, e-mail, téléphone, RDV, autre) arrivait déjà
 * sur chaque ligne du journal (`channel`), mais aucun filtre ne le proposait :
 * resserrer « que s'est-il passé sur LinkedIn » obligeait à tout relire.
 */
describe('journal d’activité — filtre par canal', () => {
  it('propose les cinq canaux du contrat, chacun avec un libellé métier', () => {
    const t = i18n.getFixedT('fr', 'actions')
    const channel = getActionHistoryFilters(t).find(definition => definition.id === 'channel')
    expect(channel).toBeDefined()
    expect(channel && 'options' in channel ? channel.options.map(option => option.value) : []).toEqual([
      'linkedin',
      'email',
      'phone',
      'meeting',
      'other',
    ])
    expect(channel && 'options' in channel ? channel.options.map(option => option.label) : []).not.toContain(undefined)
  })
})
