import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OVERLAYS } from './overlays'
import type { OverlaySpec } from './types'

/**
 * La garde de l'INVENTAIRE des surcouches (`overlays/inventory.md`) : chaque surcouche relevée dans le
 * code a une spec au registre, ou la raison pour laquelle elle attend ; chaque spec du registre est
 * adossée à une ligne de l'inventaire, du même fichier source. Elle LIT le markdown — et sait dire NON
 * (voir les cas fabriqués plus bas).
 */

const INVENTORY = readFileSync(resolve(__dirname, 'overlays/inventory.md'), 'utf8')
const ID = /^`((?:app|site|dm)\/overlays\/[\w-]+)`$/
const CITED = /`((?:app|site|dm)\/overlays\/[\w-]+)`/g

interface Row {
  family: string
  source: string
  status: string
}

/** Les lignes des tableaux d'inventaire (5 colonnes ; l'entête et le séparateur exclus). */
function rowsOf(md: string): Row[] {
  return md
    .split('\n')
    .filter(l => l.startsWith('| ') && !/^\| Famille\s/.test(l) && !/^\|[\s|-]+\|$/.test(l))
    .map(l => {
      const cells = l
        .slice(2, -2)
        .split(/ (?<!\\)\| /)
        .map(c => c.trim())
      return { family: cells[0] ?? '', source: (cells[1] ?? '').replace(/`/g, ''), status: cells[4] ?? '' }
    })
}

function checkInventory(md: string, overlays: readonly OverlaySpec[]): string[] {
  const errors: string[] = []
  const byId = new Map<string, OverlaySpec>(overlays.map(o => [o.id, o]))
  const specified = new Map<string, number>()
  for (const r of rowsOf(md)) {
    if (!r.source || !/:\d+$/.test(r.source)) errors.push(`ligne sans source fichier:ligne : « ${r.source} »`)
    if (!r.status) errors.push(`${r.source} : ni spec ni raison d’attendre`)
    const own = ID.exec(r.status)?.[1]
    if (own) {
      specified.set(own, (specified.get(own) ?? 0) + 1)
      const spec = byId.get(own)
      if (!spec) errors.push(`${r.source} : spec « ${own} » absente du registre`)
      else if (!spec.source.includes(r.source.replace(/:\d+$/, '')))
        errors.push(`${r.source} : la spec « ${own} » cite un autre fichier (${spec.source})`)
      continue
    }
    for (const [, cited] of r.status.matchAll(CITED))
      if (!byId.has(cited)) errors.push(`${r.source} : renvoie à « ${cited} », absente du registre`)
  }
  for (const o of overlays) {
    const n = specified.get(o.id) ?? 0
    if (n !== 1) errors.push(`${o.id} : ${n} ligne(s) d’inventaire, il en faut exactement une`)
  }
  return errors
}

describe('inventaire des surcouches', () => {
  it('lit bien un inventaire : trois surfaces, des centaines de lignes, dont des spécifiées', () => {
    const rows = rowsOf(INVENTORY)
    expect(rows.length).toBeGreaterThan(200)
    expect(rows.filter(r => ID.test(r.status)).length).toBe(OVERLAYS.length)
    for (const surface of ['App', 'Site', 'DM']) expect(INVENTORY).toMatch(new RegExp(`^## ${surface} \\(`, 'm'))
  })

  it('chaque surcouche inventoriée a une spec, ou sa raison d’attendre ; chaque spec a sa ligne', () => {
    expect(checkInventory(INVENTORY, OVERLAYS)).toEqual([])
  })

  it('toutes les confirmations destructives du code (`window.confirm`, modales maison de suppression) sont spécifiées', () => {
    const waiting = rowsOf(INVENTORY).filter(r => r.family === '`window.confirm`' && !ID.test(r.status))
    expect(waiting.map(r => r.source)).toEqual([])
  })

  it('sait dire NON : spec inconnue, spec non inventoriée, ligne sans raison, renvoi mort, mauvais fichier', () => {
    const head = '| Famille | Source | Page parente | Contenu | Spec / statut |\n|---|---|---|---|---|\n'
    const [first] = OVERLAYS
    if (!first) throw new Error('registre vide')
    const file = first.source.replace(/:\d+$/, '')
    const ok = `| Dialog | \`${file}:1\` | x | y | \`${first.id}\` |\n`
    expect(checkInventory(head + ok, [first])).toEqual([])
    expect(checkInventory(head + ok.replace(first.id, 'app/overlays/nope'), [first]).join('\n')).toMatch(
      /absente du registre/,
    )
    expect(checkInventory(head, [first]).join('\n')).toMatch(/0 ligne\(s\) d’inventaire/)
    expect(checkInventory(head + ok + '| Dialog | `a.tsx:3` | x | y |  |\n', [first]).join('\n')).toMatch(
      /ni spec ni raison/,
    )
    expect(
      checkInventory(head + ok + '| Dialog | `a.tsx:3` | x | y | même rendu que `app/overlays/nope` |\n', [first]).join(
        '\n',
      ),
    ).toMatch(/renvoie à « app\/overlays\/nope »/)
    expect(checkInventory(head + ok.replace(file, 'autre/fichier.tsx'), [first]).join('\n')).toMatch(
      /cite un autre fichier/,
    )
  })
})
