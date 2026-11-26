/**
 * GA-391 (numéro à vérifier à l'intégration, comme GA-49/GA-50 avant elle) —
 * UNE ZONE BLANCHE NE PORTE JAMAIS DE MÉMOIRE MARCHÉ, ET LE GESTE RESTE « LANCER
 * UNE RECHERCHE CIBLÉE ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Épopée #2837 : `market_company_signal` est un agrégat PAR ENTREPRISE
 * (`market-company-signal.entity.ts`, résolu par `company_key` à la lecture,
 * SANS `account_id`) — `roleFamilies` y est une liste PLATE, sans axe de
 * niveau hiérarchique. Rien dans ce signal ne permet de désigner UNE zone
 * blanche précise (un métier × un niveau, sous UNE entité fille) plutôt qu'une
 * autre : le poser sur un `OrgMapGapNode` afficherait une précision que la
 * donnée n'a pas — exactement ce que la doctrine refuse (« on n'affiche pas ce
 * qu'on n'a pas »).
 *
 * #2837 le pose donc SEULEMENT sur la racine (`OrgInfluenceMap.tsx`,
 * `EntityCard` reçoit `marketMemory` au rendu de `view.roots`, jamais au rendu
 * d'une colonne). Point (4) de l'épopée demande explicitement une garde qui
 * empêche tout nœud PRÉ-REMPLI : le bouton « lancer une recherche ciblée »
 * (`GapCard`, clé i18n `orgMap.searchGap`) doit rester conditionné SEULEMENT
 * par `onSearch` et par `gap.family`/`gap.level` — jamais par un signal de
 * mémoire marché, qui transformerait une case à chercher en case qui a l'air
 * déjà réglée.
 *
 * Cette garde ne vérifie pas le rendu (`OrgInfluenceMap.test.tsx` le fait) —
 * elle empêche un futur contributeur de bonne foi de brancher, un jour, le
 * signal de mémoire marché sur la zone blanche plutôt que sur la racine, sans
 * que la CI le voie.
 *
 * ⚠️ Elle retire les commentaires avant de lire — sinon CE docblock, qui cite
 * les identifiants qu'elle surveille, la ferait échouer elle-même.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const ORG_DIR = join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'organigramme')
const MAP_FILE = join(ORG_DIR, 'OrgInfluenceMap.tsx')
const MODEL_FILE = join(ORG_DIR, 'orgInfluenceMapData.ts')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function identifiers(source: string): string[] {
  return [...source.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map(m => m[0])
}

/** Un identifiant qui SENT la mémoire marché — extensible : un futur champ de
 *  mémoire marché (autre que ceux d'aujourd'hui) s'ajoute ICI et nulle part
 *  ailleurs. Détecté par sous-chaîne `market` dans le token, en minuscules —
 *  large exprès, cette garde préfère un faux positif à un signal manqué. */
function marketMemoryTokens(source: string): string[] {
  return identifiers(stripComments(source)).filter(id => /market/i.test(id))
}

/** Extrait un bloc de la forme `<needle ... >` jusqu'à son `>` de fermeture —
 *  assez pour isoler un type `export type X = { ... }` ou une fonction. */
function blockAfter(source: string, needle: string): string {
  const start = source.indexOf(needle)
  if (start === -1) throw new Error(`bloc introuvable : ${needle}`)
  let depth = 0
  let i = start
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`bloc non refermé : ${needle}`)
}

describe('GA-391 — la garde LIT vraiment quelque chose', () => {
  it('les deux fichiers surveillés existent et ne sont pas vides', () => {
    expect(readFileSync(MAP_FILE, 'utf8').length).toBeGreaterThan(1000)
    expect(readFileSync(MODEL_FILE, 'utf8').length).toBeGreaterThan(1000)
  })

  it('sait dire NON — un identifiant sans "market" ne déclenche rien, un identifiant qui le contient si', () => {
    expect(marketMemoryTokens('const x = gap.family')).toEqual([])
    expect(marketMemoryTokens('const x = marketMemoryLine')).toEqual(['marketMemoryLine'])
    expect(marketMemoryTokens('/* marketMemoryLine en commentaire */')).toEqual([])
  })
})

describe('GA-391 — OrgMapGapNode ne gagne aucun champ de mémoire marché', () => {
  it('le type de la zone blanche ne porte aucun identifiant "market*"', () => {
    const source = readFileSync(MODEL_FILE, 'utf8')
    const gapType = blockAfter(stripComments(source), 'export type OrgMapGapNode = {')
    expect(marketMemoryTokens(gapType)).toEqual([])
  })
})

describe('GA-391 — le bouton « lancer une recherche ciblée » reste conditionné par le seul scope de la zone', () => {
  it('GapCard ne lit aucun identifiant de mémoire marché', () => {
    const source = readFileSync(MAP_FILE, 'utf8')
    const gapCard = blockAfter(stripComments(source), 'function GapCard({')
    expect(marketMemoryTokens(gapCard)).toEqual([])
  })

  it('le geste reste gouverné par `onSearch && (gap.family || gap.level)`', () => {
    const source = stripComments(readFileSync(MAP_FILE, 'utf8'))
    expect(source).toMatch(/onSearch\s*&&\s*\(gap\.family\s*\|\|\s*gap\.level\)/)
  })
})

describe('GA-391 — `marketMemory` ne se pose QUE sur la racine', () => {
  it('un seul appel de `<EntityCard` porte `marketMemory=`, et c’est celui de `view.roots`', () => {
    const source = stripComments(readFileSync(MAP_FILE, 'utf8'))
    const calls = [...source.matchAll(/<EntityCard\b[\s\S]*?\/>/g)].map(m => m[0])
    expect(calls.length).toBeGreaterThanOrEqual(2) // la racine ET la colonne, au moins.
    const withMarketMemory = calls.filter(call => /marketMemory=/.test(call))
    expect(withMarketMemory).toHaveLength(1)
    expect(withMarketMemory[0]).toMatch(/entity=\{root\}/)
  })

  it('l’appel de colonne (`entity={column.entity}`) ne porte jamais `marketMemory`', () => {
    const source = stripComments(readFileSync(MAP_FILE, 'utf8'))
    const columnCall = [...source.matchAll(/<EntityCard\b[\s\S]*?\/>/g)]
      .map(m => m[0])
      .find(call => /entity=\{column\.entity\}/.test(call))
    expect(columnCall, 'appel de colonne introuvable — la garde ne vise plus rien').toBeDefined()
    expect(columnCall).not.toMatch(/marketMemory=/)
  })
})
