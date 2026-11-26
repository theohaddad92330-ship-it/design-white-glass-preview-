/**
 * GA-29 — un tableau masque AUTANT d'entêtes que de cellules.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EMPÊCHE
 * ─────────────────────────────────────────────────────────────────────────
 * Rendre un tableau utilisable au pouce se fait en masquant ses colonnes
 * secondaires sous 768 px — un seul chemin de rendu, pas de seconde liste qui
 * divergerait. Le piège est mécanique : masquer une ENTÊTE sans masquer sa
 * CELLULE (ou l'inverse) décale toute la ligne d'une colonne, et l'écran montre
 * alors des valeurs sous les mauvais libellés.
 *
 * Un décalage de colonne ne casse rien, ne lève rien, et se lit parfaitement
 * bien — c'est ce qui le rend dangereux : un score affiché sous « Date » est
 * une donnée fausse présentée avec aplomb.
 *
 * La garde compte les occurrences de masquage dans les entêtes et dans le
 * corps, et exige qu'elles soient égales.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
/**
 * Les classes qui masquent sous une borne — Tailwind en offre deux formes.
 *
 * ⚠️ SANS le drapeau `g`. Avec lui, `RegExp.test()` est À ÉTAT : il retient
 * `lastIndex` d'un appel à l'autre, si bien qu'un appel sur deux rend `false`
 * sur la même chaîne. La première version de cette garde ne voyait donc rien —
 * vérifiée en cassant volontairement une colonne, elle est restée verte.
 */
const HIDE = /(?:hidden[^"'`]*\bmd:table-cell|max-(?:sm|md):hidden)/

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full))
      continue
    }
    if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full)
  }
  return out
}

describe('GA-29 — entêtes et cellules masquées vont par paires', () => {
  const files = tsxFiles(SRC)

  it('aucun tableau ne décale ses colonnes sur écran étroit', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      // Un fichier qui ne porte que l'entête ou que le corps est légitime : la
      // paire se vérifie alors à l'échelle du DOSSIER, pas du fichier.
      const heads = [...source.matchAll(/<TableHead\b[^>]*/g)].filter(m => HIDE.test(m[0])).length
      const cells = [...source.matchAll(/<TableCell\b[^>]*/g)].filter(m => HIDE.test(m[0])).length
      const hasHeads = /<TableHead\b/.test(source)
      const hasCells = /<TableCell\b/.test(source)
      if (!hasHeads || !hasCells) continue
      if (heads !== cells) offenders.push(`${file.slice(file.indexOf('/src/'))}: ${heads} entêtes / ${cells} cellules`)
    }
    // Si ce test tombe : tu as masqué une entête sans sa cellule (ou l'inverse),
    // et l'écran affiche des valeurs sous les mauvais libellés.
    expect(offenders).toEqual([])
  })

  it('la garde voit bien des tableaux responsives — sinon elle est verte sur du vide', () => {
    const responsive = files.filter(file => HIDE.test(readFileSync(file, 'utf8')))
    expect(responsive.length).toBeGreaterThan(2)
  })
})

/**
 * GA-30 — la zone tactile ne se rétrécit plus.
 *
 * Mesurée écran par écran sur un téléphone : les cibles sous 32 px de haut
 * étaient une croix de fermeture à 24 px présente sur TOUS les écrans, les
 * onglets de filtre du centre d'actions à 30 px, et les entêtes de tri à 28 px.
 *
 * La règle des 44 px vient du DOIGT, pas de la largeur de fenêtre : une
 * tablette pointée à la souris n'en a pas besoin, un petit portable tactile si.
 * D'où la variante `pointer-coarse:` plutôt qu'un `md:` — elle pose la question
 * qui compte, « avec quoi cette personne pointe-t-elle ? ».
 *
 * Un cliquet et non un interdit : beaucoup de contrôles sont légitimement
 * petits — un lien de texte dans une phrase reste à la hauteur de sa ligne, et
 * l'agrandir casserait le paragraphe.
 */
