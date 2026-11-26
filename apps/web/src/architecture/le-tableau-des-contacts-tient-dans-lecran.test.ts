import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CONTACTS_TABLE_COLUMNS,
  CONTACTS_TABLE_SHELL,
  CONTACT_COLUMN_MIN_REM,
} from '@/features/contacts/view/contacts-list/contactsTableColumns'

/**
 * GA-349 — LE TABLEAU DES CONTACTS TIENT DANS SON CONTENEUR, À TOUTE RÉSOLUTION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE CETTE GARDE NE PEUT PAS COUVRIR — À LIRE EN PREMIER
 * ─────────────────────────────────────────────────────────────────────────────
 * **jsdom ne mesure AUCUNE largeur.** `offsetWidth`, `scrollWidth`,
 * `getBoundingClientRect()` y rendent 0, et aucune feuille de style n'y est
 * appliquée. Un test de RENDU ne verra donc jamais ce défaut — c'est exactement
 * pour cette raison qu'il est arrivé en production et qu'un utilisateur a dû le
 * signaler. Cette garde ne prouve pas que le tableau tient : elle prouve que les
 * BORNES qui le font tenir sont toujours DÉCLARÉES.
 *
 * La vraie preuve a été prise à l'écran, en production, le 16/09/2026 sur
 * `https://app.bellum-ai.com/contacts` (commit servi `8d78833e9`, fenêtre
 * 1512 × 861) :
 *
 *     page          scrollWidth 1512 == clientWidth 1512   (elle ne débordait PAS)
 *     conteneur     1195 px
 *     tableau       1587 px   →  392 px hors du champ
 *
 *     Nom 474 · Entreprise 83 · Entité 174 · Rôle 145 · Niveau 127 · État 105
 *     Donnée vérifiée le 100 · Email / LinkedIn 202 · Mobile / Direct 60
 *     Score 54 · Action 64                                     total 1 588
 *
 * « Nom » prenait 30 % du tableau à lui seul : en `table-layout: auto`, c'est la
 * donnée la plus longue qui commande la mise en page.
 *
 * Refaire cette mesure demande un vrai moteur de rendu. Si un jour ce dépôt en a
 * un (Playwright), la mesure à reprendre est : `table.scrollWidth <=
 * conteneur.clientWidth` sur `/contacts`, à 1280, 1440 et 1512 px.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, DONC
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Le tableau fige ses colonnes (`table-fixed`) et ne déclare aucun plancher
 *    en pixels — un plancher est une promesse en pixels, et #2465 dit « peu
 *    import la résolution ».
 * 2. Chaque colonne déclare une PART à chaque palier où elle est rendue.
 * 3. À chaque palier, les parts des colonnes visibles font exactement 100 % :
 *    c'est ce qui fait que le tableau vaut la largeur de son conteneur, ni plus
 *    ni moins, à toute résolution.
 * 4. L'entête et le corps lisent le MÊME registre — aucune borne écrite en dur
 *    sur un `<TableHead>` ou un `<TableCell>`.
 * 5. La priorité de chaque colonne est écrite, avec sa raison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (rejouée à l'écriture, le 16/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Retiré `xl:w-[22%]` de la colonne « name » → ROUGE :
 *     « xl : 11 colonnes visibles, parts 102 % (attendu 100 %) — name 24 % ·
 *       company 9 % · … »
 * · Retiré `table-fixed` de `CONTACTS_TABLE_SHELL` → ROUGE sur « le tableau fige
 *   ses colonnes ».
 * · Réécrit `w-24` en dur sur l'entête « Score » → ROUGE en nommant la balise.
 */

const WEB_SRC = join(__dirname, '..')
const CONTACTS_LIST = join(WEB_SRC, 'features/contacts/view/contacts-list')
const HEADER_FILE = join(CONTACTS_LIST, 'ContactsTableHeaderRow.tsx')
const ROW_FILE = join(CONTACTS_LIST, 'ContactTableRow.tsx')
const TABLE_FILE = join(CONTACTS_LIST, 'ContactsTable.tsx')
/** Le témoin : l'AUTRE tableau à colonnes figées du produit, en `rem` + plancher. */
const ACCOUNTS_SHELL = join(WEB_SRC, 'features/accounts/view/accounts-list/accountsTableShell.ts')

