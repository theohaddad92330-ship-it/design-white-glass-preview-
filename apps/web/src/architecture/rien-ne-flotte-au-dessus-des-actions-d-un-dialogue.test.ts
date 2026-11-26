/**
 * #4623 — rien ne flotte au-dessus des actions d'un dialogue (famille #3480, 3e surface).
 *
 * Mesuré en production : sur `/discover`, le dock flottant de Laura (`fixed … z-widget`, 80) passait AU-DESSUS de
 * « Appliquer et explorer » dans « Cadrer la recherche » (`z-overlay`, 60). Un correctif écran par écran avait déjà
 * échoué deux fois (#3480 : `/actions`, Plan de compte). La cause est de FAMILLE : un flottant en `z-widget` dépasse
 * toute modale, et seule la modale partagée peut le dire une fois pour toutes.
 *
 * LA RÈGLE, tenue en trois endroits que cette garde LIT :
 *  1. chaque primitive modale de `packages/ui` (Dialog, AlertDialog) déclare « un dialogue est ouvert »
 *     (`<ModalOpenRegistrar />`, enfant du Content) — un dialogue présent ET futur est couvert sans que son auteur y pense ;
 *  2. chaque flottant `fixed … z-widget` de l'app qui peut recouvrir un coin consomme ce signal, sauf ceux qui
 *     restent volontairement utilisables sur une modale (le widget de signalement, #2487 — nommé ici, pas deviné) ;
 *  3. les deux surfaces de page de #3480 réservent toujours la bande du dock (`CustomerPageContent`).
 *
 * Elle sait dire NON : les tests « contrôle négatif » appliquent la MÊME détection à une source dont on a retiré le
 * câblage, et exigent qu'elle l'attrape. Les tests « corpus » exigent qu'elle lise les trois surfaces connues.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const UI_SRC = join(WEB_SRC, '../../../packages/ui/src')

/** Les flottants qui restent utilisables PAR-DESSUS une modale, à dessein (raison à côté). */
const KEEPS_WORKING_OVER_MODALS: Record<string, string> = {
  'features/feedback/FeedbackWidget.tsx': '#2487 — signaler un problème depuis une modale est le but du widget',
  // Les deux pièces du dock de Laura rendues PAR `LauraDock` : la ligne d'amorce reçoit `hidden` du dock, le panneau
  // ouvert est un recouvrement TEMPORAIRE demandé par un geste (voir l'en-tête de `LauraDock`).
  'features/laura/bubble/LauraBubblePanel.tsx': 'panneau ouvert par un geste, rendu par LauraDock',
  'features/laura/bubble/LauraIntroBar.tsx': 'cachée par LauraDock via sa classe `hidden`',
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry) || entry.includes('.test.') || entry === 'routeTree.gen.ts') continue
    out.push(full)
  }
  return out
}

/** Une primitive modale déclare son ouverture : le hook est appelé (pas seulement importé). */
function registersModalOpen(source: string): boolean {
  return /<ModalOpenRegistrar\s*\/>/.test(source)
}

/** Un flottant du coin : `fixed` et `z-widget` sur la même ligne de classes. */
function floatsAboveModals(source: string): boolean {
  return source.split('\n').some(line => /\bfixed\b/.test(line) && /\bz-widget\b/.test(line))
}

/** Le flottant s'efface via le signal des modales (appelé, pas seulement importé). */
function yieldsToModals(source: string): boolean {
  return /\buseAnyModalOpen\(\)/.test(source)
}

describe('#4623 — rien ne flotte au-dessus des actions d’un dialogue', () => {
  it('Dialog et AlertDialog déclarent leur ouverture', () => {
    for (const file of ['components/dialog.tsx', 'components/alert-dialog.tsx']) {
      const source = readFileSync(join(UI_SRC, file), 'utf8')
      expect(registersModalOpen(source), `${file} doit rendre <ModalOpenRegistrar /> dans son Content`).toBe(true)
    }
  })

  it('tout flottant `z-widget` s’efface devant un dialogue, ou est nommé exception avec sa raison', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(WEB_SRC)) {
      const rel = file.slice(WEB_SRC.length + 1)
      const source = readFileSync(file, 'utf8')
      if (!floatsAboveModals(source)) continue
      if (rel in KEEPS_WORKING_OVER_MODALS) continue
      if (!yieldsToModals(source)) offenders.push(rel)
    }
    expect(offenders, 'ces flottants recouvrent les actions d’un dialogue ouvert').toEqual([])
  })

  it('corpus : la garde LIT le dock de Laura et le widget de signalement (sinon elle est verte sur du vide)', () => {
    const floaters = sourceFiles(WEB_SRC)
      .filter(file => floatsAboveModals(readFileSync(file, 'utf8')))
      .map(file => file.slice(WEB_SRC.length + 1))
    expect(floaters).toContain('features/laura/bubble/LauraDock.tsx')
    expect(floaters).toContain('features/feedback/FeedbackWidget.tsx')
    for (const rel of Object.keys(KEEPS_WORKING_OVER_MODALS)) {
      expect(floaters, `l’exception ${rel} doit exister encore`).toContain(rel)
    }
  })

  it('corpus : la surface de #4623 est bien un dialogue partagé portant « Appliquer et explorer »', () => {
    const rail = readFileSync(join(WEB_SRC, 'features/discover/view/FilterRail.tsx'), 'utf8')
    expect(rail).toMatch(/<DialogContent\b/)
    expect(rail).toMatch(/framing\.apply|Appliquer et explorer/)
  })

  it('corpus : les surfaces de #3480 (/actions, Plan de compte) gardent leur bande réservée sous le contenu', () => {
    const page = readFileSync(join(WEB_SRC, 'components/page/CustomerPageContent.tsx'), 'utf8')
    expect(page).toMatch(/#3480/)
    expect(page).toMatch(/md:pb-|md:min-h-fit/)
  })

  it('NON : un dialogue qui ne déclare pas son ouverture est attrapé', () => {
    const ok = readFileSync(join(UI_SRC, 'components/dialog.tsx'), 'utf8')
    const broken = ok.replace(/<ModalOpenRegistrar\s*\/>/g, '')
    expect(registersModalOpen(ok)).toBe(true)
    expect(registersModalOpen(broken)).toBe(false)
  })

  it('NON : un flottant `z-widget` sans le signal est attrapé', () => {
    const dock = readFileSync(join(WEB_SRC, 'features/laura/bubble/LauraDock.tsx'), 'utf8')
    const broken = dock.replace(/useAnyModalOpen\(\)/g, 'false')
    expect(floatsAboveModals(broken)).toBe(true)
    expect(yieldsToModals(dock)).toBe(true)
    expect(yieldsToModals(broken)).toBe(false)
  })
})
