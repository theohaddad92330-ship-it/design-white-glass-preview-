import { formatArchivePeriod } from './referenceArchive'

describe('formatArchivePeriod — Théo A comptes-fiche-reference.N4', () => {
  it('deux jours de la même année : 30/09–01/10/2026', () => {
    expect(formatArchivePeriod('2026-09-30', '2026-10-01')).toBe('30/09–01/10/2026')
  })

  it('un seul jour : la date entière', () => {
    expect(formatArchivePeriod('2026-10-01', '2026-10-01')).toBe('01/10/2026')
  })

  it('deux années : les deux dates entières', () => {
    expect(formatArchivePeriod('2025-12-30', '2026-01-02')).toBe('30/12/2025–02/01/2026')
  })
})
