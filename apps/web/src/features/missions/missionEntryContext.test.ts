import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { missionEntryContext } from './missionEntryContext'
import type { MissionView } from './api'

/**
 * #2953 (#2193.54) — LAURA VOIT LE DOSSIER MISSION, SANS RECOPIE.
 *
 * Ce que cette garde attrape : un contexte qui inventerait un fait que le
 * dossier n'affiche pas, ou qui recalculerait ce qu'`assigneeNames` sait déjà.
 */
const t = ((key: string) => key) as unknown as TFunction<'missions'>

function mission(overrides: Partial<MissionView> = {}): MissionView {
  return {
    id: 'm-1',
    label: 'TMA portail transporteurs',
    account_id: 'a-1',
    status: 'active',
    assignees: [],
    ...overrides,
  } as MissionView
}

describe('missionEntryContext (#2193.54)', () => {
  it('dit « en chargement » — jamais un fait deviné — tant que la mission n’est pas lue', () => {
    const context = missionEntryContext({ t, mission: null, isPending: true })
    expect(context.state).toBe('loading')
    expect(context.facets).toEqual([])
    expect(context.entityId).toBeNull()
  })

  it('cadre sur la MISSION elle-même, jamais sur le compte porteur', () => {
    const context = missionEntryContext({ t, mission: mission(), isPending: false })
    expect(context.kind).toBe('mission')
    expect(context.entityId).toBe('m-1')
    expect(context.label).toBe('TMA portail transporteurs')
  })

  it('reprend le consultant déjà résolu par le hero — sans second calcul', () => {
    const context = missionEntryContext({
      t,
      mission: mission({ assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null, loadPercent: 80 }] }),
      isPending: false,
    })
    expect(context.facets).toContainEqual({ label: 'dossier.hero.consultant', value: 'Salomé Dufour' })
  })

  it('n’ajoute AUCUNE facette consultant quand personne n’est affecté', () => {
    const context = missionEntryContext({ t, mission: mission({ assignees: [] }), isPending: false })
    expect(context.facets.some(facet => facet.label === 'dossier.hero.consultant')).toBe(false)
  })

  it('nomme le manager client SEULEMENT quand le hero le connaît', () => {
    const withManager = missionEntryContext({
      t,
      mission: mission({ clientManagerName: 'Nadia Kessler' }),
      isPending: false,
    })
    expect(withManager.facets).toContainEqual({ label: 'dossier.hero.clientManager', value: 'Nadia Kessler' })

    const withoutManager = missionEntryContext({ t, mission: mission({ clientManagerName: null }), isPending: false })
    expect(withoutManager.facets.some(facet => facet.label === 'dossier.hero.clientManager')).toBe(false)
  })

  it('borne chaque valeur à 160 caractères — la limite du contrat', () => {
    const context = missionEntryContext({ t, mission: mission({ label: 'x'.repeat(200) }), isPending: false })
    expect(context.label.length).toBeLessThanOrEqual(160)
  })
})
