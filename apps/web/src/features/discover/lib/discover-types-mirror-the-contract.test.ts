import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverRegistryRequestSchema } from '@bellum/contracts'

/**
 * `DiscoverRegistryFilters` est un MIROIR écrit à la main du contrat partagé.
 *
 * Il avait divergé sans bruit : `region`, `departments`, `revenueMin/Max`,
 * `companyCategory` et `legalCategory` existaient au contrat, à l'API et au
 * service IA — et pas ici. L'écran ne pouvait donc pas les envoyer, et aucun
 * type ne s'en plaignait : un miroir INCOMPLET reste un type parfaitement
 * valide.
 *
 * ⚠️ Cette garde LIT LE FICHIER SOURCE, et c'est tout l'enjeu. Sa première
 * version comparait le contrat à un objet littéral recopié à la main dans le
 * test : retirer `region` de l'interface la laissait VERTE, parce que le
 * littéral, lui, portait toujours la clé. Elle surveillait sa propre copie.
 * Même famille que les gardes borgnes du dépôt — une garde doit lire ce qu'elle
 * prétend garder, et savoir dire NON (vérifié en retirant `region` : rouge).
 */
// `__dirname`, comme les autres gardes du dépôt : `import.meta.url` n'est pas
// un chemin de fichier sous jsdom, et `fileURLToPath` y échoue AU CHARGEMENT —
// vitest rend alors « 29 passed » sans jamais exécuter ce fichier.
const SOURCE = readFileSync(join(__dirname, 'discover-types.ts'), 'utf8')

/** Les clés déclarées par l'interface, lues dans le TEXTE — commentaires
 *  retirés d'abord : un champ cité dans une phrase n'est pas un champ. */
function mirrorKeys(): string[] {
  const start = SOURCE.indexOf('export interface DiscoverRegistryFilters {')
  if (start < 0) throw new Error('interface DiscoverRegistryFilters introuvable')
  const body = SOURCE.slice(start + SOURCE.slice(start).indexOf('{') + 1)
  const end = body.indexOf('\n}')
  if (end < 0) throw new Error('fin de l’interface introuvable')
  const withoutComments = body
    .slice(0, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  return [...withoutComments.matchAll(/^\s*([A-Za-z_$][\w$]*)\??\s*:/gm)].map(match => match[1] as string).sort()
}

describe('le miroir des filtres de registre suit le contrat', () => {
  const contractKeys = Object.keys(discoverRegistryRequestSchema.shape.filters.unwrap().shape).sort()

  it('lit un corpus non vide des DEUX côtés — une garde qui ne lit rien ne garde rien', () => {
    expect(contractKeys.length).toBeGreaterThanOrEqual(10)
    expect(mirrorKeys().length).toBeGreaterThanOrEqual(10)
  })

  it('porte EXACTEMENT les critères déclarés au contrat, ni plus ni moins', () => {
    // Ni plus : un champ que l'écran croit pouvoir envoyer et que l'API rejette
    // est aussi coûteux qu'un champ manquant — il échoue au moment le plus tardif.
    expect(mirrorKeys()).toEqual(contractKeys)
  })
})
