import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useActiveContactFilters } from './useActiveContactFilters'

describe('useActiveContactFilters', () => {
  it('returns an empty list when no filters are active', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([])
  })

  it('includes role, company and channel — but NOT unassigned (that is a scope tab, not a bar chip)', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'sponsor',
        companyFilter: 'Acme',
        tagFilter: undefined,
        channelFilter: 'with_email',
        unassignedFilter: undefined, // active scope, yet it never renders as a bar chip
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([
      { id: 'role', value: 'sponsor' },
      { id: 'company', value: 'Acme' },
      { id: 'channel', value: 'with_email' },
    ])
  })

  it('omits role when it equals the "all" sentinel', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: 'Acme',
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'company', value: 'Acme' }])
  })
})

describe('useActiveContactFilters — réseau dormant', () => {
  it('renders the dormant threshold as a bar chip, so it can be seen and removed', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: '12',
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'dormant', value: '12' }])
  })
})

describe('useActiveContactFilters — filtre Localisation (#2158.61)', () => {
  it('rend la localisation comme une puce de barre, pour qu’elle se voie et se retire', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: 'Lyon',
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'location', value: 'Lyon' }])
  })
})

describe('useActiveContactFilters — filtre Owner (#2158.65)', () => {
  it('rend le porteur comme une puce de barre, pour qu’elle se voie et se retire', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: 'member-1',
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'assignedTo', value: 'member-1' }])
  })
})

describe('useActiveContactFilters — filtre Famille métier (#2158.60)', () => {
  it('rend la famille comme une puce de barre, pour qu’elle se voie et se retire', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: 'IT',
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'family', value: 'IT' }])
  })

  it('omits family when it equals the "all" sentinel', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: 'all',
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([])
  })
})

describe('useActiveContactFilters — filtre Entité (#2158.57)', () => {
  it('rend l’entité comme une puce de barre, pour qu’elle se voie et se retire', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: 'DSI',
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'entity', value: 'DSI' }])
  })
})

describe('useActiveContactFilters — filtre Fonction (#2158.58)', () => {
  it('rend la fonction comme une puce de barre, pour qu’elle se voie et se retire', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: 'DSI',
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'title', value: 'DSI' }])
  })
})

describe('useActiveContactFilters — filtre Fraîcheur (#2158.67)', () => {
  it('rend la fraîcheur comme une puce de barre, pour qu’elle se voie et se retire', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: '6',
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'updatedWithin', value: '6' }])
  })
})

describe('useActiveContactFilters — filtre Cible (#2158.68)', () => {
  it('rend la cible comme une puce de barre, pour qu’elle se voie et se retire', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: 'list-1',
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'targetListId', value: 'list-1' }])
  })
})

describe('useActiveContactFilters — filtre Source (#2158.66)', () => {
  it('rend la source comme une puce de barre — valeur BRUTE, le libellé anonymisé vient de `findOption` côté FilterBar', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: 'apollo',
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'source', value: 'apollo' }])
  })

  it('omits source when it equals the "all" sentinel', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: 'all',
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([])
  })
})

describe('useActiveContactFilters — Sans prochaine action (#2158.14)', () => {
  it('rend la vue comme une puce de barre quand elle est active', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: true,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'withoutNextAction', value: 'true' }])
  })
})

describe('useActiveContactFilters — Dernière action (#2158.69)', () => {
  it('rend la nature de la dernière activité comme une puce de barre', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: undefined,
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: 'call',
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'lastActivityKind', value: 'call' }])
  })
})

describe('useActiveContactFilters — étiquette (#2159.26)', () => {
  it('rend l’étiquette comme une puce de barre, pour qu’elle se voie et se retire', () => {
    const { result } = renderHook(() =>
      useActiveContactFilters({
        roleFilter: 'all',
        companyFilter: undefined,
        tagFilter: 'sap',
        channelFilter: undefined,
        unassignedFilter: undefined,
        dormantFilter: undefined,
        locationFilter: undefined,
        assignedToFilter: undefined,
        accountIdFilter: undefined,
        familyFilter: undefined,
        entityFilter: undefined,
        titleFilter: undefined,
        updatedWithinFilter: undefined,
        targetListIdFilter: undefined,
        sourceFilter: undefined,
        hierarchyLevelFilter: undefined,
        withoutNextActionFilter: undefined,
        lastActivityKindFilter: undefined,
        userStatusFilter: undefined,
      }),
    )
    expect(result.current).toEqual([{ id: 'tag', value: 'sap' }])
  })
})
