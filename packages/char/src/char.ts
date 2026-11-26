import stripIndent from 'strip-indent'

/** Non-breaking space character (U+00A0) */
export const nbsp = '\xa0'

/** HTML entity for non-breaking space */
export const nbspEntity = '&nbsp;'

/** Capitalize the first letter of a string */
export function capitalize(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Returns true if the string is empty or contains only whitespace */
export function isEmptyOrBlankSpaces(text: string): boolean {
  return text.trim().length === 0
}

const diacriticsMap: Record<string, string> = {
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ß: 'ss',
  ð: 'd',
  Ð: 'D',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ł: 'l',
  Ł: 'L',
}

const diacriticsRegex = new RegExp(Object.keys(diacriticsMap).join('|'), 'g')

/**
 * Remove accents and special characters from a string.
 * Handles ligatures (æ→ae, œ→oe), ß→ss, and standard diacritics via NFKD normalization.
 */
export function removeAccentsAndSpecialCharacters(text: string): string {
  return text
    .replace(diacriticsRegex, match => diacriticsMap[match] ?? match)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Remove common leading indentation from each line, then trim the result.
 * Useful for formatting multi-line template literals (prompts, SQL, etc.).
 */
export function trimIndent(text: string): string {
  return stripIndent(text).trim()
}
