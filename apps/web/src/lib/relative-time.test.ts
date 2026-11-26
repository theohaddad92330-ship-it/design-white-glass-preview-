import { afterAll, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { formatTimeAgo } from './relative-time'

const NOW = Date.UTC(2026, 6, 19, 12, 0, 0)
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const initialLanguage = i18n.language
afterAll(async () => {
  await i18n.changeLanguage(initialLanguage)
})

describe('formatTimeAgo — FR', () => {
  it('renders French relative times with plurals', async () => {
    await i18n.changeLanguage('fr')
    expect(formatTimeAgo(ago(3 * DAY), NOW)).toBe('il y a 3 jours')
    expect(formatTimeAgo(ago(1 * DAY), NOW)).toBe('hier')
    expect(formatTimeAgo(ago(2 * HOUR), NOW)).toBe('il y a 2 heures')
    expect(formatTimeAgo(ago(1 * HOUR), NOW)).toBe('il y a 1 heure')
    expect(formatTimeAgo(ago(5 * MINUTE), NOW)).toBe('il y a 5 minutes')
  })
})

describe('formatTimeAgo — EN', () => {
  it('renders English relative times instead of the hardcoded French', async () => {
    await i18n.changeLanguage('en')
    // `timeAgo` from @bellum/utils returned "il y a 3j" here, in the English UI.
    expect(formatTimeAgo(ago(3 * DAY), NOW)).toBe('3 days ago')
    expect(formatTimeAgo(ago(1 * DAY), NOW)).toBe('yesterday')
    expect(formatTimeAgo(ago(2 * HOUR), NOW)).toBe('2 hours ago')
    expect(formatTimeAgo(ago(1 * HOUR), NOW)).toBe('1 hour ago')
  })

  it('returns an empty string for an unparseable value', () => {
    expect(formatTimeAgo('pas une date', NOW)).toBe('')
  })
})
