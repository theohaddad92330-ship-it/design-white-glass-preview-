import { describe, expect, it } from 'vitest'
import { formatName } from './formatName'

describe('formatName', () => {
  it('returns the full name unchanged in full mode', () => {
    expect(formatName('Jean Dupont', 'full')).toBe('Jean Dupont')
  })

  it('keeps only the first token in first mode', () => {
    expect(formatName('Jean Dupont', 'first')).toBe('Jean')
    expect(formatName('Marie-Claire De La Tour', 'first')).toBe('Marie-Claire')
  })

  it('builds initials from the first and last tokens', () => {
    expect(formatName('Jean Dupont', 'initials')).toBe('JD')
    expect(formatName('marie claire dubois', 'initials')).toBe('MD')
  })

  it('degrades gracefully on a single token', () => {
    expect(formatName('Cher', 'first')).toBe('Cher')
    expect(formatName('cher', 'initials')).toBe('C')
  })

  it('handles empty / whitespace names without inventing anything', () => {
    expect(formatName('', 'initials')).toBe('')
    expect(formatName('   ', 'first')).toBe('')
  })

  it('collapses extra whitespace', () => {
    expect(formatName('  Jean   Dupont  ', 'full')).toBe('Jean   Dupont'.trim())
    expect(formatName('  Jean   Dupont  ', 'initials')).toBe('JD')
  })
})
