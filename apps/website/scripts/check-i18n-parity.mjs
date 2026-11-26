#!/usr/bin/env node
/**
 * i18n parity guard for the marketing site (next-intl catalogs).
 *
 * FR is the reference. Every other locale must expose the exact same key tree
 * for every namespace (0 missing / 0 extra key), with matching {placeholders}
 * and no empty values. Run with `pnpm --filter @bellum/website check:i18n`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages')
const REFERENCE = 'fr'

const locales = readdirSync(MESSAGES_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

const namespaces = readdirSync(join(MESSAGES_DIR, REFERENCE))
  .filter(file => file.endsWith('.json'))
  .sort()

function flatten(tree, prefix = '') {
  const out = new Map()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out.set(path, value)
    } else if (value && typeof value === 'object') {
      for (const [subPath, subValue] of flatten(value, path)) {
        out.set(subPath, subValue)
      }
    }
  }
  return out
}

function placeholders(value) {
  return [...value.matchAll(/\{\s*([\w.]+)\s*\}/g)].map(m => m[1]).sort()
}

function load(locale, namespace) {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, locale, namespace), 'utf8'))
}

let errors = 0
const report = message => {
  errors += 1
  console.error(`✗ ${message}`)
}

for (const namespace of namespaces) {
  const reference = flatten(load(REFERENCE, namespace))

  for (const locale of locales) {
    let flat
    try {
      flat = flatten(load(locale, namespace))
    } catch {
      report(`${locale}/${namespace}: file missing or invalid JSON`)
      continue
    }

    for (const key of reference.keys()) {
      if (!flat.has(key)) report(`${locale}/${namespace}: missing key "${key}"`)
    }
    for (const key of flat.keys()) {
      if (!reference.has(key)) report(`${locale}/${namespace}: extra key "${key}" (not in ${REFERENCE})`)
    }
    for (const [key, value] of flat) {
      const ref = reference.get(key)
      // Une valeur vide n'est un défaut que si la RÉFÉRENCE, elle, en porte une :
      // c'est alors une traduction oubliée. Vide des deux côtés, c'est un blanc
      // VOULU — la carte « Free » n'a pas de « HT / mois » à afficher, et la
      // garde ne doit pas forcer à inventer une unité pour la faire taire.
      if (value.trim() === '' && ref !== undefined && ref.trim() !== '') {
        report(`${locale}/${namespace}: empty value at "${key}" (${REFERENCE} is not empty)`)
      }
      if (ref !== undefined && placeholders(ref).join(',') !== placeholders(value).join(',')) {
        report(
          `${locale}/${namespace}: placeholder mismatch at "${key}" — ${REFERENCE} [${placeholders(ref).join(', ')}] vs ${locale} [${placeholders(value).join(', ')}]`,
        )
      }
    }
  }
}

const keyCounts = locales
  .map(locale => {
    const total = namespaces.reduce((sum, ns) => {
      try {
        return sum + flatten(load(locale, ns)).size
      } catch {
        return sum
      }
    }, 0)
    return `${locale}=${total}`
  })
  .join(' · ')

if (errors > 0) {
  console.error(`\ni18n parity FAILED — ${errors} problem(s) across locales [${locales.join(', ')}].`)
  process.exit(1)
}

console.log(`i18n parity OK — ${locales.length} locales × ${namespaces.length} namespaces (${keyCounts}).`)
