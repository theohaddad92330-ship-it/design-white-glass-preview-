import { z } from 'zod'

const sirenRegex = /^[0-9]{9}$/

export function parseSirenValue(input: string): string | null {
  const trimmedInput = input.replace(/\s/g, '').trim()
  if (sirenRegex.test(trimmedInput)) {
    return trimmedInput
  }
  return null
}

export function formatSirenValue(siren: string): string {
  return [siren.substring(0, 3), siren.substring(3, 6), siren.substring(6)].join('\u00A0')
}

export const sirenValueZodSchema = z.string().refine(s => parseSirenValue(s) !== null, {
  message: 'Invalid siren',
})
