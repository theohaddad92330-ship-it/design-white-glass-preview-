#!/usr/bin/env node
/**
 * Generates `src/tlds.generated.ts` from the `tlds` package.
 *
 * Why: the `tlds` npm package ships a raw JSON file as its main entry. Node 22+ ESM loaders
 * refuse to import JSON without a `with { type: 'json' }` attribute — but that attribute is
 * only accepted under `module: nodenext|esnext` in TypeScript. Since `apps/api` compiles in
 * `commonjs` and transitively type-checks our `src/`, we can't use that syntax in source.
 *
 * Solution: freeze the TLD list into a plain `.ts` file. No runtime JSON import, no conditional
 * loaders — just a typed readonly array. The file is COMMITTED.
 *
 * Déterminisme (lot B2 ci/1-caches, 31/10/2026) : le `prebuild` ne réécrit le fichier QUE si son
 * contenu change (nouvelle version de `tlds`). Un build ne touche donc plus jamais un fichier suivi
 * quand rien n'a bougé : le hash turbo de `@bellum/utils` (et de ses dépendants) reste celui du SHA.
 *
 *   node scripts/generate-tlds.mjs          → écrit si le contenu diffère (prebuild)
 *   node scripts/generate-tlds.mjs --check  → n'écrit jamais ; sort 1 si le fichier commité est périmé
 *                                             (garde : `src/tlds-synchro.test.ts`)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const tlds = /** @type {readonly string[]} */ (require('tlds'))

const here = dirname(fileURLToPath(import.meta.url))
const targetArg = process.argv.indexOf('--target')
const target = targetArg > -1 ? resolve(process.argv[targetArg + 1]) : resolve(here, '..', 'src', 'tlds.generated.ts')

const header = `// Auto-generated from the \`tlds\` package at build time. Do not edit by hand.
// Regenerate via \`pnpm --filter @bellum/utils build\` (prebuild hook runs generate-tlds.mjs).
/* eslint-disable */
`

const body = `export const TLDS: readonly string[] = ${JSON.stringify(tlds)}\n`
const expected = header + body

let current = null
try {
  current = readFileSync(target, 'utf8')
} catch {
  // Fichier absent : il sera écrit (ou signalé par --check).
}

if (process.argv.includes('--check')) {
  if (current !== expected) {
    console.error(
      `tlds.generated.ts est périmé par rapport au paquet \`tlds\` (${tlds.length} TLD attendus) : lancer \`pnpm --filter @bellum/utils build\` et commiter.`,
    )
    process.exit(1)
  }
  console.log(`tlds.generated.ts à jour (${tlds.length} TLD).`)
} else if (current === expected) {
  console.log(`tlds.generated.ts inchangé (${tlds.length} TLD) — non réécrit.`)
} else {
  writeFileSync(target, expected)
  console.log(`Wrote ${tlds.length} TLDs to ${target}`)
}
