import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import {
  formatRegistryDateIfKnown,
  formatSignalDate,
  formatSignalDateIfKnown,
  plausibleRegistryDate,
} from './signal-date'

const initialLanguage = i18n.language

afterAll(async () => {
  await i18n.changeLanguage(initialLanguage)
})

describe('formatSignalDate — FR', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr')
  })

  it('renders a full date at day precision', () => {
    expect(formatSignalDate('2026-07-15')).toBe('15 juil. 2026')
  })

  it('renders a year-only signal as the YEAR, not as 1 January', () => {
    // The production bug: six Veille rows showed "1 janv. 2026" / "1 janv. 2025"
    // because `new Date('2026')` is 2026-01-01. The source only ever said "2026".
    expect(formatSignalDate('2026')).toBe('2026')
    expect(formatSignalDate('2025')).toBe('2025')
  })

  it('renders a month-precision signal as month + year, keeping the real month', () => {
    expect(formatSignalDate('2026-07')).toBe('juil. 2026')
    // `new Date('juillet 2026')` returned 1 January 2026 — the month was lost.
    expect(formatSignalDate('juillet 2026')).toBe('juil. 2026')
  })

  it('renders a year range as a range', () => {
    expect(formatSignalDate('2023-2024')).toBe('2023–2024')
  })

  it('translates a relative expression instead of leaking English', () => {
    // "3 days ago" used to render verbatim in the French UI.
    expect(formatSignalDate('3 days ago')).toBe('il y a 3 jours')
    expect(formatSignalDate('1 day ago')).toBe('il y a 1 jour')
    expect(formatSignalDate('2 weeks ago')).toBe('il y a 2 semaines')
    expect(formatSignalDate('1 week ago')).toBe('il y a 1 semaine')
    expect(formatSignalDate('4 years ago')).toBe('il y a 4 ans')
    expect(formatSignalDate('1 year ago')).toBe('il y a 1 an')
  })

  it('never echoes raw LLM prose back to the screen', () => {
    expect(formatSignalDate('Non daté précisément')).toBe('Non daté')
    expect(formatSignalDate('')).toBe('Non daté')
    expect(formatSignalDate(null)).toBe('Non daté')
  })
})

describe('formatSignalDate — EN', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders dates in the English locale', () => {
    expect(formatSignalDate('2026-07-15')).toBe('15 Jul 2026')
    expect(formatSignalDate('2026-07')).toBe('Jul 2026')
    expect(formatSignalDate('2026')).toBe('2026')
  })

  it('renders relative expressions in English with correct plurals', () => {
    expect(formatSignalDate('3 days ago')).toBe('3 days ago')
    expect(formatSignalDate('1 day ago')).toBe('1 day ago')
    expect(formatSignalDate('2 weeks ago')).toBe('2 weeks ago')
  })

  it('renders the undated label in English', () => {
    expect(formatSignalDate('Non daté précisément')).toBe('Undated')
  })
})

// #3928.2 — BlaBlaCar « déc. 2026 » dans /mes-cibles le 09/10/2026 : une date future lue comme passée.
describe('formatSignalDate — une date future est NOMMÉE « à vérifier » (#3928.2)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('ne présente pas décembre 2026 comme un fait passé le 09/10/2026', () => {
    expect(formatSignalDate('2026-12')).toBe('déc. 2026 · date à vérifier')
    expect(formatSignalDateIfKnown('2026-12-15')).toBe('15 déc. 2026 · date à vérifier')
  })

  it('sait dire NON : le passé, le mois courant et aujourd’hui restent sans mention', () => {
    expect(formatSignalDate('2026-09')).toBe('sept. 2026')
    expect(formatSignalDate('2026-10')).toBe('oct. 2026')
    expect(formatSignalDate('2026-10-09')).toBe('9 oct. 2026')
    expect(formatSignalDate('Non daté')).not.toMatch(/vérifier/)
  })
})

describe('plausibleRegistryDate — date sentinelle de registre (#5, recette 23/10)', () => {
  it.each([
    '1900-01-01',
    '1900-01-01T00:00:00Z',
    '01/01/1900',
    '1901-05-01',
    '1900',
    '0001-01-01',
    '',
    null,
    undefined,
  ])('n’affiche pas %s', raw => {
    expect(plausibleRegistryDate(raw)).toBeNull()
    expect(formatRegistryDateIfKnown(raw)).toBeNull()
  })

  it('garde une vraie date, telle quelle', () => {
    expect(plausibleRegistryDate('1982-09-17')).toBe('1982-09-17')
    expect(plausibleRegistryDate('17/09/1982')).toBe('17/09/1982')
    expect(formatRegistryDateIfKnown('1982-09-17')).toMatch(/1982/)
  })
})
