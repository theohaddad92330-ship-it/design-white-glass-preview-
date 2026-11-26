import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDE_ANCHOR_CATALOGUE } from '@/features/guide/guide-anchors'

/**
 * GA-370 — UN ANCRAGE AU CATALOGUE EST POSÉ QUELQUE PART, ET CE QU'ON POSE EST
 * AU CATALOGUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le motif qui revient dans les ~30 chantiers déjà livrés du dépôt :
 * **du code juste, calculé, testé, que personne n'appelle.** Un catalogue
 * d'ancrages est le terrain rêvé pour ça — une entrée s'ajoute en une ligne, et
 * rien ne dit jamais que l'élément qu'elle désigne n'existe plus.
 *
 * Les deux sens comptent, et pour des raisons différentes :
 *
 *  · **catalogué mais jamais posé** — un pas de guide qui vise cet ancrage
 *    échouera toujours, en silence, avec la raison `timeout`. C'est le pire cas :
 *    il ressemble à une lenteur alors que c'est un trou ;
 *  · **posé mais jamais catalogué** — le moteur le traitera comme
 *    `anchor-undeclared` et refusera de le chercher. L'attribut est alors une
 *    décoration : quelqu'un a cru rendre un élément désignable, il ne l'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE VISE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les tests et le module du guide lui-même : y chercher des ancrages ferait
 * passer pour « posé » un ancrage qui n'apparaît que dans une fixture. Une garde
 * qui attrape ce qu'elle ne vise pas accuse le bien.
 *
 * ⚠️ Et le catalogue ne doit jamais être vide : une boucle sur zéro entrée est
 * verte sans rien lire — une garde aveugle n'est pas une exemption.
 */

const WEB_SRC = join(__dirname, '..')
/** Le module du guide lui-même : il DÉFINIT les ancrages, il ne les pose pas. */
const GUIDE_MODULE = join(WEB_SRC, 'features/guide')

function productionFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry)) continue
      if (/\.test\.tsx?$/.test(entry)) continue
      if (full.startsWith(GUIDE_MODULE)) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

const PLACED = (() => {
  const map = new Map<string, string[]>()
  for (const file of productionFiles(WEB_SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/guideAnchorProps\(\s*'([^']+)'\s*\)/g)) {
      const anchor = match[1]!
      map.set(anchor, [...(map.get(anchor) ?? []), file])
    }
  }
  return map
})()

describe('GA-370 — le catalogue d’ancrages et le code disent la même chose', () => {
  it('a quelque chose à lire — un catalogue vide rendrait cette garde aveugle', () => {
    expect(GUIDE_ANCHOR_CATALOGUE.length).toBeGreaterThan(0)
  })

  it('lit vraiment le code : au moins un ancrage est posé dans le produit', () => {
    expect(PLACED.size).toBeGreaterThan(0)
  })

  it('n’a aucun ancrage catalogué que personne ne pose', () => {
    const orphans = GUIDE_ANCHOR_CATALOGUE.filter(anchor => !PLACED.has(anchor))
    expect(orphans).toEqual([])
  })

  it('n’a aucun ancrage posé qui ne soit au catalogue', () => {
    const undeclared = [...PLACED.entries()]
      .filter(([anchor]) => !(GUIDE_ANCHOR_CATALOGUE as readonly string[]).includes(anchor))
      .map(([anchor, files]) => `${anchor} (${files.join(', ')})`)
    expect(undeclared).toEqual([])
  })
})
