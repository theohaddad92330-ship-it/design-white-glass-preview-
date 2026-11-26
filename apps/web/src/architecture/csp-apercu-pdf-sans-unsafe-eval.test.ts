import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4292.13 — l'aperçu PDF de la fiche compte affichait « PDF rendering failed » : le moteur de mise en page
 * de `@react-pdf/renderer` (yoga) compile du WebAssembly, que la CSP `script-src 'self' https://plausible.io`
 * refuse. La réponse n'est JAMAIS `'unsafe-eval'` (il ouvre `eval()` à tout script) mais `'wasm-unsafe-eval'`,
 * qui n'autorise que la compilation WebAssembly ; le worker reste same-origin (`worker-src 'self' blob:`).
 */
const vercel = JSON.parse(readFileSync(join(__dirname, '../../vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const policies = vercel.headers.flatMap(rule =>
  rule.headers.filter(header => header.key.toLowerCase() === 'content-security-policy').map(header => header.value),
)

const directive = (policy: string, name: string): string[] =>
  (
    policy
      .split(';')
      .map(part => part.trim().split(/\s+/))
      .find(tokens => tokens[0] === name) ?? []
  ).slice(1)

describe('la CSP laisse tourner l’aperçu PDF sans ouvrir eval()', () => {
  it('lit bien une CSP dans vercel.json', () => {
    expect(policies.length).toBeGreaterThan(0)
  })

  it.each(policies)('« %s » n’a jamais unsafe-eval', policy => {
    expect(policy).not.toContain("'unsafe-eval'")
  })

  it.each(policies)('« %s » autorise la compilation WebAssembly de la mise en page PDF', policy => {
    expect(directive(policy, 'script-src')).toContain("'wasm-unsafe-eval'")
  })

  it.each(policies)('« %s » garde le worker sur notre origine', policy => {
    expect(directive(policy, 'worker-src')).toEqual(["'self'", 'blob:'])
  })
})
