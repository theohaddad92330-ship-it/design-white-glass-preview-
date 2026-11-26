import { MON_CRM_SOURCE_FILTER } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { sourceFilterOptions } from './sourceFilterOptions'

describe('sourceFilterOptions (#4526.9)', () => {
  it('sait dire NON : aucun contact CRM ⇒ pas d’option « Mon CRM »', () => {
    const options = sourceFilterOptions({ label: 'HubSpot', shown: false })
    expect(options.some(option => option.value === MON_CRM_SOURCE_FILTER)).toBe(false)
  })
  it('des contacts CRM ⇒ l’option porte le libellé de la puce', () => {
    const options = sourceFilterOptions({ label: 'HubSpot', shown: true })
    expect(options.find(option => option.value === MON_CRM_SOURCE_FILTER)?.label).toBe('HubSpot')
  })
})
