import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TALENT_VIEWS, talentSearchQuerySchema } from '@bellum/contracts'
import {
  VIVIER_REQUIRED_COLUMNS,
  VIVIER_TABLE_COLUMNS,
  VIVIER_TABLE_SHELL,
  vivierColumnsFor,
} from '@/features/consultants/view/vivierTableColumns'

/**
 * GA-350 — LE TABLEAU DU VIVIER TIENT DANS SON CONTENEUR, ET NE COMPTE JAMAIS ZÉRO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QU'ELLE PROTÈGE (elle ne l'invente pas)
 * ─────────────────────────────────────────────────────────────────────────────
 * Née le 16/09/2026 avec #2465, MESURÉE en production sur l'écran voisin :
 * `/contacts`, fenêtre 1 512 px — conteneur 1 195 px, tableau 1 587 px,
 * **392 px hors du champ**, onze colonnes en `table-layout: auto`. D'où
 * `table-fixed` et des largeurs qui font exactement celle du conteneur.
 *
 * #2737 (rouverte par Louis le 25/09/2026, capture de `/consultants` à ~1 000 px
 * de fenêtre) a fait tomber la moitié de la règle d'origine — les PARTS EN
 * POURCENTAGE par palier de viewport : « Complétude » recevait 3 % et
 * s'écrivait « Co/m/pl/ét/ud/e », « 20/100 » débordait, Statut et
 * Disponibilité se superposaient, quatre icônes s'empilaient. Une part ne
 * promet rien à un mot. La règle en vigueur (`vivierTableColumns.ts`) :
 *   · chaque colonne a un PLANCHER en pixels qui tient son en-tête sur une
 *     ligne, dans les DEUX langues ;
 *   · le tableau MESURE son conteneur et ajoute les colonnes par priorité tant
 *     que leurs planchers tiennent ; quatre ne partent jamais ;
 *   · l'en-tête ne coupe jamais un mot (`whitespace-nowrap`, pas `break-words`).
 * Et, depuis #2182 : **une donnée absente dit « non mesuré », jamais « 0 »**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE COUVRE PAS — dit en clair, parce qu'une garde muette ment
 * ─────────────────────────────────────────────────────────────────────────────
 * jsdom NE MESURE AUCUNE LARGEUR. Cette garde lit des bornes DÉCLARÉES et
 * ESTIME la largeur d'un libellé (`labelPx`). La mise en page RÉELLE se mesure
 * dans un vrai navigateur, à 900, 1 100, 1 280 et 1 512 px :
 * `e2e/tests/web/vivier-table-layout.spec.ts` (en-têtes sur une ligne, aucun
 * contenu hors de sa cellule, lignes ≤ 72 px, cibles ≥ 44 px au tactile).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (rejouée à l'écriture, le 25/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Remis « Compétences principales » comme en-tête FR → ROUGE, la colonne
 *   est NOMMÉE : « skills (fr) : « Compétences principales » demande ~200 px,
 *   plancher 176 px ».
 * · Remis `break-words` dans `COL_HEAD` → ROUGE sur la règle de l'en-tête.
 * · Remplacé la branche `UnknownValue` du TJM par `{ tjm: row.tjm ?? 0 }` →
 *   ROUGE sur le zéro de remplissage.
 */

const WEB_SRC = join(__dirname, '..')
const VIVIER_VIEW = join(WEB_SRC, 'features/consultants/view')
const HEADER_FILE = join(VIVIER_VIEW, 'VivierTableHeaderRow.tsx')
const ROW_FILE = join(VIVIER_VIEW, 'VivierTableRow.tsx')
const PARTS_FILE = join(VIVIER_VIEW, 'VivierRowParts.tsx')
const TABLE_FILE = join(VIVIER_VIEW, 'VivierTable.tsx')
const FILTERS_FILE = join(VIVIER_VIEW, 'TalentFilters.tsx')
// #4500 — le tiroir « Plus de filtres » est devenu la modale « Filtrer mon vivier » (refonte V22).
const DRAWER_FILE = join(VIVIER_VIEW, 'TalentFilterDialog.tsx')
const LOCALES = join(WEB_SRC, 'i18n/locales')

/** L'en-tête de chaque colonne, par sa clé i18n (`consultants.table.*`). */
const HEADER_KEYS: Record<(typeof VIVIER_TABLE_COLUMNS)[number]['id'], string> = {
  name: 'headerName',
  skills: 'headerSkills',
  availability: 'headerAvailability',
  location: 'headerLocation',
  followUp: 'headerFollowUp',
  actions: 'headerActions',
}