/**
 * Les quatre paliers, du plus étroit au plus large. Ce sont les seuls que les
 * classes de ce registre emploient — `md` (768), `lg` (1024), `xl` (1280).
 */
const BANDS = ['base', 'md', 'lg', 'xl'] as const
type Band = (typeof BANDS)[number]

/**
 * Le fichier sans ses commentaires.
 *
 * ⚠️ Pas de l'hygiène : `ContactsTableHeaderRow.tsx` CITE `max-md:hidden` dans un
 * commentaire qui explique le masquage. Une garde qui compte un motif sans
 * retirer les commentaires lit sa propre justification.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Le palier À PARTIR DUQUEL une colonne est rendue (`null` = toujours rendue). */
function visibleFrom(className: string): Band | null {
  if (/\bmax-md:hidden\b/.test(className)) return 'md'
  if (/\bmax-lg:hidden\b/.test(className)) return 'lg'
  if (/\bmax-xl:hidden\b/.test(className)) return 'xl'
  return null
}

function isVisibleAt(className: string, band: Band): boolean {
  const from = visibleFrom(className)
  return from === null || BANDS.indexOf(band) >= BANDS.indexOf(from)
}

/**
 * La part déclarée à un palier : la variante la plus spécifique qui s'applique.
 * `w-[22%]` sans préfixe vaut au palier de base et cascade vers le haut, comme
 * en CSS — on remonte donc du palier demandé vers le bas.
 */
function shareAt(className: string, band: Band): number | null {
  for (let index = BANDS.indexOf(band); index >= 0; index -= 1) {
    const prefix = BANDS[index]
    const pattern =
      prefix === 'base'
        ? /(?<![\w:-])w-\[(\d+(?:\.\d+)?)%\]/
        : new RegExp(`(?<![\\w-])${prefix}:w-\\[(\\d+(?:\\.\\d+)?)%\\]`)
    const found = className.match(pattern)
    if (found) return Number(found[1])
  }
  return null
}

type Column = { id: string; className: string }

/** Les colonnes sans part déclarée là où elles sont rendues. */
function columnsWithoutShare(columns: readonly Column[]): string[] {
  const offenders: string[] = []
  for (const column of columns) {
    for (const band of BANDS) {
      if (!isVisibleAt(column.className, band)) continue
      if (shareAt(column.className, band) === null) offenders.push(`${column.id} @ ${band}`)
    }
  }
  return offenders
}

/** Les paliers dont les parts ne font pas exactement 100 %. */
function bandsThatDoNotAddUp(columns: readonly Column[]): string[] {
  const offenders: string[] = []
  for (const band of BANDS) {
    const visible = columns.filter(column => isVisibleAt(column.className, band))
    const shares = visible.map(column => ({ id: column.id, share: shareAt(column.className, band) ?? 0 }))
    const total = shares.reduce((sum, entry) => sum + entry.share, 0)
    if (Math.abs(total - 100) > 0.001) {
      const detail = shares.map(entry => `${entry.id} ${entry.share} %`).join(' · ')
      offenders.push(`${band} : ${visible.length} colonnes visibles, parts ${total} % (attendu 100 %) — ${detail}`)
    }
  }
  return offenders
}

/** Une borne écrite en dur sur une balise de colonne, au lieu du registre. */
const HARDCODED_BOUND = /(?:\bw-(?:\[[^\]]*\]|\d+)|\bmax-(?:sm|md|lg|xl|2xl):hidden)/

/** Les balises de colonne d'un fichier, commentaires retirés. */
function columnTags(file: string, tag: 'TableHead' | 'TableCell'): string[] {
  const source = withoutComments(readFileSync(file, 'utf8'))
  return [...source.matchAll(new RegExp(`<${tag}\\b[^>]*`, 'g'))].map(match => match[0])
}

