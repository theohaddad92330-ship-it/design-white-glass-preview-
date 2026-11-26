import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1440 — UN SEUL DICTIONNAIRE D'INDICATEURS SUR /pilotage.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SE VOYAIT
 * ─────────────────────────────────────────────────────────────────────────
 * L'écran montait DEUX dictionnaires, l'un sous l'autre :
 *
 *  · `KpiCataloguePanel` — « Dictionnaire des indicateurs », 62 entrées,
 *    servi par `GET /pilotage/kpi-catalogue` ;
 *  · `KpiDictionaryBlock` dans le panneau des playbooks — « D'où viennent les
 *    chiffres », 5 entrées, servi par `GET /playbooks/kpi-dictionary`.
 *
 * Deux endpoints, deux contenus, une seule question. C'est la loi 4 du
 * tome 7 : rien n'apparaît deux fois sous la même forme avec le même
 * contenu — et quand les deux divergent, on ne croit plus ni l'un ni l'autre.
 *
 * ⚠️ Mise à jour du 14/10/2026 (refonte Pilotage, L1) : le catalogue est parti à son
 * tour — voir le premier test. La garde reste pour le dossier des playbooks.
 *
 * Le catalogue restait, parce qu'il était le plus complet. Ce que le second
 * portait en propre — les exclusions et le dénominateur — a été RAPATRIÉ
 * dans le catalogue avant que le doublon ne parte (voir
 * `KpiCataloguePanel.test.tsx` § #1440) : rien n'a été perdu.
 *
 * Ce que cette garde prouve :
 *  - elle LIT un corpus non vide (les deux fichiers existent et le catalogue
 *    est bien monté — le premier test tombe sinon) ;
 *  - elle sait dire NON (remettre `<KpiDictionaryBlock />` dans n'importe quel
 *    fichier de `features/playbooks/view/` la fait rougir).
 *
 * ⚠️ Elle vise le DOSSIER et non un fichier nommé. `PlaybooksPanel.tsx` a été
 * scindé en trois le 04/09 (#1438 : le réglage part dans Réglages › Routines),
 * et une garde ancrée sur un nom de fichier aurait explosé au lieu de garder —
 * ou, pire, se serait tue si quelqu'un l'avait « réparée » en pointant le
 * fichier survivant. Un corpus qui suit le dossier survit au découpage suivant.
 */

const WEB_SRC = join(__dirname, '..')

function read(relative: string): string {
  return readFileSync(join(WEB_SRC, relative), 'utf8')
}

const PILOTAGE_PAGE = 'features/pilotage/view/PilotagePage.tsx'
const PLAYBOOKS_VIEW_DIR = 'features/playbooks/view'

/** Tout ce que le dossier des playbooks rend — jamais un seul fichier nommé. */
function playbooksViewSources(): { name: string; source: string }[] {
  return readdirSync(join(WEB_SRC, PLAYBOOKS_VIEW_DIR))
    .filter(name => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
    .map(name => ({ name, source: read(join(PLAYBOOKS_VIEW_DIR, name)) }))
}

describe('#1440 — /pilotage ne monte qu’UN dictionnaire d’indicateurs', () => {
  it('lit un corpus non vide : la page existe et monte bien le catalogue', () => {
    const page = read(PILOTAGE_PAGE)
    expect(page.length).toBeGreaterThan(500)
    // Louis 14/10/2026 (refonte Pilotage, L1) : le catalogue de soixante-deux entrées a
    // quitté la page — la formule d'un indicateur vit désormais dans l'infobulle du
    // compteur qu'elle explique. La page ne monte donc plus AUCUN dictionnaire.
    expect(page).not.toContain('KpiCataloguePanel')
    const sources = playbooksViewSources()
    expect(sources.length).toBeGreaterThan(0)
    expect(sources.every(file => file.source.length > 300)).toBe(true)
  })

  it('aucun fichier du dossier des playbooks ne monte de second dictionnaire', () => {
    // Le fichier ET le symbole fautifs sont DANS la valeur comparée : sans eux,
    // l'échec dirait « true n'est pas false » et il faudrait le déboguer.
    const mounted = playbooksViewSources().flatMap(file =>
      ['KpiDictionaryBlock', 'useKpiDictionary']
        .filter(symbol => file.source.includes(symbol))
        .map(symbol => `${file.name}:${symbol}`),
    )
    expect(mounted).toEqual([])
  })

  it('le catalogue n’existe plus : aucun composant du web ne monte un dictionnaire d’indicateurs', () => {
    expect(existsSync(join(WEB_SRC, 'features/pilotage/view/KpiCataloguePanel.tsx'))).toBe(false)
    expect(read(PILOTAGE_PAGE)).not.toContain('KPI_DICTIONARY')
  })
})
