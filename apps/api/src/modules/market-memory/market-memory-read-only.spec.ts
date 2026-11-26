import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #3671.3 — admission contrôlée : le web et les synthèses de Laura ne se
 * déversent JAMAIS dans Market Memory. Le corpus `market_*` est en lecture
 * seule pour tout le produit ; il n'y entre que par l'import du pack
 * (`IMPORTABLE_FILES`, liste exhaustive) et la seule écriture du service est la
 * décision de rapprochement D'UN espace (`resolutionOverrides.upsert`), qui ne
 * devient jamais la vérité d'un autre — les espaces sont des concurrents.
 */
const WRITE_CALL =
  /\b(?:signals|esnClients|stacks|[a-zA-Z]*Repo|[a-zA-Z]*Repository)\.(?:save|insert|update|delete|remove|upsert)\(/g
const SQL_WRITE = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+market_/gi

function source(file: string): string {
  return readFileSync(join(__dirname, file), 'utf8')
}

describe('#3671.3 — Market Memory reste en lecture seule', () => {
  it('le service n’écrit dans AUCUNE table market_*', () => {
    const text = source('market-memory.service.ts')
    expect(text.length).toBeGreaterThan(0)
    expect(text.match(WRITE_CALL) ?? []).toEqual([])
    expect(text.match(SQL_WRITE) ?? []).toEqual([])
  })

  it('sa seule écriture est la décision de rapprochement propre à un espace', () => {
    const text = source('market-memory.service.ts')
    expect(text.match(/resolutionOverrides\.upsert\(/g)).toHaveLength(1)
    expect(text).toMatch(/workspaceId: input\.workspaceId/)
  })

  it('la garde sait dire NON : elle repère une écriture déversée dans le corpus', () => {
    expect('await this.signals.save(row)'.match(WRITE_CALL)).toHaveLength(1)
    expect('INSERT INTO market_company_signals (x)'.match(SQL_WRITE)).toHaveLength(1)
  })

  it('l’import n’admet que la liste exhaustive de fichiers, jamais une source web', () => {
    const text = source('market-memory-import.ts')
    expect(text).toMatch(/export const IMPORTABLE_FILES/)
    expect(text).not.toMatch(/fetch\(|axios|firecrawl|brave/i)
  })
})
