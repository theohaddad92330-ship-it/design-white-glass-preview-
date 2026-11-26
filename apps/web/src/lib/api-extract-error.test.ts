import { describe, expect, it } from 'vitest'
// Import from the real module, NOT `@/lib/api` — the test suite globally mocks
// `@/lib/api`, which would replace `extractError` with a stub.
import { extractError } from '@/lib/api-error'

/**
 * `extractError`'s last-resort branch — the literal source of the string the
 * seller saw.
 *
 * It fires when the server replies with something that carries no message: a
 * bare-string 500 (Express serialises a string body as text/html, so
 * `res.json()` throws), or a proxy's HTML 504. It used to answer `'API error'` —
 * untranslated, in a French UI, and phrased as a diagnosis when it is precisely
 * the absence of one.
 */
describe('extractError', () => {
  const res = (body: string, status: number, contentType: string): Response =>
    new Response(body, { status, headers: { 'Content-Type': contentType } })

  describe('when the server gave no reason', () => {
    it('does not say "API error" for a non-JSON body', async () => {
      // The exact production shape: the catch-all filter's bare string 500.
      const { message } = await extractError(res('Internal server error', 500, 'text/html'))
      expect(message).not.toBe('API error')
    })

    it('admits the failure had no stated reason, and carries the status', async () => {
      // The status is the one thing we genuinely know. "erreur 504" is
      // actionable in a support ticket in a way "API error" never was.
      const { message } = await extractError(res('<html><title>504 Gateway Time-out</title></html>', 504, 'text/html'))
      expect(message).toContain('504')
      expect(message).toMatch(/raison/i)
    })

    it('is localized, not a hardcoded English string', async () => {
      const { message } = await extractError(res('{}', 500, 'application/json'))
      // JSON body with no `message`/`error` key takes the same honest fallback.
      expect(message).toMatch(/serveur/i)
      expect(message).toContain('500')
    })
  })

  describe('when the endpoint did explain itself', () => {
    it('prefers the server message', async () => {
      const body = JSON.stringify({ message: 'Le fournisseur est indisponible.', code: 'upstream_error' })
      const { message } = await extractError(res(body, 502, 'application/json'))
      expect(message).toBe('Le fournisseur est indisponible.')
    })

    it('carries the machine code through for the caller to localise', async () => {
      const body = JSON.stringify({ message: 'peu importe', code: 'unauthorized' })
      const { code } = await extractError(res(body, 502, 'application/json'))
      expect(code).toBe('unauthorized')
    })

    it('still handles the ValidationPipe string[] shape', async () => {
      // Regression guard: this branch predates the change and must survive it.
      const body = JSON.stringify({ message: ['first_name should not be empty'] })
      const { message } = await extractError(res(body, 400, 'application/json'))
      expect(message).toBe('first_name should not be empty')
    })
  })

  // #4833 — « Validation failed » nu ne nomme ni le champ ni la règle.
  describe('when the server refuses a validation (#4833)', () => {
    const refusal = (errors: unknown) =>
      res(JSON.stringify({ statusCode: 400, message: 'Validation failed', errors }), 400, 'application/json')

    it('names the field and the rule instead of the bare sentence', async () => {
      const { message } = await extractError(
        refusal([{ code: 'too_small', path: ['email'], message: 'Invalid email' }]),
      )
      expect(message).toBe('email : Invalid email')
    })

    it('lists every refused field', async () => {
      const { message } = await extractError(
        refusal([
          { path: ['full_name'], message: 'Required' },
          { path: ['years_experience'], message: 'Number must be less than or equal to 60' },
        ]),
      )
      expect(message).toBe('full_name : Required ; years_experience : Number must be less than or equal to 60')
    })

    it('keeps the sentence when the body carries no detail', async () => {
      const { message } = await extractError(refusal([]))
      expect(message).toBe('Validation failed')
    })
  })
})
