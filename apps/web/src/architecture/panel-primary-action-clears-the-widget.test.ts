/**
 * GA-205 — aucune action primaire de panneau ne se retrouve sous le widget.
 *
 * Mesuré à l'œil sur `/consultants` le 30/08/2026 : le bouton « Appliquer » du
 * tiroir « Plus de filtres » (`TalentFilterDrawer`, ancré `side="right"`,
 * action primaire en bas à droite) était recouvert par le widget de retour
 * flottant — même coin bas-droite, `z-widget` (80, `tailwind.config.ts`)
 * au-dessus de `z-overlay` (60) où vit un tiroir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA SOLUTION RETENUE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * PAS de montée de z-index : le widget doit rester au-dessus du contenu
 * ordinaire, c'est sa raison d'être — le faire passer sous un tiroir casse ça
 * pour toute la page pendant que le tiroir est ouvert. PAS de correctif
 * panneau par panneau non plus : ça se ré-oublierait au prochain tiroir écrit
 * sans connaître ce défaut, exactement le mode d'échec que ce dépôt traque le
 * plus (« du code juste, personne ne pense à l'appeler »).
 *
 * Le choix : `Sheet` (packages/ui/src/components/sheet.tsx), la porte UNIQUE
 * par laquelle passent les 16+ tiroirs du dépôt, compte combien sont ouverts.
 * `FeedbackWidget` s'efface tant que ce compte est > 0 — comme il le fait
 * déjà pour SON PROPRE dialogue (`phase !== 'idle'`). Chaque tiroir présent
 * ET futur est protégé sans qu'aucun appelant n'ait à y penser.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────
 * Une garde qui ne sait dire NON à rien, et une garde verte parce que son
 * corpus est vide, sont indiscernables d'une garde absente. Les deux tests :
 *
 *  1. le mécanisme est bien CÂBLÉ — `FeedbackWidget` importe et UTILISE
 *     `useAnySheetOpen` pour composer sa classe `hidden`. Retirer cette ligne
 *     (le défaut qu'on protège) fait échouer ce test — vérifié à la main en
 *     écrivant cette garde : commenter l'usage dans `FeedbackWidget.tsx` la
 *     fait échouer, la restaurer la fait repasser au vert.
 *  2. le corpus qu'elle protège n'est PAS vide — elle retrouve, en lisant les
 *     vraies sources, les tiroirs dont l'action primaire est ancrée en bas à
 *     droite (`side="right"`, un bouton dans une rangée `justify-between` ou
 *     `justify-end` proche de la fermeture de `SheetContent`, donc dans un
 *     PIED plutôt qu'un EN-TÊTE — `AccountPdfPreviewSheet` et
 *     `NeedsAccountSheet`, par exemple, ont un `justify-between` mais dans
 *     leur EN-TÊTE, pas leur pied, et sont donc à bon droit hors corpus).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (entry.includes('.test.') || entry === 'routeTree.gen.ts') continue
    out.push(full)
  }
  return out
}

/**
 * Le bloc JSX du DERNIER `<SheetContent` d'un fichier jusqu'à sa fermeture —
 * l'endroit où chercher une action primaire ancrée bas-droite. `lastIndexOf`
 * plutôt que le premier : un fichier peut ouvrir le tiroir depuis un bouton
 * d'en-tête qui contient lui-même le mot `SheetContent` en commentaire ou en
 * import ; le tiroir RENDU est toujours le dernier.
 */
function sheetContentBlock(source: string): string | null {
  const start = source.lastIndexOf('<SheetContent')
  if (start === -1) return null
  const end = source.indexOf('</SheetContent>', start)
  if (end === -1) return null
  return source.slice(start, end)
}

/**
 * Un panneau dont l'action primaire est ancrée bas-droite : un `Sheet` docké
 * à droite (par défaut, ou `side="right"` explicite — jamais `left`/`top`/
 * `bottom`), dont le bloc contient un `<Button` dans une rangée qui aligne au
 * bord (`justify-between`/`justify-end`) située dans la moitié DE FIN du
 * bloc — un pied, pas une rangée d'en-tête. `AccountPdfPreviewSheet` et
 * `NeedsAccountSheet` ont ce `justify-*` mais dans leur EN-TÊTE (première
 * moitié) : ils n'entrent pas dans le corpus, et c'est voulu — leur action
 * n'est pas bas-droite, elle est haut-droite, à côté de la croix de
 * fermeture.
 */
