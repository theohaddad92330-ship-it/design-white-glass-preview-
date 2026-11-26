import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const yml = readFileSync(resolve(__dirname, '../../../../.github/dependabot.yml'), 'utf8')

/** `exclude-patterns` du groupe `majeures` de l'écosystème npm (le premier du fichier). */
function npmMajeuresExclus(): string[] {
  const npm = yml.slice(yml.indexOf('package-ecosystem: npm'), yml.indexOf('package-ecosystem: pip'))
  const bloc = /exclude-patterns:\n((?: {10}- .+\n)+)/.exec(npm)?.[1] ?? ''
  return bloc
    .split('\n')
    .map(l =>
      l
        .replace(/^ *- /, '')
        .trim()
        .replace(/^['"]|['"]$/g, ''),
    )
    .filter(Boolean)
}

describe('dependabot — le groupe `majeures` npm n’embarque plus de chantier d’outillage (#4895.4)', () => {
  // Chaque paquet sort pour une cause LUE dans les runs 40976851355 et 41167256561 (#4879, #4948) :
  // TS 7 sans ts.sys, Nest 12 ESM seul sous jest CJS, TypeORM 1.x, ESLint 10, lucide 1.x sans `briefcase`…
  it.each([
    'typescript',
    'tailwindcss',
    'vite',
    '@nestjs/*',
    'typeorm',
    'jest',
    'react',
    'react-dom',
    'next',
    'eslint',
    '@sentry/*',
    'stripe',
    '@anthropic-ai/sdk',
    'lucide-react',
  ])('%s est exclu du groupe majeures', name => {
    expect(npmMajeuresExclus()).toContain(name)
  })

  it('sait dire NON : un paquet sans chantier reste dans le groupe', () => {
    expect(npmMajeuresExclus()).not.toContain('zod')
  })
})
