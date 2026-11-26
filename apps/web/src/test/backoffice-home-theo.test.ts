import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Refonte Théo (PR12) — `/bak/home` dans la grammaire des réglages : la phrase vit
 * dans l'en-tête de la coque (`pageSubtitle`), le corps est UN bloc `.v12-setting-block`
 * (titre h2 au-dessus d'un filet, puis l'accès à la console), et le rappel « ton espace
 * n'a pas changé » reste sous le bloc. Lu dans la source : la route monte toute la coque.
 */
const source = readFileSync(join(__dirname, '../routes/bak/home.tsx'), 'utf8')
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('/bak/home — grammaire Théo', () => {
  it('la phrase passe dans l’en-tête de la coque, jamais en paragraphe du corps', () => {
    expect(code).toMatch(/pageSubtitle=\{t\('backoffice\.lead'\)\}/)
    expect(code.match(/backoffice\.lead/g)).toHaveLength(1)
  })

  it('un bloc titré (h2) au-dessus d’un filet, qui porte la console, puis le rappel', () => {
    const block = code.indexOf('aria-labelledby="backoffice-console"')
    const title = code.indexOf('element="h2" id="backoffice-console"')
    const console = code.indexOf('<BackofficeConsoleLink />')
    const stays = code.indexOf("t('backoffice.stays')")
    expect(block).toBeGreaterThan(-1)
    expect(code).toMatch(/border-b border-\[var\(--bellum-border\)\] pb-4/)
    expect(block).toBeLessThan(title)
    expect(title).toBeLessThan(console)
    expect(console).toBeLessThan(stays)
  })

  it('NON : plus de carte générique `Card` ni de titre répété dans le corps', () => {
    expect(code).not.toMatch(/<Card\b/)
    expect(code).not.toMatch(/element="h1"/)
  })
})