const COARSE_TARGETS_AT_FREEZE = 4

describe('GA-30 — les cibles tactiles', () => {
  const files = tsxFiles(SRC)

  it('les contrôles agrandis au doigt ne disparaissent pas', () => {
    const count = files.reduce(
      (acc, file) => acc + (readFileSync(file, 'utf8').match(/pointer-coarse:min-[hw]-11/g)?.length ?? 0),
      0,
    )
    // Il ne descend pas : chacun de ces quatre corrige une cible mesurée
    // sous 32 px sur un téléphone.
    expect(count).toBeGreaterThanOrEqual(COARSE_TARGETS_AT_FREEZE)
  })
})

/**
 * GA-30 (bis) — le balayage ne s'arrête pas à apps/web/src.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE POINT AVEUGLE TROUVÉ LE 30/08
 * ─────────────────────────────────────────────────────────────────────────
 * La garde ci-dessus ne lit QUE `apps/web/src` (`SRC = join(__dirname, '..')`).
 * Le bouton PARTAGÉ vit dans `packages/ui/src/components/button.tsx`, hors de
 * ce périmètre : `size="sm"` y fait 32 px de haut (`h-8`), sans une seule
 * variante `pointer-coarse:` dans sa définition, et la garde ne pouvait pas
 * le voir — quel que soit le nombre d'endroits qui l'utilisent (697 mesurés
 * le 30/08, dont 45 déjà corrigés au cas par cas via un `className`
 * `pointer-coarse:min-h-11` sur l'appelant ; la garde ne validait même pas
 * CES corrections-là, puisqu'elle ne regardait jamais dans ce dossier).
 *
 * Cette garde-ci lit `packages/ui/src` et vérifie que les tailles
 * ICÔNE-SEULE du bouton partagé (`size="icon"`, carrées, sans texte à côté —
 * la même famille que la croix de fermeture à 24 px déjà corrigée ailleurs)
 * portent bien un plancher `pointer-coarse:min-h-11` / `min-w-11`.
 *
 * Les tailles à texte (`sm`, `xs`, `default`, `lg`) n'y sont volontairement
 * PAS soumises : au moins 7 endroits les utilisent en `variant="link"` avec
 * un `className="h-auto p-0"` pour rester à hauteur de ligne dans une phrase
 * — leur imposer un plancher de 44 px casserait exactement l'exception que
 * GA-30 nomme elle-même (« un lien de texte dans une phrase »). Ces
 * tailles-là restent un chantier au cas par cas, pas une règle de composant.
 */
const SHARED_UI_SRC = join(__dirname, '../../../../packages/ui/src')

describe("GA-30 (bis) — le composant partagé n'échappe pas au balayage", () => {
  it('le corpus voit bien packages/ui — sinon elle est verte sur du vide', () => {
    const files = tsxFiles(SHARED_UI_SRC)
    expect(files.length).toBeGreaterThan(0)
    expect(files.some(file => file.endsWith('components/button.tsx'))).toBe(true)
  })

  it('les tailles icône-seule du bouton partagé ont un plancher tactile', () => {
    const buttonFile = tsxFiles(SHARED_UI_SRC).find(file => file.endsWith('components/button.tsx'))
    if (!buttonFile) throw new Error('button.tsx introuvable — le composant partagé a-t-il bougé ?')

    const source = readFileSync(buttonFile, 'utf8')
    const iconSizeMatch = source.match(/icon:\s*'([^']*)'/)
    expect(iconSizeMatch, 'la variante size.icon du bouton partagé est introuvable').toBeTruthy()

    const iconClasses = iconSizeMatch![1]
    expect(iconClasses).toMatch(/pointer-coarse:min-h-11/)
    expect(iconClasses).toMatch(/pointer-coarse:min-w-11/)
  })
})
