import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDE_REFUSED_ANCHOR_NAMESPACES, guideAnchorIdSchema } from '@bellum/contracts'
import { GUIDE_ANCHOR_CATALOGUE } from '@/features/guide/guide-anchors'

/**
 * GA-369 — UN GUIDE NE MET JAMAIS EN LUMIÈRE LE RAIL DE NAVIGATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, À LA SOURCE — ET ELLE N'EST PAS DE MOI
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/web/src/features/product-tour/ProductTourDialog.tsx:9-19` (#1787,
 * toujours valable au 21/09/2026) :
 *
 *   > « Pas un spotlight qui survole le rail de navigation en direct : le rail
 *   > N'EXISTE PAS sur mobile (quatre onglets, coque à part), et un spotlight
 *   > qui localise des nœuds réels du DOM est fragile au moindre remaniement de
 *   > la barre latérale — les bibliothèques de tour du marché posent exactement
 *   > cette surcouche, volent le focus et cassent la tabulation. »
 *
 * ⚠️ Cette garde PROTÈGE cette décision, elle ne l'invente pas, et elle ne
 * l'élargit pas non plus. #1787 écarte un SUJET précis — le rail, la barre
 * latérale — pour trois raisons. Il n'écarte pas « tout spotlight » : c'est
 * pourquoi cette garde laisse passer `retour.bouton-declencheur` et n'a rien à
 * dire d'une cible en pleine page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET CE QU'ELLE NE PEUT PAS ATTRAPER
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit trois choses RÉELLES : le texte de #1787 dans le fichier qui le
 * porte (si la décision est retirée, la garde le dit au lieu de garder un
 * interdit orphelin) ; le catalogue d'ancrages ; et tous les ancrages posés dans
 * `apps/web/src`.
 *
 * Elle n'attrape PAS un composant du rail qui poserait un ancrage sous un autre
 * nom — aucune garde de texte ne le peut. Ce qu'elle garantit est plus modeste
 * et vérifiable : l'espace de noms du rail est refusé partout, à un seul
 * endroit, et cet endroit est nommé ici.
 */

const WEB_SRC = join(__dirname, '..')
const PRODUCT_TOUR_DIALOG = join(WEB_SRC, 'features/product-tour/ProductTourDialog.tsx')

function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
    }
  }
  walk(root)
  return out
}

/** Les ancrages réellement POSÉS dans le produit : `guideAnchorProps('…')`. */
function placedAnchors(): { anchor: string; file: string }[] {
  const found: { anchor: string; file: string }[] = []
  for (const file of sourceFiles(WEB_SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/guideAnchorProps\(\s*'([^']+)'\s*\)/g)) {
      found.push({ anchor: match[1]!, file })
    }
  }
  return found
}

describe('GA-369 — le guide ne cible jamais le rail de navigation (#1787)', () => {
  /**
   * ⚠️ LA GARDE DOIT PROUVER QU'ELLE LIT QUELQUE CHOSE. Si #1787 disparaît de
   * `ProductTourDialog`, cette garde défend un interdit que plus personne ne
   * porte — et c'est une décision à reprendre, pas un test à laisser vert.
   */
  it('lit la décision #1787 là où elle est écrite', () => {
    const source = readFileSync(PRODUCT_TOUR_DIALOG, 'utf8')
    expect(source).toContain('#1787')
    expect(source).toMatch(/rail de navigation/i)
  })

  it('refuse l’espace de noms du rail à UN seul endroit, et il est nommé', () => {
    expect(GUIDE_REFUSED_ANCHOR_NAMESPACES).toContain('rail-de-navigation')
    expect(GUIDE_REFUSED_ANCHOR_NAMESPACES).toContain('barre-laterale')
  })

  it('dit NON à un ancrage du rail, quelle que soit sa forme', () => {
    for (const namespace of GUIDE_REFUSED_ANCHOR_NAMESPACES) {
      expect(guideAnchorIdSchema.safeParse(namespace).success).toBe(false)
      expect(guideAnchorIdSchema.safeParse(`${namespace}.comptes`).success).toBe(false)
      expect(guideAnchorIdSchema.safeParse(`${namespace}.bouton.profond`).success).toBe(false)
    }
  })

  it('laisse passer une cible en pleine page — #1787 n’écarte pas tout spotlight', () => {
    expect(guideAnchorIdSchema.safeParse('retour.bouton-declencheur').success).toBe(true)
    expect(guideAnchorIdSchema.safeParse('decouvrir.champ-de-recherche').success).toBe(true)
  })

  it('n’a aucun ancrage du rail au catalogue', () => {
    for (const anchor of GUIDE_ANCHOR_CATALOGUE) {
      for (const namespace of GUIDE_REFUSED_ANCHOR_NAMESPACES) {
        expect(anchor.startsWith(namespace)).toBe(false)
      }
    }
  })

  it('n’a aucun ancrage du rail POSÉ dans le produit', () => {
    const offenders = placedAnchors().filter(({ anchor }) =>
      GUIDE_REFUSED_ANCHOR_NAMESPACES.some(namespace => anchor.startsWith(namespace)),
    )
    expect(offenders.map(({ anchor, file }) => `${anchor} (${file})`)).toEqual([])
  })
})
