import { describe, expect, it } from 'vitest'
import type { ConnectedClientTool } from '@bellum/contracts'
import { excludedFamilies, excludedProviderIds, excludedProvidersFor, useToolSourcesStore } from './toolSourcesStore'

const gmail: ConnectedClientTool = { provider: 'gmail', family: 'email', name: 'Gmail' }
const outlook: ConnectedClientTool = { provider: 'microsoft', family: 'email', name: 'Outlook' }
const hubspot: ConnectedClientTool = { provider: 'hubspot', family: 'crm', name: 'HubSpot' }

describe('#3708 — excludedFamilies', () => {
  it('une famille est coupée quand TOUS ses outils sont décochés', () => {
    expect(excludedFamilies([gmail, hubspot], ['hubspot'])).toEqual(['crm'])
  })

  it('une famille encore portée par un outil coché reste lisible (le menu le dit)', () => {
    expect(excludedFamilies([gmail, outlook], ['gmail'])).toEqual([])
    expect(excludedFamilies([gmail, outlook], ['gmail', 'microsoft'])).toEqual(['email'])
  })

  it('sans exclusion, rien n’est coupé — et un outil branché après coup n’est jamais exclu', () => {
    expect(excludedFamilies([gmail, hubspot], [])).toEqual([])
    expect(excludedFamilies([], ['gmail'])).toEqual([])
  })
})

describe('#3973 — un outil qui sert plusieurs familles (Microsoft 365 : messagerie ET agenda)', () => {
  const googleCalendar: ConnectedClientTool = { provider: 'google-calendar', family: 'calendar', name: 'Google Agenda' }
  const microsoft: ConnectedClientTool = {
    provider: 'microsoft',
    family: 'email',
    additional_families: ['calendar'],
    name: 'Outlook',
  }

  it("décocher l'agenda Google ne coupe pas l'agenda : Microsoft le porte encore", () => {
    expect(excludedFamilies([googleCalendar, microsoft], ['google-calendar'])).toEqual([])
  })

  it('décocher Microsoft seul branché coupe sa messagerie ET son agenda', () => {
    expect(excludedFamilies([microsoft], ['microsoft']).sort()).toEqual(['calendar', 'email'])
    expect(excludedFamilies([googleCalendar, microsoft], ['microsoft'])).toEqual(['email'])
    expect(excludedFamilies([googleCalendar, microsoft], ['microsoft', 'google-calendar']).sort()).toEqual([
      'calendar',
      'email',
    ])
  })
})

describe('#3708.fournisseur — excludedProviderIds', () => {
  it('rend les outils décochés, famille incluse ou non', () => {
    expect(excludedProviderIds([gmail, outlook, hubspot], ['gmail'])).toEqual(['gmail'])
    expect(excludedProviderIds([gmail, hubspot], ['hubspot'])).toEqual(['hubspot'])
  })

  it('écarte un identifiant qui n’est plus branché : jamais une exclusion fantôme', () => {
    expect(excludedProviderIds([gmail], ['hubspot'])).toEqual([])
    expect(excludedProviderIds([], ['gmail'])).toEqual([])
  })

  it('sans exclusion, rien', () => {
    expect(excludedProviderIds([gmail, hubspot], [])).toEqual([])
  })
})

describe('#3708 — magasin par fil', () => {
  it('bascule par fil, sans fuite entre conversations', () => {
    const { toggle } = useToolSourcesStore.getState()
    toggle('c1', 'gmail')
    expect(excludedProvidersFor(useToolSourcesStore.getState().excluded, 'c1')).toEqual(['gmail'])
    expect(excludedProvidersFor(useToolSourcesStore.getState().excluded, 'c2')).toEqual([])
    toggle('c1', 'gmail')
    expect(excludedProvidersFor(useToolSourcesStore.getState().excluded, 'c1')).toEqual([])
    expect(excludedProvidersFor(useToolSourcesStore.getState().excluded, null)).toEqual([])
  })
})
