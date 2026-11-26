import { describe, expect, it } from 'vitest'
import { isDetailPath } from './isDetailPath'

describe('isDetailPath (#3713.9)', () => {
  it.each(['/contacts/abc', '/accounts/42', '/accounts/42/contacts'])('%s est une fiche', path => {
    expect(isDetailPath(path)).toBe(true)
  })
  it.each(['/contacts', '/contacts/', '/', '/settings', '/billing'])('%s n’en est pas une', path => {
    expect(isDetailPath(path)).toBe(false)
  })
})
