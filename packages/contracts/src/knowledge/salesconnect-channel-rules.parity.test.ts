import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SALESCONNECT_CORPUS_GOVERNANCE, SALESCONNECT_CORPUS_RULES } from './salesconnect-corpus.js'

/**
 * #3382.a — les règles SalesConnect bornées à un canal (LinkedIn, téléphone)
 * voyagent vers le corpus de méthode du chat (`apps/ia`, Python).
 *
 * `apps/ia` ne peut pas importer `packages/contracts` (racine Railway) : le
 * JSON `apps/ia/app/knowledge/method_channel_rules.json` est la PHOTO de ces
 * règles, JAMAIS une copie tapée à la main — ce test échoue dès que la photo
 * s'écarte de `SALESCONNECT_CORPUS_RULES` (un réglage vit à un seul endroit,
 * GA-26). Régénérer : `UPDATE_CHANNEL_RULES=1 pnpm --filter @bellum/contracts exec vitest run
 * src/knowledge/salesconnect-channel-rules.parity.test.ts`.
 */

const _here = dirname(fileURLToPath(import.meta.url))

function monorepoFile(relative: string): string {
  let current = _here
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, relative)
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  throw new Error(`Fichier introuvable en remontant depuis ${_here} : ${relative}`)
}

const SNAPSHOT_PATH = monorepoFile('apps/ia/app/knowledge/method_channel_rules.json')

function expectedSnapshot() {
  const enabledIds = new Set(
    SALESCONNECT_CORPUS_GOVERNANCE.filter(entry => entry.enabled && !entry.disabled_reason).map(entry => entry.rule_id),
  )
  return SALESCONNECT_CORPUS_RULES.filter(
    rule => rule.applicable_channels.length > 0 && enabledIds.has(rule.rule_id),
  ).map(rule => ({
    rule_id: rule.rule_id,
    title: rule.title,
    recommendation: rule.recommendation,
    source_document: rule.source_document,
    applicable_channels: [...rule.applicable_channels],
  }))
}

describe('règles SalesConnect bornées à un canal — le miroir JSON pour apps/ia (#3382.a)', () => {
  if (process.env.UPDATE_CHANNEL_RULES === '1') {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(expectedSnapshot(), null, 2)}\n`)
  }

  it('la photo commitée est identique à ce que le corpus TypeScript calcule', () => {
    expect(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))).toEqual(expectedSnapshot())
  })

  it('porte les sept règles gouvernées (cinq LinkedIn, deux téléphone) — preuve que le test lit quelque chose', () => {
    const snapshot = expectedSnapshot()
    expect(snapshot.filter(rule => rule.applicable_channels.includes('linkedin'))).toHaveLength(5)
    expect(snapshot.filter(rule => rule.applicable_channels.includes('phone'))).toHaveLength(2)
  })
})