/**
 * Largeur ESTIMÉE d'un libellé en `text-sm font-medium` (14 px, Geist) :
 * 7,5 px par caractère — mesuré à l'écran le 18/09/2026 (#2500.1 :
 * « Compétences principales » 183 px pour 23 caractères, soit 8 px ;
 * « Localisation » 95 px pour 12, soit 7,9 px) et arrondi PAR EXCÈS du côté
 * des majuscules et accents. Plus le padding de la cellule (`p-2` = 16 px) et,
 * pour « Nom », la case de sélection (16 px + 8 px d'écart).
 */
const PX_PER_CHAR = 8
const CELL_PADDING_PX = 16
const CHECKBOX_PX = 24

function labelPx(id: string, label: string): number {
  return label.length * PX_PER_CHAR + CELL_PADDING_PX + (id === 'name' ? CHECKBOX_PX : 0)
}

/** Les en-têtes dont le libellé ne tient pas dans le plancher de sa colonne. */
function headersThatWrap(
  columns: readonly { id: string; minPx: number }[],
  lang: string,
  labels: Record<string, string>,
) {
  const offenders: string[] = []
  for (const column of columns) {
    // « Actions » est visuellement masqué (sr-only) : la colonne ne porte que des icônes nommées.
    if (column.id === 'actions') continue
    const label = labels[HEADER_KEYS[column.id as keyof typeof HEADER_KEYS]]
    if (!label) {
      offenders.push(`${column.id} (${lang}) : aucun libellé`)
      continue
    }
    const needed = labelPx(column.id, label)
    if (needed > column.minPx) {
      offenders.push(`${column.id} (${lang}) : « ${label} » demande ~${needed} px, plancher ${column.minPx} px`)
    }
  }
  return offenders
}

function tableLabels(lang: 'fr' | 'en'): Record<string, string> {
  const json = JSON.parse(readFileSync(join(LOCALES, lang, 'consultants.json'), 'utf8')) as {
    table: Record<string, string>
  }
  return json.table
}

/**
 * Le fichier sans ses commentaires — les fichiers de rendu CITENT les classes
 * qu'ils ont abandonnées dans les commentaires qui l'expliquent.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** La taille tactile d'un bouton `icon` : `pointer-coarse:min-w-11` = 44 px. */
const TOUCH_TARGET_PX = 44

/**
 * Un zéro de REMPLISSAGE — une valeur absente repliée sur `0` par `??` ou `||`.
 * Ne vise QUE le repli : `length > 0` ou `slice(0, 3)` sont des zéros VRAIS.
 */
const FILLER_ZERO = /(?:\?\?|\|\|)\s*0\b/g

function fillerZeros(file: string): string[] {
  const source = withoutComments(readFileSync(file, 'utf8'))
  return [...source.matchAll(FILLER_ZERO)].map(match => {
    const start = Math.max(0, match.index - 40)
    return source
      .slice(start, match.index + match[0].length)
      .replace(/\s+/g, ' ')
      .trim()
  })
}

