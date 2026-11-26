import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOOL_CATALOG } from './tool-catalog'

/**
 * #4686 / #4700 — le catalogue dit la vérité sur les écritures BoondManager.
 *
 * Il annonçait « lecture seule » (`writes: []`) alors que trois écritures
 * partent vraiment. La liste des scopes déclarés à la Marketplace BoondManager
 * se lit ici : un catalogue faux est une soumission fausse.
 *
 * La garde LIT ses deux sources — `RESOURCE_PATH` dans `ats-write.service.ts`
 * (gestes et chemins) et l'entrée `boondmanager` du catalogue. Aucune liste
 * recopiée : ajouter un geste d'écriture sans le déclarer fait échouer ce test.
 */

const WRITE_SERVICE = join(__dirname, '..', 'ats', 'ats-write.service.ts')

function readWritePaths(): Record<string, string> {
  const source = readFileSync(WRITE_SERVICE, 'utf8')
  const block = /const RESOURCE_PATH[^=]*=\s*\{([^}]*)\}/.exec(source)?.[1]
  if (!block) throw new Error('RESOURCE_PATH introuvable dans ats-write.service.ts — la garde ne lit plus rien')
  const paths: Record<string, string> = {}
  for (const match of block.matchAll(/(\w+)\s*:\s*'([^']+)'/g)) paths[match[1] as string] = match[2] as string
  return paths
}

describe('BoondManager — le catalogue déclare toutes les écritures livrées', () => {
  const paths = readWritePaths()
  const boond = TOOL_CATALOG.find(entry => entry.provider === 'boondmanager')

  it('lit au moins un geste d’écriture (la garde lit quelque chose)', () => {
    expect(Object.keys(paths).length).toBeGreaterThan(0)
  })

  it('a une entrée boondmanager', () => {
    expect(boond).toBeDefined()
  })

  it.each(Object.entries(paths))('geste %s (%s) : déclaré dans allowed_actions et writes', (kind, path) => {
    expect(boond?.allowed_actions).toContain(kind)
    expect(boond?.data_types?.writes).toContain(path.replace(/^\//, ''))
  })

  it('n’est plus « lecture seule » : writes non vide', () => {
    expect(boond?.data_types?.writes.length).toBeGreaterThan(0)
  })
})
