import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4836 — l'aperçu PDF de la fiche compte charge ses polices Geist par `fetch()` (`Font.register` de
 * `@react-pdf/renderer`) : c'est `connect-src` qui tranche, et la police elle-même relève de `font-src`.
 * `cdn.jsdelivr.net` n'était dans aucune des deux, donc « PDF rendering failed » (#4292.13, #4293.7).
 * La garde précédente ne lisait que `script-src` / `worker-src` : elle ne savait pas dire NON sur les polices.
 *
 * Règle : toute origine distante de `account-pdf/styles.ts` figure dans `connect-src` ET `font-src` de chaque
 * CSP, et aucune référence n'est mutable (`@main`, `@master`, `@latest`).
 */
const STYLES_PATH = join(__dirname, '../lib/account-pdf/styles.ts')
const VERCEL_PATH = join(__dirname, '../../vercel.json')

const directive = (policy: string, name: string): string[] =>
  (
    policy
      .split(';')
      .map(part => part.trim().split(/\s+/))
      .find(tokens => tokens[0] === name) ?? []
  ).slice(1)

const policiesOf = (vercelJson: string): string[] =>
  (JSON.parse(vercelJson) as { headers: { headers: { key: string; value: string }[] }[] }).headers.flatMap(rule =>
    rule.headers.filter(header => header.key.toLowerCase() === 'content-security-policy').map(header => header.value),
  )

const remoteUrlsOf = (source: string): string[] => source.match(/https?:\/\/[^\s'"`)]+/g) ?? []

const originsOf = (source: string): string[] => [...new Set(remoteUrlsOf(source).map(url => new URL(url).origin))]

/** Les origines que la CSP ne déclare pas dans `connect-src` OU `font-src`, pour une politique donnée. */
const undeclaredOrigins = (origins: string[], policy: string): string[] =>
  origins.filter(
    origin => !directive(policy, 'connect-src').includes(origin) || !directive(policy, 'font-src').includes(origin),
  )

const mutableReferences = (source: string): string[] =>
  remoteUrlsOf(source).filter(url => /@(main|master|latest|HEAD)\b/.test(url))

const styles = readFileSync(STYLES_PATH, 'utf8')
const policies = policiesOf(readFileSync(VERCEL_PATH, 'utf8'))

describe('#4836 — les polices distantes de l’aperçu PDF sont déclarées dans la CSP', () => {
  it('lit bien une origine distante dans styles.ts et une CSP dans vercel.json', () => {
    expect(originsOf(styles).length).toBeGreaterThan(0)
    expect(policies.length).toBeGreaterThan(0)
  })

  it.each(policies)('« %s » déclare chaque origine de police dans connect-src ET font-src', policy => {
    expect(undeclaredOrigins(originsOf(styles), policy)).toEqual([])
  })

  it('aucune police n’est référencée par une branche mutable', () => {
    expect(mutableReferences(styles)).toEqual([])
  })

  describe('contrôles négatifs : la garde sait dire NON', () => {
    const policy = (connect: string, font: string): string =>
      `default-src 'self'; connect-src 'self' ${connect}; font-src 'self' data: ${font}`

    it('échoue si l’origine est retirée de connect-src', () => {
      expect(undeclaredOrigins(['https://cdn.jsdelivr.net'], policy('', 'https://cdn.jsdelivr.net'))).toEqual([
        'https://cdn.jsdelivr.net',
      ])
    })

    it('échoue si l’origine est retirée de font-src', () => {
      expect(undeclaredOrigins(['https://cdn.jsdelivr.net'], policy('https://cdn.jsdelivr.net', ''))).toEqual([
        'https://cdn.jsdelivr.net',
      ])
    })

    it('échoue sur une origine ajoutée dans styles.ts sans être déclarée', () => {
      const ajoutee = `${styles}\nconst AUTRE = 'https://fonts.example.org/x.ttf'`
      expect(undeclaredOrigins(originsOf(ajoutee), policies[0] ?? '')).toEqual(['https://fonts.example.org'])
    })

    it('échoue sur une référence @main', () => {
      expect(mutableReferences("const A = 'https://cdn.jsdelivr.net/gh/vercel/geist-font@main/f.ttf'")).toHaveLength(1)
    })
  })
})
