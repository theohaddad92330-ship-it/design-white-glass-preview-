import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ENTITIES_TABLE_COLUMNS,
  ENTITIES_TABLE_SHELL,
} from '@/features/accounts/view/account-detail/components/entities/entitiesTableColumns'
import {
  SITES_TABLE_COLUMNS,
  SITES_TABLE_SHELL,
} from '@/features/accounts/view/account-detail/components/sites/sitesTableColumns'

/**
 * #4612.2 — LES DEUX TABLEAUX DE L'ONGLET SITES TIENNENT DANS LEUR CONTENEUR, ENTITÉS ET SITES.
 *
 * ⚠️ jsdom ne mesure aucune largeur : cette garde ne prouve pas `scrollWidth == clientWidth`, elle prouve que les BORNES
 * qui le font tenir sont DÉCLARÉES, pour les DEUX tableaux. #4327.2 n'avait gardé que celui des entités, mesuré à
 * 1 512 px seulement ; son jumeau `SitesTable` était un `<Table>` NU (disposition automatique : la ville ou la région la
 * plus longue, en `truncate` = nowrap, commande la largeur). La preuve d'écran reste à prendre, à 1 280 px, sur JC DECAUX
 * et APAVE : `scrollWidth` égale `clientWidth` du conteneur pour les deux tableaux.
 *
 * PREUVE DESTRUCTIVE (rejouée à l'écriture) : retiré `table-fixed` de `SITES_TABLE_SHELL`, ou remis un `<Table>` nu dans
 * `SitesTable.tsx` → ROUGE en nommant le tableau.
 */
const COMPONENTS = join(__dirname, '../features/accounts/view/account-detail/components')
const ENTITIES_CARD = join(COMPONENTS, 'EntitiesGraphCard.tsx')
const SITES_TABLE = join(COMPONENTS, 'sites/SitesTable.tsx')

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Les ouvertures de `<Table …>` d'un source (jamais `<TableRow`, `<TableBody`…), commentaires retirés. */
function tableOpenings(source: string): string[] {
  return [...withoutComments(source).matchAll(/<Table\b(?![A-Za-z])[^>]*>/g)].map(match => match[0])
}

/** Vrai quand AUCUN `<Table>` du source n'est nu : chacun cite l'une des enveloppes `table-fixed` (par son NOM de constante). */
function everyTableIsFixed(source: string, shells: readonly string[]): boolean {
  const openings = tableOpenings(source)
  return openings.length > 0 && openings.every(opening => shells.some(shell => opening.includes(shell)))
}

const sum = (columns: readonly { share: number }[]) => columns.reduce((total, column) => total + column.share, 0)

describe('#4612.2 — les deux tableaux de l’onglet Sites tiennent dans leur conteneur', () => {
  it('lit un corpus réel : les deux tableaux, cinq et quatre colonnes', () => {
    expect(tableOpenings(readFileSync(ENTITIES_CARD, 'utf8'))).toHaveLength(1)
    expect(tableOpenings(readFileSync(SITES_TABLE, 'utf8'))).toHaveLength(1)
    expect(ENTITIES_TABLE_COLUMNS).toHaveLength(5)
    expect(SITES_TABLE_COLUMNS).toHaveLength(4)
  })

  it('chaque enveloppe fige les colonnes (table-fixed) sans plancher en rem ni en pixels', () => {
    for (const shell of [ENTITIES_TABLE_SHELL, SITES_TABLE_SHELL]) {
      expect(shell).toMatch(/\btable-fixed\b/)
      expect(shell).not.toMatch(/(?<![\w-])min-w-\[/)
    }
  })

  it('les parts de chaque tableau font exactement 100 %', () => {
    expect(sum(ENTITIES_TABLE_COLUMNS)).toBe(100)
    expect(sum(SITES_TABLE_COLUMNS)).toBe(100)
  })

  it('aucun des deux n’est un <Table> nu — le jumeau SitesTable est gardé', () => {
    expect(everyTableIsFixed(readFileSync(ENTITIES_CARD, 'utf8'), ['ENTITIES_TABLE_SHELL'])).toBe(true)
    expect(everyTableIsFixed(readFileSync(SITES_TABLE, 'utf8'), ['SITES_TABLE_SHELL'])).toBe(true)
  })

  it('sait dire NON : un <Table> nu, ou une enveloppe sans table-fixed, est refusé', () => {
    expect(everyTableIsFixed('<Table>\n<TableRow>', [SITES_TABLE_SHELL])).toBe(false)
    expect(everyTableIsFixed('<Table className="w-full">', [SITES_TABLE_SHELL])).toBe(false)
    expect(everyTableIsFixed('<Table className={SITES_TABLE_SHELL}>', ['SITES_TABLE_SHELL'])).toBe(true)
    expect(everyTableIsFixed('<TableRow>', [SITES_TABLE_SHELL])).toBe(false)
  })

  it('l’en-tête et les cellules des sites lisent le registre — aucune largeur écrite en dur', () => {
    const source = withoutComments(readFileSync(SITES_TABLE, 'utf8'))
    expect(source).toMatch(/sitesColumnClass\(/)
    const tags = [...source.matchAll(/<Table(?:Head|Cell)\b[^>]*/g)].map(match => match[0])
    expect(tags.length).toBeGreaterThanOrEqual(4)
    expect(tags.filter(tag => /\bw-(?:\[[^\]]*\]|\d+)/.test(tag))).toEqual([])
  })
})
