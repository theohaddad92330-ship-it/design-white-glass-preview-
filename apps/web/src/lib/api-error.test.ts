import { describe, expect, it } from 'vitest'
import { extractError, validationIssueFields } from './api-error'

const json = (body: unknown, status = 400) => new Response(JSON.stringify(body), { status })

/** #4833 — « Validation failed » nu ne dit ni le champ ni la règle : le filtre API renvoie pourtant `errors`. */
describe('extractError — refus de validation', () => {
  it('nomme le champ et la règle au lieu de « Validation failed » nu', async () => {
    const { message } = await extractError(
      json({
        message: 'Validation failed',
        errors: [{ path: ['years_experience'], message: 'Number must be less than or equal to 60' }],
      }),
    )
    expect(message).toBe('years_experience : Number must be less than or equal to 60')
  })

  it('garde le message quand aucun détail n’est fourni (sait dire NON)', async () => {
    expect((await extractError(json({ message: 'Validation failed' }))).message).toBe('Validation failed')
    expect((await extractError(json({ message: 'Validation failed', errors: [] }))).message).toBe('Validation failed')
  })

  it('n’altère pas un autre message', async () => {
    expect(
      (await extractError(json({ message: 'Interdit', errors: [{ path: ['x'], message: 'y' }] }, 403))).message,
    ).toBe('Interdit')
  })

  it('validationIssueFields lit les champs refusés (premier segment du chemin)', () => {
    expect(
      validationIssueFields({
        errors: [
          { path: ['full_name'], message: 'a' },
          { path: ['title', 0], message: 'b' },
        ],
      }),
    ).toEqual(['full_name', 'title'])
    expect(validationIssueFields(null)).toEqual([])
    expect(validationIssueFields({ errors: 'x' })).toEqual([])
  })
})
