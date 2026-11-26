import { changesReferenceDate } from './account-changes-reference'

describe('changesReferenceDate — #4180 R25', () => {
  it('la ré-analyse garde la main', () => {
    const previous = new Date('2026-10-01T00:00:00Z')
    expect(changesReferenceDate(previous, '2026-09-01T00:00:00Z')).toBe(previous)
  })
  it('un dossier analysé une seule fois se compare à sa dernière analyse', () => {
    expect(changesReferenceDate(null, '2026-09-01T00:00:00Z')?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })
  it('sans aucune date lisible : null, jamais une date devinée', () => {
    expect(changesReferenceDate(null, null)).toBeNull()
    expect(changesReferenceDate(null, 'pas une date')).toBeNull()
  })
})