/** L'ORDRE des colonnes, tel que les balises du fichier les citent — #3713. */
function columnOrder(file: string, tag: 'TableHead' | 'TableCell'): string[] {
  return columnTags(file, tag).map(opening => opening.match(/contactsColumnClass\('(\w+)'\)/)?.[1] ?? '?')
}

describe('GA-349 — le tableau des contacts tient dans son conteneur', () => {
  /**
   * LA PREUVE QUE LA GARDE LIT QUELQUE CHOSE.
   *
   * Sans elle, un renommage du registre la rendrait verte sur du vide — la garde
   * borgne que ce dépôt a produite sept fois. On COMPTE les colonnes réellement
   * inspectées, et le compte doit être celui de l'écran.
   */
  it('lit un corpus réel — les cinq colonnes composées et les deux fichiers qui les rendent', () => {
    // #3713.3 — onze colonnes (une par dimension) regroupées en cinq cellules
    // composées : le compte a changé, pas la garde qui le vérifie.
    expect(CONTACTS_TABLE_COLUMNS.length).toBe(5)
    expect(columnTags(HEADER_FILE, 'TableHead').length).toBe(5)
    expect(columnTags(ROW_FILE, 'TableCell').length).toBe(5)
    // Le registre est bien composé de chaînes de classes, pas d'objets vides.
    expect(CONTACTS_TABLE_COLUMNS.every(column => column.className.trim().length > 0)).toBe(true)
  })

  it('le tableau fige ses colonnes, et ne promet aucun plancher en pixels', () => {
    // `table-fixed` EST la borne : sans lui, la donnée la plus longue reprend la
    // main sur la mise en page (Nom à 474 px, mesuré le 16/09).
    expect(CONTACTS_TABLE_SHELL).toMatch(/\btable-fixed\b/)
    // Un plancher fait déborder dès que le conteneur passe en dessous : il tient
    // à 1 512 px et ment à 1 280. #2465 dit « peu import la résolution ».
    // Recette 21/10 A.5 : le seul plancher admis est en `rem` (GA-31) et dérivé de la colonne e-mail, voir plus bas.
    expect(CONTACTS_TABLE_SHELL).not.toMatch(/\bmin-w-\[[\d.]+px\]/)
    const table = withoutComments(readFileSync(TABLE_FILE, 'utf8'))
    expect(table).toMatch(/className=\{CONTACTS_TABLE_SHELL\}/)
  })

  it('chaque colonne déclare une part à chaque palier où elle est rendue', () => {
    const offenders = columnsWithoutShare(CONTACTS_TABLE_COLUMNS)
    // Si ce test tombe : une colonne rendue sans part déclarée reçoit la largeur
    // que `table-fixed` veut bien lui laisser — c'est-à-dire n'importe laquelle.
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('à chaque palier, les parts des colonnes visibles font exactement 100 %', () => {
    const offenders = bandsThatDoNotAddUp(CONTACTS_TABLE_COLUMNS)
    // Si ce test tombe : au-dessus de 100 %, le tableau dépasse son conteneur et
    // #2465 revient ; en dessous, une bande vide traîne à droite des colonnes.
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it("l'entête et le corps lisent le registre, aucun n'écrit sa propre borne", () => {
    const offenders: string[] = []
    for (const [file, tag] of [
      [HEADER_FILE, 'TableHead'],
      [ROW_FILE, 'TableCell'],
    ] as const) {
      for (const opening of columnTags(file, tag)) {
        if (!opening.includes('contactsColumnClass(')) offenders.push(`${tag} sans registre — « ${opening.trim()} »`)
        else if (HARDCODED_BOUND.test(opening)) offenders.push(`${tag} avec une borne en dur — « ${opening.trim()} »`)
      }
    }
    // Si ce test tombe : la borne d'une colonne vit à deux endroits. Ils
    // divergeront — c'est le décalage de colonnes que GA-29 traque, en pire.
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  /**
   * #3713 — recette prod 08/10 : « Coordonnées » surplombait l'entité,
   * « Entreprise » le palier, « Relation » l'e-mail/téléphone. Chaque balise
   * lisait pourtant bien le registre (garde ci-dessus, verte) — le défaut
   * était l'ORDRE : le corps citait `contact` APRÈS `company`/`relation`
   * alors que l'entête le citait juste après `identity`. Une balise qui lit
   * la bonne part n'empêche pas sa LIGNE d'être décalée si sa place dans la
   * séquence diverge de celle de l'entête.
   */
  it("#3713 — l'entête et le corps citent les colonnes dans le MÊME ordre que le registre", () => {
    const headerOrder = columnOrder(HEADER_FILE, 'TableHead')
    const rowOrder = columnOrder(ROW_FILE, 'TableCell')
    const registryOrder = CONTACTS_TABLE_COLUMNS.map(column => column.id)
    expect(headerOrder, headerOrder.join(' → ')).toEqual(registryOrder)
    expect(rowOrder, rowOrder.join(' → ')).toEqual(registryOrder)
  })

  it('la priorité de chaque colonne est écrite, avec sa raison', () => {
    const ranks = CONTACTS_TABLE_COLUMNS.map(column => column.rank).sort((a, b) => a - b)
    // Un ordre de colonnes sans raison écrite redevient une opinion en trois
    // semaines : le rang est unique, et chacun porte sa phrase.
    expect(ranks).toEqual([1, 2, 3, 4, 5])
    const mute = CONTACTS_TABLE_COLUMNS.filter(column => column.reason.trim().length < 40).map(column => column.id)
    expect(mute, mute.join(', ')).toEqual([])
  })

  /**
   * LA PREUVE QUE LA GARDE SAIT DIRE NON.
   *
   * Les deux formes exactes du défaut, jouées sur un registre synthétique : une
   * colonne sans part, et un palier dont les parts ne tombent pas juste.
   */
  it('refuse un registre dont un palier ne tombe pas juste', () => {
    const amputated: Column[] = [
      { id: 'name', className: 'w-[52%] md:w-[32%]' },
      { id: 'company', className: 'w-[28%] md:w-[18%]' },
      { id: 'action', className: 'w-[20%] md:w-[9%]' },
    ]
    // base : 52 + 28 + 20 = 100 ✓ · md : 32 + 18 + 9 = 59 ✗ — et le manque se
    // PROPAGE vers `lg` et `xl`, qui héritent de la variante `md` faute de
    // mieux. C'est ce qu'on veut lire : une part oubliée n'abîme pas un palier,
    // elle abîme tous ceux qui sont au-dessus.
    expect(bandsThatDoNotAddUp(amputated)).toEqual([
      'md : 3 colonnes visibles, parts 59 % (attendu 100 %) — name 32 % · company 18 % · action 9 %',
      'lg : 3 colonnes visibles, parts 59 % (attendu 100 %) — name 32 % · company 18 % · action 9 %',
      'xl : 3 colonnes visibles, parts 59 % (attendu 100 %) — name 32 % · company 18 % · action 9 %',
    ])
    expect(columnsWithoutShare([{ id: 'score', className: 'max-md:hidden' }])).toEqual([
      'score @ md',
      'score @ lg',
      'score @ xl',
    ])
    expect(HARDCODED_BOUND.test("<TableHead className={cn(COL_HEAD, 'w-24 max-md:hidden')}")).toBe(true)
  })

  /**
   * LA PREUVE QU'ELLE N'ATTRAPE PAS CE QU'ELLE NE VISE PAS.
   *
   * Deux témoins :
   *
   *  · une colonne légitimement LIBRE de part à un palier — parce qu'elle n'y est
   *    pas rendue du tout. Une garde qui la réclamerait exigerait une largeur
   *    pour une colonne absente ;
   *  · l'AUTRE tableau à colonnes figées du produit (`/accounts`), qui déclare
   *    ses colonnes en `rem` avec un plancher en `rem` — une forme différente,
   *    légitime, tenue par GA-118. Elle n'est pas dans le corpus de cette garde
   *    et n'a pas à l'être : un tableau dense qui DÉFILE est un autre arbitrage.
   */
  /**
   * Recette prod 08/10 (Q #3899, 1512 px = palier `xl`) — « Relation » et
   * « Suivi » (`commercial`) tronquaient en plein mot (« lu dans un o… »,
   * « 08 oct. 20… ») alors que `contact` (e-mail/téléphone, presque toujours
   * court) tenait une part plus large que les deux. Verrouille le nouveau
   * partage à ce palier pour que ce point ne se re-régresse pas en silence.
   */
  it('#3899 — à `xl` (1512 px), « relation » et « commercial » reçoivent plus que « contact »', () => {
    const shareOf = (id: string) => shareAt(CONTACTS_TABLE_COLUMNS.find(c => c.id === id)!.className, 'xl')
    // Recette 21/10 A.5 : 14 → 17 % pour tenir une adresse sur une ligne (plancher de table ci-dessous), repris sur `identity` / `company`.
    expect(shareOf('contact')).toBe(18)
    expect(shareOf('relation')).toBe(20)
    // #3911.2 (R12, 15/10) — la cellule « Mis à jour le JJ/MM/AAAA » mesurait 156 px de contenu pour
    // 132 px de colonne à 1512 px : rognée sur 25/25 lignes. 19 → 22 %, repris sur `identity` (30 → 27).
    expect(shareOf('commercial')).toBe(22)
    expect(shareOf('identity')).toBe(24)
    expect(shareOf('relation')).toBeGreaterThan(shareOf('contact')!)
    expect(shareOf('commercial')).toBeGreaterThan(shareOf('contact')!)
  })

  /**
   * Recette 21/10 A.5 (Simon) — `break-all` sur un e-mail dans 98 px : l'adresse coupée sur 2-3 lignes au milieu des
   * mots. En `table-fixed`, un `min-width` posé sur la cellule est IGNORÉ (mesuré en Chromium) : le plancher vit donc
   * sur le tableau, en `rem`, et DÉRIVE de la colonne e-mail — à chaque palier, plancher × part ≥ la largeur d'une
   * adresse courante. En dessous, la zone défilante du tableau prend le relais (jamais le corps de la page).
   */
  it('A.5 — à chaque palier, le plancher du tableau laisse à la colonne e-mail au moins sa largeur minimale', () => {
    const contact = CONTACTS_TABLE_COLUMNS.find(c => c.id === 'contact')!
    for (const band of ['md', 'lg', 'xl'] as const) {
      const floor = CONTACTS_TABLE_SHELL.match(new RegExp(`(?<![\\w-])${band}:min-w-\\[(\\d+(?:\\.\\d+)?)rem\\]`))
      expect(floor, `${band} : plancher en rem manquant`).not.toBeNull()
      const share = shareAt(contact.className, band)!
      expect((Number(floor![1]) * share) / 100, band).toBeGreaterThanOrEqual(CONTACT_COLUMN_MIN_REM)
    }
  })

  it("A.5 dit NON : un plancher trop bas pour l'e-mail serait refusé", () => {
    const floorTooLow = 40
    expect((floorTooLow * 17) / 100).toBeLessThan(CONTACT_COLUMN_MIN_REM)
  })

  it("laisse tranquille une colonne absente d'un palier, et l'autre tableau du produit", () => {
    expect(columnsWithoutShare([{ id: 'verified', className: 'max-xl:hidden xl:w-[8%]' }])).toEqual([])
    const accounts = readFileSync(ACCOUNTS_SHELL, 'utf8')
    expect(accounts).toMatch(/\btable-fixed\b/)
    // Il a un plancher en `rem`, ce que cette garde REFUSERAIT à la liste de
    // contacts — et c'est très bien : elle ne le lit pas.
    expect(accounts).toMatch(/\bmd:min-w-\[\d+(?:\.\d+)?rem\]/)
    expect(accounts).not.toContain('contactsColumnClass')
  })
})
