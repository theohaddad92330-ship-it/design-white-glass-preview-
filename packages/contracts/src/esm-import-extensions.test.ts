import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every relative import in this package must carry its `.js` extension.
 *
 * This package is ESM (`"type": "module"`), and Node's ESM resolver does NOT
 * guess extensions: `from './workspace'` resolves at build time (tsc and vitest
 * both rewrite it) and then throws `ERR_MODULE_NOT_FOUND` the first time the
 * built output actually runs under `node`.
 *
 * That gap is the whole reason this test exists. A single extensionless import
 * in `manager.ts` passed typecheck, passed the full vitest suite, passed the
 * repo's lint and format gates, and shipped — then crash-looped the API
 * container on boot in production. Railway's healthcheck did exactly its job
 * and held the previous image, so the API silently served a build from hours
 * earlier while ten deploys in a row failed the same way. Nothing in the
 * developer-facing toolchain could see it, because nothing in the
 * developer-facing toolchain runs the built output under plain `node`.
 *
 * A lint rule would be the tidier home for this, but the rule that covers it
 * lives behind the typed-lint config this repo does not run on `packages/*`.
 * A test is worth more than a tidier rule that is not switched on.
 */

const SRC = join(import.meta.dirname, '.')

/** Relative specifiers only — package imports resolve through `exports`. */
const RELATIVE_IMPORT_RE = /\bfrom\s+'(\.[^']*)'/g

/**
 * Comments are stripped before scanning, because prose that QUOTES a bad import
 * is not a bad import. This file is the proof: its own docstring cites
 * `from './workspace'` as the example that broke production, and the first
 * version of this test flagged itself.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return tsFilesUnder(full)
    return entry.endsWith('.ts') && !entry.endsWith('.d.ts') ? [full] : []
  })
}

describe('ESM relative imports', () => {
  it('every relative import carries its .js extension', () => {
    const offenders: string[] = []

    for (const file of tsFilesUnder(SRC)) {
      const source = withoutComments(readFileSync(file, 'utf8'))
      for (const [, specifier] of source.matchAll(RELATIVE_IMPORT_RE)) {
        // `.json` is resolved by the bundler/loader, not by Node's ESM path
        // resolution, so it is not subject to the extension rule.
        if (specifier!.endsWith('.js') || specifier!.endsWith('.json')) continue
        offenders.push(`${file.replace(SRC, '')} → '${specifier}'`)
      }
    }

    // The message matters as much as the assertion: whoever trips this is
    // seeing a green local suite and needs to know why it would still break.
    expect(
      offenders,
      `Relative imports missing a .js extension — these typecheck and pass ` +
        `vitest, then throw ERR_MODULE_NOT_FOUND under plain node:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})