function hasBottomRightPrimaryAction(block: string): boolean {
  if (/side=['"](left|top|bottom)['"]/.test(block)) return false
  const footerMatch =
    /(?:border-t[^"'`]*["'`][^>]*|["'`][^"'`]*border-t)[^>]*justify-(?:between|end)|justify-(?:between|end)[^>]*border-t/.test(
      block,
    )
  if (!footerMatch) return false
  // La rangée doit être dans la moitié DE FIN du bloc (un pied, pas un
  // en-tête) et suivie d'un `<Button` — l'action elle-même, pas seulement sa
  // rangée d'alignement.
  const justifyIndex = block.search(/justify-(?:between|end)/)
  if (justifyIndex === -1 || justifyIndex < block.length / 2) return false
  return /<Button\b/.test(block.slice(justifyIndex))
}

describe('GA-205 — aucune action primaire de panneau ne se retrouve sous le widget', () => {
  it('`FeedbackWidget` s’efface via `useAnySheetOpen` — retirer ce câblage doit faire échouer ce test', () => {
    const widget = readFileSync(join(WEB_SRC, 'features/feedback/FeedbackWidget.tsx'), 'utf8')

    // Le mécanisme existe (packages/ui, hors de cette arborescence — on
    // vérifie donc l'IMPORT plutôt que sa définition).
    expect(widget).toMatch(/import\s*\{[^}]*\buseAnySheetOpen\b[^}]*\}\s*from\s*['"]@bellum\/ui['"]/)

    // …et il est RÉELLEMENT branché sur la classe qui cache le déclencheur —
    // pas seulement importé sans être lu (le défaut n°1 de ce dépôt).
    const usesHook = /const\s+anySheetOpen\s*=\s*useAnySheetOpen\(\)/.test(widget)
    const wiresHiddenClass = /\(phase !== 'idle' \|\| anySheetOpen\) && 'hidden'/.test(widget)
    expect(usesHook, 'useAnySheetOpen() doit être appelé').toBe(true)
    expect(wiresHiddenClass, 'anySheetOpen doit composer la classe `hidden` du déclencheur').toBe(true)
  })

  it('la garde voit des panneaux dont l’action primaire est ancrée en bas à droite — sinon elle est verte sur du vide', () => {
    const files = sourceFiles(WEB_SRC)
    const corpus = files.filter(file => {
      const source = readFileSync(file, 'utf8')
      if (!source.includes('SheetContent')) return false
      const block = sheetContentBlock(source)
      return block !== null && hasBottomRightPrimaryAction(block)
    })

    // Les deux connus au 30/08/2026 : le tiroir qui a déclenché ce lot, et
    // son jumeau documenté « même doctrine » côté besoins.
    const relative = corpus.map(file => file.slice(WEB_SRC.length + 1))
    // #4500 (refonte V22) — le tiroir du vivier est devenu une modale centrée (`TalentFilterDialog`) : il sort du
    // corpus des panneaux ancrés ; son jumeau côté besoins y reste et fait LIRE la garde.
    expect(relative).toContain('features/projects/open-needs/view/NeedsFilterDrawer.tsx')
    expect(corpus.length).toBeGreaterThan(0)
  })

  it('un panneau avec une action haut-droite (à côté de la croix) n’entre pas dans ce corpus — sinon la garde confondrait les deux coins', () => {
    const files = sourceFiles(WEB_SRC)
    const relative = files.map(file => file.slice(WEB_SRC.length + 1))

    // `AccountPdfPreviewSheet` a un bouton « Télécharger » à CÔTÉ de la croix
    // de fermeture (rangée d'en-tête `justify-between`) : pas le même coin
    // que le widget, donc pas ce défaut.
    const offender = relative.find(rel => rel.endsWith('AccountPdfPreviewSheet.tsx'))
    expect(offender, 'ce fichier doit exister — sinon ce test ne prouve rien').toBeTruthy()
    const source = readFileSync(join(WEB_SRC, offender!), 'utf8')
    const block = sheetContentBlock(source)
    expect(block).not.toBeNull()
    expect(hasBottomRightPrimaryAction(block!)).toBe(false)
  })
})
