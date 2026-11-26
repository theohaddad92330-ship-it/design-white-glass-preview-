import { describe, expect, it } from 'vitest'
import {
  nbsp,
  nbspEntity,
  capitalize,
  isEmptyOrBlankSpaces,
  removeAccentsAndSpecialCharacters,
  trimIndent,
} from './char.js'

describe('nbsp', () => {
  it('should be a non-breaking space', () => {
    expect(nbsp).toBe('\xa0')
    expect(nbsp.charCodeAt(0)).toBe(160)
  })
})

describe('nbspEntity', () => {
  it('should be the HTML entity', () => {
    expect(nbspEntity).toBe('&nbsp;')
  })
})

describe('capitalize', () => {
  it('should capitalize the first letter', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('should handle empty string', () => {
    expect(capitalize('')).toBe('')
  })

  it('should handle single character', () => {
    expect(capitalize('a')).toBe('A')
  })

  it('should not change already capitalized', () => {
    expect(capitalize('Hello')).toBe('Hello')
  })
})

describe('isEmptyOrBlankSpaces', () => {
  it('should return true for empty string', () => {
    expect(isEmptyOrBlankSpaces('')).toBe(true)
  })

  it('should return true for spaces only', () => {
    expect(isEmptyOrBlankSpaces('   ')).toBe(true)
  })

  it('should return true for tabs and newlines', () => {
    expect(isEmptyOrBlankSpaces('\t\n  ')).toBe(true)
  })

  it('should return false for non-empty string', () => {
    expect(isEmptyOrBlankSpaces('hello')).toBe(false)
  })
})

describe('removeAccentsAndSpecialCharacters', () => {
  it('should remove accents', () => {
    expect(removeAccentsAndSpecialCharacters('café')).toBe('cafe')
    expect(removeAccentsAndSpecialCharacters('résumé')).toBe('resume')
    expect(removeAccentsAndSpecialCharacters('naïve')).toBe('naive')
  })

  it('should handle ligatures', () => {
    expect(removeAccentsAndSpecialCharacters('æther')).toBe('aether')
    expect(removeAccentsAndSpecialCharacters('œuvre')).toBe('oeuvre')
  })

  it('should handle ß', () => {
    expect(removeAccentsAndSpecialCharacters('Straße')).toBe('Strasse')
  })

  it('should handle ø and ð', () => {
    expect(removeAccentsAndSpecialCharacters('Ørsted')).toBe('Orsted')
    expect(removeAccentsAndSpecialCharacters('ðat')).toBe('dat')
  })

  it('should leave plain ASCII unchanged', () => {
    expect(removeAccentsAndSpecialCharacters('hello world')).toBe('hello world')
  })
})

describe('trimIndent', () => {
  it('should remove common indentation', () => {
    const input = `
      hello
      world
    `
    expect(trimIndent(input)).toBe('hello\nworld')
  })

  it('should handle mixed indentation', () => {
    const input = `
      line 1
        line 2
      line 3
    `
    expect(trimIndent(input)).toBe('line 1\n  line 2\nline 3')
  })

  it('should trim leading/trailing whitespace', () => {
    expect(trimIndent('  hello  ')).toBe('hello')
  })
})
