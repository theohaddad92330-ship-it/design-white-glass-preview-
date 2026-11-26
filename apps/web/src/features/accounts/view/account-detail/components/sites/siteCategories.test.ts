import { describe, expect, it } from 'vitest'
import type { SiteRow } from './siteTypes'
import { siteCategoriesPresent } from './useSiteRows'

const row = (over: Partial<SiteRow>): SiteRow => ({ city: 'Paris', ...over })

describe('siteCategoriesPresent', () => {
  it('returns only the categories that actually have a site, in tab order', () => {
    const rows = [
      row({ is_headquarters: true }), // headquarters
      row({ type: 'Site industriel' }), // industrial
      row({ type: 'Établissement secondaire' }), // establishment
    ]
    // office is absent → not offered; order is canonical
    expect(siteCategoriesPresent(rows)).toEqual(['headquarters', 'establishment', 'industrial'])
  })

  it('omits every category when there are no rows', () => {
    expect(siteCategoriesPresent([])).toEqual([])
  })

  it('never offers an empty category (the SNCF « Sites industriels » bug)', () => {
    // all rows are plain establishments → only establishment is offered
    const rows = [row({ type: 'Établissement' }), row({ type: 'Établissement secondaire' })]
    const present = siteCategoriesPresent(rows)
    expect(present).toEqual(['establishment'])
    expect(present).not.toContain('industrial')
    expect(present).not.toContain('headquarters')
  })
})