describe('GA-350 — le tableau du vivier tient dans son conteneur', () => {
  /** LA PREUVE QUE LA GARDE LIT QUELQUE CHOSE : une sonde à zéro élément ne prouve rien. */
  // #4500 (refonte V22, Louis 23/10/2026) — le TJM et la séniorité quittent la liste : six colonnes, celles de la maquette.
  it('lit un corpus réel — six colonnes (refonte V22), deux langues, sept vues, les filtres du contrat', () => {
    expect(VIVIER_TABLE_COLUMNS.length).toBe(6)
    expect(Object.keys(tableLabels('fr')).length).toBeGreaterThanOrEqual(11)
    expect(Object.keys(tableLabels('en')).length).toBeGreaterThanOrEqual(11)
    // #2182.23 — « Sans mission récente » ajoute une septième vue.
    expect(TALENT_VIEWS.length).toBe(7)
    expect(Object.keys(talentSearchQuerySchema.shape).length).toBeGreaterThanOrEqual(20)
    for (const file of [FILTERS_FILE, DRAWER_FILE, HEADER_FILE, ROW_FILE, TABLE_FILE]) {
      expect(withoutComments(readFileSync(file, 'utf8')).length).toBeGreaterThan(500)
    }
  })

  it('le tableau fige ses colonnes, mesure son CONTENEUR et y choisit ses colonnes', () => {
    // `table-fixed` EST la borne : sans lui, la donnée la plus longue reprend
    // la main et #2465 revient.
    expect(VIVIER_TABLE_SHELL).toMatch(/\btable-fixed\b/)
    const table = withoutComments(readFileSync(TABLE_FILE, 'utf8'))
    expect(table).toMatch(/className=\{VIVIER_TABLE_SHELL\}/)
    // Le conteneur, pas la fenêtre : la barre latérale et le panneau de
    // correspondance (#2526) mangent une place qu'aucun palier ne voit.
    expect(table).toMatch(/new ResizeObserver\(/)
    expect(table).toMatch(/vivierColumnsFor\(width\)/)
  })

  it('l’entête et la ligne rendent la MÊME liste de colonnes, chacune typée sur le registre', () => {
    const header = withoutComments(readFileSync(HEADER_FILE, 'utf8'))
    const row = withoutComments(readFileSync(ROW_FILE, 'utf8'))
    // `Record<VivierColumnId, …>` : le compilateur refuse une colonne du
    // registre sans en-tête ou sans cellule — GA-29 (une entête sans sa
    // cellule décale toute la ligne) tenu par le type, pas par une regex.
    expect(header).toMatch(/Record<VivierColumnId, string>/)
    expect(row).toMatch(/Record<VivierColumnId, \(\) => ReactNode>/)
    expect(header).toMatch(/columns\.map\(/)
    expect(row).toMatch(/columns\.map\(/)
    // Et plus aucune part par palier de viewport écrite à la main.
    for (const source of [header, row]) expect(source).not.toMatch(/\b(?:md|lg|xl):w-\[/)
  })

  it('#3488 — la colonne Nom lit « Nom non renseigné » en entier, dans les deux langues', () => {
    // Mesuré en production (Y20) : colonne au plancher de 176 px, 124 px restant au
    // texte (52 px pris par le padding, la case, l'avatar et leurs écarts) — le
    // placeholder en demande davantage et se coupait.
    const OVERHEAD_PX = 52
    const name = VIVIER_TABLE_COLUMNS.find(column => column.id === 'name')
    for (const lang of ['fr', 'en']) {
      const json = JSON.parse(readFileSync(join(LOCALES, lang, 'consultants.json'), 'utf8')) as {
        name: { unnamed: string }
      }
      const needed = json.name.unnamed.length * PX_PER_CHAR + OVERHEAD_PX
      expect(name?.minPx, `${lang} : « ${json.name.unnamed} » demande ~${needed} px`).toBeGreaterThanOrEqual(needed)
    }
  })

  it('la priorité de chaque colonne est écrite, unique, avec sa raison ; quatre ne partent jamais', () => {
    const ranks = VIVIER_TABLE_COLUMNS.map(column => column.rank).sort((a, b) => a - b)
    expect(ranks).toEqual(VIVIER_TABLE_COLUMNS.map((_, index) => index + 1))
    const mute = VIVIER_TABLE_COLUMNS.filter(column => column.reason.trim().length < 40).map(column => column.id)
    expect(mute, mute.join(', ')).toEqual([])
    expect([...VIVIER_REQUIRED_COLUMNS].sort()).toEqual(['actions', 'availability', 'name', 'skills'])
    for (const width of [340, 594, 794, 974, 1206]) {
      const shown = vivierColumnsFor(width).map(column => column.id)
      for (const id of VIVIER_REQUIRED_COLUMNS) expect(shown, `${id} @ ${width} px`).toContain(id)
    }
  })

  it('#2737 — chaque en-tête tient sur UNE ligne dans le plancher de sa colonne, en FR et en EN', () => {
    const offenders = [
      ...headersThatWrap(VIVIER_TABLE_COLUMNS, 'fr', tableLabels('fr')),
      ...headersThatWrap(VIVIER_TABLE_COLUMNS, 'en', tableLabels('en')),
    ]
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it("#2737 — l'entête ne coupe jamais un mot : une ligne, ellipse de secours, libellé au survol", () => {
    const header = readFileSync(HEADER_FILE, 'utf8')
    const declaration = header.match(/const COL_HEAD = '([^']*)'/)
    expect(declaration, 'COL_HEAD introuvable dans VivierTableHeaderRow.tsx').not.toBeNull()
    const colHead = declaration![1]
    expect(colHead).toMatch(/\bwhitespace-nowrap\b/)
    expect(colHead, 'break-words coupait « Complétude » lettre par lettre (#2737)').not.toMatch(
      /\bbreak-words\b|\bbreak-all\b/,
    )
    expect(withoutComments(header)).toMatch(/title=\{labels\[column\.id\]\}/)
  })

  it('#2737 — la colonne « actions » tient « Rapprocher » et le menu entiers, et ne se rogne jamais', () => {
    const actions = VIVIER_TABLE_COLUMNS.find(column => column.id === 'actions')
    expect(actions, 'actions absente de VIVIER_TABLE_COLUMNS').toBeDefined()
    // Refonte Théo — « Rapprocher » en toutes lettres (libellé + icône 16 px + 24 px
    // de padding de bouton), le menu « … » en cible tactile, 4 px d'écart, 12 px de
    // padding de cellule (pl-2 pr-1). Mesuré sur le libellé le plus long des deux langues.
    const matchLabel = Math.max(
      ...(['fr', 'en'] as const).map(
        lang =>
          (JSON.parse(readFileSync(join(LOCALES, lang, 'consultants.json'), 'utf8')) as { row: { match: string } }).row
            .match.length,
      ),
    )
    expect(actions!.minPx).toBeGreaterThanOrEqual(matchLabel * 8 + 16 + 24 + TOUCH_TARGET_PX + 4 + 12)
    for (const width of [340, 460, 594]) {
      expect(vivierColumnsFor(width).find(column => column.id === 'actions')?.widthPx).toBe(actions!.minPx)
    }
    // Une seule action visible, LIBELLÉE, et le menu : plus les quatre icônes empilées de la capture.
    const parts = withoutComments(readFileSync(PARTS_FILE, 'utf8'))
    expect(parts).toMatch(/<DropdownMenuTrigger asChild>/)
    expect(parts.match(/size="icon"/g)?.length).toBe(1)
    expect(parts).toMatch(/\{t\('row\.match'\)\}/)
  })

  /** LE TÉMOIN — « non mesuré » n'est jamais « 0 », et chaque absence est NOMMÉE. */
  it("une colonne dont la donnée manque dit « non mesuré », et n'écrit jamais un zéro de remplissage", () => {
    const offenders = [ROW_FILE, PARTS_FILE].flatMap(file =>
      fillerZeros(file).map(sample => `${file.split('/').pop()} écrit un zéro de remplissage : ${sample}`),
    )
    expect(offenders, offenders.join('\n')).toEqual([])
    // Refonte V22 (#4500) — les valeurs PREMIÈRES d'une cellule qui peuvent manquer :
    // titre, compétences, localisation — trois absences nommées (la séniorité et le
    // TJM ont quitté la liste avec leur colonne). Les lignes SECONDES (mode de
    // travail, référent) suivent la doctrine « dans une liste, une absence ne fait
    // aucune ligne » : elles se taisent.
    const source = [ROW_FILE, PARTS_FILE].map(file => withoutComments(readFileSync(file, 'utf8'))).join('\n')
    expect([...source.matchAll(/<UnknownValue\b/g)].length).toBeGreaterThanOrEqual(3)
  })

  /**
   * #2662.1 — LA CASE DE SÉLECTION tient DANS la colonne « Nom » (jamais une
   * colonne de plus) et porte `shrink-0` : sans lui, un enfant flex reprend sa
   * largeur minimale de CONTENU et peut écraser le nom tronqué voisin.
   */
  it('#2662.1 — la case de sélection ne devient pas une colonne, et ne s’écrase jamais', () => {
    expect(VIVIER_TABLE_COLUMNS.map(column => column.id)).not.toContain('select')
    const row = withoutComments(readFileSync(ROW_FILE, 'utf8'))
    const checkboxWrapper = row.match(/<div className="([^"]*\bshrink-0\b[^"]*)"[\s\S]{0,120}?<Checkbox/)
    expect(
      checkboxWrapper,
      'la case doit être portée par un conteneur `shrink-0`, juste avant `<Checkbox`',
    ).not.toBeNull()
    expect(row).toMatch(/<div className="flex min-w-0 items-center gap-2">/)
  })

  /** CE QU'ELLE NE DOIT PAS ATTRAPER, et ce qu'elle doit REFUSER — les deux témoins. */
  it('accepte un zéro VRAI et un libellé court ; refuse un libellé trop long, en le NOMMANT', () => {
    const innocent = 'if (row.zones.length > 0) return row.topSkills.slice(0, 3)'
    expect(innocent.match(FILLER_ZERO)).toBeNull()
    expect(headersThatWrap([{ id: 'skills', minPx: 176 }], 'fr', { headerSkills: 'Compétences' })).toEqual([])
    expect(headersThatWrap([{ id: 'skills', minPx: 176 }], 'fr', { headerSkills: 'Compétences principales' })).toEqual([
      'skills (fr) : « Compétences principales » demande ~200 px, plancher 176 px',
    ])
  })
})
