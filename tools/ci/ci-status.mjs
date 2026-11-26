#!/usr/bin/env node
/**
 * Diagnostic de `CI Status` : NOMME le job rouge ou annulé (#4869.2).
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 * Le job sortait « CI failed: one or more jobs failed » sans dire lequel. Un job coupé par son plafond
 * (`timeout-minutes`) sort `cancelled` SANS étape rouge : `--log-failed` ne montrait que `CI Status`, et six PR du
 * 29/10/2026 ont lu « rien à corriger » (#4834). Ici le job annulé est nommé, avec son plafond lu dans `ci.yml`.
 *
 * Diagnostic seulement : la porte reste la boucle de `ci.yml` (aucun verdict ne change). Sort toujours 0.
 *
 * Usage (depuis ci.yml) : NEEDS_JSON='${{ toJSON(needs) }}' node tools/ci/ci-status.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** `{ name, timeout }` d'un job de `ci.yml` (le bloc va de sa déclaration à la suivante). */
function jobInfo(ciYml, id) {
  const lines = ciYml.split('\n')
  const start = lines.findIndex(line => line === `  ${id}:`)
  if (start === -1) return { name: id, timeout: null }
  let name = id
  let timeout = null
  for (const line of lines.slice(start + 1)) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(line) || /^\S/.test(line)) break
    name = /^ {4}name:\s*(.+?)\s*$/.exec(line)?.[1]?.replace(/^(['"])(.*)\1$/, '$2') ?? name
    timeout = /^ {4}timeout-minutes:\s*(\d+)/.exec(line)?.[1] ?? timeout
  }
  return { name, timeout }
}

/** @param {Record<string, { result?: string }>} needs  @param {string} ciYml */
export function diagnoseNeeds(needs, ciYml) {
  const failed = []
  const cancelled = []
  const lines = []
  for (const [id, { result } = {}] of Object.entries(needs ?? {})) {
    if (result !== 'failure' && result !== 'cancelled') continue
    const { name, timeout } = jobInfo(ciYml, id)
    if (result === 'failure') {
      failed.push(id)
      lines.push(`« ${name} » (${id}) est ROUGE.`)
    } else {
      cancelled.push(id)
      const plafond = timeout ? ` Plafond du job : timeout-minutes: ${timeout}.` : ''
      lines.push(
        `« ${name} » (${id}) est ANNULÉ sans étape rouge : le plus probable est un job coupé à son plafond.${plafond}`,
      )
    }
  }
  return { failed, cancelled, lines }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  let needs = {}
  try {
    needs = JSON.parse(process.env.NEEDS_JSON ?? '{}')
  } catch {
    console.log('ci-status : NEEDS_JSON illisible, pas de diagnostic.')
  }
  const { lines } = diagnoseNeeds(needs, readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8'))
  for (const line of lines) console.log(`::error title=CI Status::${line}`)
}
