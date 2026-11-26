/**
 * GA-392 (numéro à vérifier à l'intégration, comme GA-391 avant elle) — DANS
 * LES 3 VUES REJOINTES LE 25/09/2026, LA LIGNE MÉMOIRE MARCHÉ NE SE POSE QUE
 * SUR UNE ENTITÉ RACINE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-391 (`org-gap-never-carries-market-memory.test.ts`) tient déjà la même
 * discipline pour `OrgInfluenceMap.tsx` (racine = `view.roots`, jamais une
 * colonne). #2837 a étendu la même ligne, la même raison (`market_company_signal`
 * est un agrégat PAR ENTREPRISE, sans ventilation par entité — GA-391) aux 3
 * autres vues de l'organigramme :
 *
 *   · `GroupOrgView.tsx` — `marketMemory` ne se pose que sur `node.depth === 0` ;
 *   · `HierarchyOrgView.tsx` / `FocalOrgView.tsx` — la "direction" affichée peut
 *     être une entité fille, donc `marketMemoryLine` n'est calculée que quand
 *     `isRootDirection` (`orgRootEntityIds(graph).has(view.direction.id)`) est
 *     vraie.
 *
 * Cette garde empêche qu'un futur contributeur de bonne foi retire cette
 * condition — par exemple en « simplifiant » le ternaire — sans que la CI le
 * voie, exactement le risque que GA-391 nommait déjà pour la carte système.
 *
 * ⚠️ Elle retire les commentaires avant de lire.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ORG_DIR = join(__dirname, '..', 'features', 'accounts', 'view', 'account-detail', 'tabs', 'organigramme')
const GROUP_FILE = join(ORG_DIR, 'GroupOrgView.tsx')
const HIERARCHY_FILE = join(ORG_DIR, 'HierarchyOrgView.tsx')
const FOCAL_FILE = join(ORG_DIR, 'FocalOrgView.tsx')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function read(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

describe('GA-392 — la garde LIT vraiment quelque chose', () => {
  it('les trois fichiers surveillés existent et ne sont pas vides', () => {
    for (const file of [GROUP_FILE, HIERARCHY_FILE, FOCAL_FILE]) {
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(1000)
    }
  })
})

describe('GA-392 — GroupOrgView ne pose `marketMemory` que sur `depth === 0`', () => {
  it('l’appel à `<EntityRow` qui porte `marketMemory=` est conditionné par `node.depth === 0`', () => {
    const source = read(GROUP_FILE)
    expect(source).toMatch(/marketMemory=\{node\.depth === 0 \? marketMemoryLine : null\}/)
  })
})

describe('GA-392 — HierarchyOrgView et FocalOrgView ne calculent la ligne que sur une direction racine', () => {
  it.each([
    ['HierarchyOrgView.tsx', HIERARCHY_FILE],
    ['FocalOrgView.tsx', FOCAL_FILE],
  ])('%s calcule `isRootDirection` depuis `orgRootEntityIds`, et le ternaire le garde', (_name, file) => {
    const source = read(file)
    expect(source).toMatch(/orgRootEntityIds\(graph\)\.has\(view\.direction\.id\)/)
    expect(source).toMatch(/const marketMemoryLine = isRootDirection\s*\n?\s*\? orgMarketMemoryLine/)
  })
})
