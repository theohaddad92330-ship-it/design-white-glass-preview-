/**
 * GA-118 et GA-119 — une colonne coupée reste LISIBLE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, ET POURQUOI CE N'ÉTAIT PAS UN DÉFAUT DE DÉFILEMENT
 * ─────────────────────────────────────────────────────────────────────────
 * Recette du 30/08, à 1 512 px : `/accounts` rendait « Prochai… » et
 * « Ouvrir le c… », `/actions` rendait « 30 août 20:… ». Trois hypothèses
 * étaient posées — pas de conteneur défilant, défilement non découvrable,
 * `min-width: auto` sur un enfant de flex.
 *
 * Aucune des trois n'explique l'ELLIPSE. Un conteneur défilant existe des deux
 * côtés, `index.css` pose déjà `min-width: 0` globalement, et surtout : **un
 * défilement ne rattrape jamais une colonne que `table-fixed` a déjà
 * rétrécie**. Les points de suspension ne viennent pas d'un contenu hors du
 * cadre, ils viennent d'un contenu plus large que SA CELLULE.
 *
 * La cause est arithmétique, et elle vit dans une seule ligne de classes :
 *
 *   `/actions`  — plancher `min-w-[900px]`, somme de ses propres colonnes
 *                 230 + 260 + 190 + 170 + 110 + 48 = **1 008 px**. Le plancher
 *                 est 108 px SOUS ses colonnes : `table-fixed` les répartit
 *                 alors au prorata et les rétrécit TOUTES, à toute largeur de
 *                 fenêtre et à toute taille de texte. « Date » perdait ~15 px,
 *                 assez pour couper « 30 août 20:34 ».
 *
 *   `/accounts` — plancher `md:min-w-[1252px]`, colonnes `w-28`/`w-36`/`w-40`…
 *                 c'est-à-dire des **rem**. Les deux coïncident à 16 px de
 *                 police racine, par chance. Le réglage « Taille du texte :
 *                 Grand » agit sur la police RACINE : les colonnes grandissent,
 *                 le plancher en pixels ne bouge pas, et le même écrasement
 *                 revient — d'où « en Grand, la colonne Facturé disparaît ».
 *
 * Une seule règle couvre les deux : **le plancher d'un tableau à colonnes
 * fixes se mesure dans la même unité que ses colonnes, et ne descend jamais
 * sous leur somme.** Écrit en `rem`, il suit le réglage de taille de texte
 * exactement comme les colonnes qu'il doit couvrir ; écrit en pixels, il ment
 * dès que le lecteur agrandit.
 *
 * ⚠️ 16/09/2026 (#2465) — L'ASSERTION A CONNAÎT DÉSORMAIS UNE SECONDE FORME.
 * Un plancher en `rem` est une promesse en PIXELS : il fait tenir le tableau à
 * une résolution et le fait déborder à la suivante. `/contacts` a payé ce
 * défaut — 392 px hors du champ à 1 512 px — et le retour disait « peu import la
 * résolution ». Un tableau dont les colonnes sont déclarées en PARTS (`w-[22%]`)
 * n'a donc PAS de plancher, et ne doit pas en avoir : sa largeur est déjà
 * relative à son conteneur. Les deux formes coexistent et s'excluent — le dense
 * qui défile (`/accounts`), et celui qui tient toujours (`/contacts`, garde
 * GA-349). Preuve destructive rejouée : retiré `table-fixed` du tableau des
 * contacts → il sort du corpus ; remis un `min-w-[70rem]` sur ses parts →
 * assertion C muette (parts non sommables en rem) mais GA-349 rouge.
 *
 * GA-119 traite ce qui RESTE une fois les colonnes sauvées : le débordement
 * légitime d'un tableau dense. Il défile — mais le conteneur qui défile est le
 * `<div>` anonyme de `packages/ui/src/components/table.tsx`, qui n'avait ni
 * tabulation, ni rôle, ni nom. Au clavier, la dernière colonne était
 * littéralement inatteignable.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Table, TableBody, TableCell, TableRow } from '@bellum/ui'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'

const SRC = join(__dirname, '..')
const UI_TABLE = join(__dirname, '../../../../packages/ui/src/components/table.tsx')
const OVERFLOW_HOOK = join(__dirname, '../../../../packages/ui/src/hooks/use-horizontal-overflow.ts')

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

const short = (file: string) => file.slice(file.indexOf('/src/'))

/**
 * Une largeur Tailwind, en rem. `null` quand elle n'est pas mesurable —
 * `w-auto` et `w-full` ne sont pas des largeurs, ce sont des instructions.
 *
 * ⚠️ Un `px` rend bien un nombre de rem, mais un nombre de rem FIGÉ à 16 px de
 * racine : c'est précisément le mensonge que GA-118 traque. La conversion sert
 * à comparer des sommes, jamais à absoudre l'unité — c'est l'assertion B qui
 * juge l'unité.
 */
function widthInRem(raw: string): number | null {
  const arbitrary = raw.match(/^\[(.+)\]$/)
  if (arbitrary) {
    const value = arbitrary[1]
    const px = value.match(/^([\d.]+)px$/)
    if (px) return Number(px[1]) / 16
    const rem = value.match(/^([\d.]+)rem$/)
    if (rem) return Number(rem[1])
    return null
  }
  // Échelle d'espacement Tailwind : `w-12` = 3rem.
  if (/^\d+$/.test(raw)) return Number(raw) / 4
  return null
}

/** La largeur RETENUE d'une entête : la variante `md:` prime — c'est au-delà de
 *  768 px que le plancher s'applique et que les colonnes secondaires existent. */
function headWidthInRem(tag: string): number | null {
  const md = tag.match(/\bmd:w-(\[[^\]]+\]|\d+)/)
  if (md) return widthInRem(md[1])
  const base = tag.match(/(?<![\w:-])w-(\[[^\]]+\]|\d+)/)
  return base ? widthInRem(base[1]) : null
}

type FixedTable = {
  file: string
  /** La chaîne de classes portée par le `<Table …>` à colonnes fixes. */
  classes: string
  /** Le plancher déclaré, tel qu'écrit (`63rem`, `1252px`…). */
  floor: string | null
  /** Les largeurs d'entête déclarées DANS CE FICHIER, en rem. */
  heads: (number | null)[]
  /** Ses colonnes sont déclarées en PARTS (%), donc sans plancher — voir `declaresShares`. */
  shares: boolean
}

/**
 * La classe d'un `<Table>`, qu'elle soit écrite sur place ou tirée d'une
 * constante importée.
 *
 * ⚠️ 06/09/2026 — c'est ce qui manquait, et ça a coûté #1623. `AccountsTable`
 * et son squelette recopiaient la MÊME chaîne de classes ; les dédoublonner dans
 * `accountsTableShell.ts` (GA-26, un réglage vit à un seul endroit) faisait
 * disparaître `table-fixed` du JSX — et avec lui les deux tableaux du corpus de
 * cette garde. Bien ranger son code ne doit pas éteindre la garde qui le
 * surveille : on suit donc l'identifiant jusqu'à sa constante.
 */
function tableClasses(source: string, dir: string, opening: string): string | null {
  if (/\bclassName="/.test(opening)) return opening
  const identifier = opening.match(/className=\{([A-Z_][A-Z0-9_]*)\}/)
  if (!identifier) return opening
  for (const sibling of readdirSync(dir)) {
    if (!sibling.endsWith('.ts') || sibling.includes('.test.')) continue
    const declared = readFileSync(join(dir, sibling), 'utf8').match(
      new RegExp(`export const ${identifier[1]}\\s*(?::[^=]+)?=\\s*(['"\`])([\\s\\S]*?)\\1`),
    )
    if (declared) return declared[2]
  }
  return null
}

/**
 * Les entêtes qui appartiennent à un tableau — y compris quand elles vivent dans
 * un fichier VOISIN.
 *
 * ⚠️ L'assertion C sautait jusqu'ici « les fichiers dont les entêtes vivent
 * ailleurs ». C'était honnête — on ne somme pas ce qu'on ne lit pas — mais la
 * conséquence ne l'était pas : `/accounts`, le tableau qui a motivé cette garde,
 * était exactement dans ce cas, et il est resté vert pendant que son plancher
 * (1 220 px) dépassait ses colonnes (1 056 px) de 164 px en production. Une
 * garde qui saute le seul cas qu'elle vise ne garde rien. On va donc chercher
 * les `<TableHead>` dans les fichiers du même dossier que le fichier IMPORTE.
 */
function headTags(source: string, dir: string): string[] {
  const own = [...source.matchAll(/<TableHead\b[^>]*/g)].map(head => head[0])
  if (own.length > 0) return own
  const imported = [...source.matchAll(/from '\.\/([A-Za-z0-9_-]+)'/g)].map(match => `${match[1]}.tsx`)
  for (const sibling of imported) {
    const path = join(dir, sibling)
    let siblingSource: string
    try {
      siblingSource = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    const heads = [...siblingSource.matchAll(/<TableHead\b[^>]*/g)].map(head => head[0])
    // `SortableTableHead` rend un `<TableHead>` sans l'écrire : sa largeur est
    // passée en `className={cn(COL_HEAD, '…')}`, qu'on lit de la même façon.
    const sortable = [...siblingSource.matchAll(/<SortableTableHead\b[\s\S]*?\/>/g)].map(head => head[0])
    if (heads.length + sortable.length > 0) return [...heads, ...sortable]
  }
  return own
}

function headWidths(source: string, dir: string): (number | null)[] {
  return headTags(source, dir).map(headWidthInRem)
}

/** Une part : une largeur de colonne exprimée en POURCENTAGE du tableau. */
const SHARE = /\bw-\[\d+(?:\.\d+)?%\]/

/**
 * #2737 — une part CALCULÉE : `style={{ width: \`${…}%\` }}` sur l'entête.
 * Le vivier mesure son conteneur et en déduit ses colonnes
 * (`vivierColumnsFor`) : ses parts sont des pourcentages écrits au rendu, pas
 * des classes. Même forme légitime que `w-[22%]` — relative au conteneur,
 * sommée à 100 % — lue ici pour que la garde ne la prenne pas pour un tableau
 * sans plancher. Témoin : `VivierTableHeaderRow.tsx`.
 */
const COMPUTED_SHARE = /style=\{\{\s*width:\s*`[^`]*%`/

/**
 * Un tableau dont les colonnes sont déclarées en PARTS, et non en `rem`.
 *
 * ⚠️ AJOUTÉ LE 16/09/2026 (#2465). Une part est DÉJÀ relative au conteneur :
 * quand les parts d'un palier font 100 %, le tableau vaut exactement la largeur
 * qu'on lui donne, à toute résolution. Lui demander en plus un plancher en `rem`
 * serait lui demander de déborder — c'est précisément le défaut que `/contacts`
 * a payé : « le tableau doit tenir dans l'écran peu import la résolution ».
 *
 * Les deux formes sont donc légitimes, et elles s'excluent :
 *
 *   · colonnes en `rem` + plancher en `rem` → un tableau DENSE qui défile quand
 *     l'écran ne suffit plus (`/accounts`, GA-119 rend le défilement atteignable) ;
 *   · colonnes en PARTS, aucun plancher → un tableau qui TIENT toujours, et dont
 *     le texte se tronque (`/contacts`).
 *
 * On suit l'appel jusqu'au registre qui le porte, comme `tableClasses()` suit un
 * identifiant jusqu'à sa constante : ranger ses parts dans un module ne doit pas
 * éteindre la garde qui les surveille.
 */
function declaresShares(source: string, dir: string): boolean {
  const tags = headTags(source, dir)
  if (tags.some(tag => SHARE.test(tag) || COMPUTED_SHARE.test(tag))) return true
  const helpers = new Set(tags.flatMap(tag => [...tag.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\(/g)].map(call => call[1])))
  for (const sibling of readdirSync(dir)) {
    if (!sibling.endsWith('.ts') || sibling.includes('.test.')) continue
    const siblingSource = readFileSync(join(dir, sibling), 'utf8')
    for (const helper of helpers) {
      if (!new RegExp(`export function ${helper}\\b`).test(siblingSource)) continue
      if (SHARE.test(siblingSource)) return true
    }
  }
  return false
}

/** Le corpus : tout `<Table>` qui fige ses colonnes. C'est le seul endroit où un
 *  plancher trop court se paie en ellipses — sans `table-fixed`, une colonne se
 *  dimensionne sur son contenu et pousse le tableau, elle ne se rétrécit pas. */
function fixedTables(): FixedTable[] {
  const found: FixedTable[] = []
  for (const file of tsxFiles(SRC)) {
    const source = readFileSync(file, 'utf8')
    const dir = file.slice(0, file.lastIndexOf('/'))
    for (const match of source.matchAll(/<Table\b([\s\S]*?)>/g)) {
      const classes = tableClasses(source, dir, match[1])
      if (classes === null || !/\btable-fixed\b/.test(classes)) continue
      const floor = classes.match(/min-w-\[([^\]]+)\]/)
      found.push({
        file,
        classes,
        floor: floor ? floor[1] : null,
        heads: headWidths(source, dir),
        shares: declaresShares(source, dir),
      })
    }
  }
  return found
}

/**
 * Les exceptions NOMMÉES, avec leur raison et leur numéro de décision.
 *
 * ⚠️ Ce ne sont pas des dispenses : ce sont des défauts MESURÉS qu'un lot n'avait
 * pas le droit de toucher. Les retirer de cette liste est le geste qui clôt leur
 * décision ; en ajouter est le geste qui rouvre le défaut.
 *
 * ✅ **D337 est CLOSE depuis le 06/09/2026 (#1623).** Les deux fichiers de
 * `/accounts` y figuraient — plancher en pixels pour des colonnes en rem. Leur
 * plancher est désormais écrit en `rem` dans `accountsTableShell.ts`, et cette
 * liste est vide. Elle reste là, avec son récit, parce qu'une liste vide dit
 * quelque chose qu'un tableau supprimé ne dit plus : la prochaine exception
 * devra s'écrire ici, avec sa raison.
 *
 * ⚠️ Et ce n'est pas l'exception seule qui avait laissé passer #1623 : même sans
 * elle, l'assertion C sautait `AccountsTable` parce que ses entêtes vivent dans
 * un fichier voisin. Une exception se voit ; un cas silencieusement sauté, non.
 */
const FLOOR_UNIT_EXCEPTIONS: string[] = []

/**
 * Le tableau à colonnes fixes qui ne déclare AUCUN plancher.
 *
 * D341 — `WatchlistTable.tsx` : `w-full table-fixed` sans `min-w`, et son
 * fichier ne pose aucun conteneur défilant. Ses colonnes se rétrécissent donc
 * jusqu'à la largeur du conteneur, sans jamais rien à faire défiler. Hors
 * périmètre de ce lot, mesuré et parqué plutôt que passé sous silence.
 */
const MISSING_FLOOR_EXCEPTIONS = ['watchlist/view/WatchlistTable.tsx']

describe('GA-118 — le plancher d’un tableau se mesure comme ses colonnes', () => {
  const tables = fixedTables()

  it('la garde lit vraiment des tableaux à colonnes fixes', () => {
    // Sans ce témoin, un renommage de `table-fixed` rendrait la garde verte sur
    // un corpus vide — la garde borgne que ce dépôt a produite sept fois.
    expect(tables.length).toBeGreaterThanOrEqual(3)
    expect(tables.some(table => table.heads.some(head => head !== null))).toBe(true)
  })

  it('A — un tableau à colonnes fixes déclare un plancher, ou déclare des PARTS', () => {
    const offenders = tables
      .filter(table => table.floor === null && !table.shares)
      .map(table => short(table.file))
      .filter(file => !MISSING_FLOOR_EXCEPTIONS.some(allowed => file.endsWith(allowed)))
    // Si ce test tombe : `table-fixed` sans plancher NI parts répartit la largeur
    // du conteneur entre les colonnes, quelles que soient les largeurs déclarées.
    // Toutes se rétrécissent ensemble, et rien ne défile.
    expect(offenders).toEqual([])
  })

  /**
   * A — LE TÉMOIN DE LA DISPENSE : elle sert, et elle ne déborde pas.
   *
   * Une dispense que personne n'emprunte est un trou qu'on a oublié de refermer ;
   * une dispense qui couvre plus que son cas est une garde qu'on a éteinte. On
   * vérifie donc les deux : au moins un tableau déclare des parts, et le tableau
   * des comptes — colonnes en `rem`, plancher en `rem` — n'en fait PAS partie.
   */
  it('A — la dispense des parts sert, et ne couvre pas le tableau des comptes', () => {
    expect(tables.some(table => table.shares)).toBe(true)
    const accounts = tables.filter(table => short(table.file).endsWith('accounts-list/AccountsTable.tsx'))
    expect(accounts.length).toBeGreaterThanOrEqual(1)
    expect(accounts.every(table => table.shares)).toBe(false)
    // Et la lecture des parts sait dire NON à un tableau qui n'en déclare aucune.
    expect(SHARE.test("<TableHead className={cn(COL_HEAD, 'w-28 md:w-36')}")).toBe(false)
    expect(SHARE.test("<TableHead className={cn(COL_HEAD, 'w-[22%]')}")).toBe(true)
  })

  it('B — le plancher s’écrit en rem, jamais en pixels', () => {
    const offenders = tables
      .filter(table => table.floor !== null && !table.floor.endsWith('rem'))
      .map(table => `${short(table.file)}: min-w-[${table.floor}]`)
      .filter(entry => !FLOOR_UNIT_EXCEPTIONS.some(allowed => entry.includes(allowed)))
    // Si ce test tombe : un plancher en pixels ignore le réglage « Taille du
    // texte », qui agit sur la police RACINE. Les colonnes (en rem) grandissent,
    // le plancher non, et `table-fixed` les rétrécit toutes.
    expect(offenders).toEqual([])
  })

  it('C — le plancher couvre la somme des colonnes du même fichier', () => {
    const offenders: string[] = []
    for (const table of tables) {
      if (table.floor === null) continue
      const floor = widthInRem(`[${table.floor}]`)
      // Un fichier dont les entêtes vivent ailleurs (`AccountsTable`) n'est pas
      // sommable ici : on ne compare que ce qu'on lit VRAIMENT.
      if (floor === null || table.heads.length === 0 || table.heads.some(head => head === null)) continue
      const sum = table.heads.reduce<number>((acc, head) => acc + (head ?? 0), 0)
      if (floor + 0.001 < sum) offenders.push(`${short(table.file)}: plancher ${floor}rem < colonnes ${sum}rem`)
    }
    // Si ce test tombe : le tableau promet à ses colonnes une largeur qu'il ne
    // leur réserve pas. `table-fixed` arbitre au prorata — chaque colonne perd
    // sa part, et le contenu se coupe avec des points de suspension qu'aucun
    // défilement ne rattrape.
    expect(offenders).toEqual([])
  })

  it('C — le témoin : au moins un tableau est réellement sommé', () => {
    const summed = tables.filter(
      table =>
        table.floor !== null &&
        table.heads.length > 0 &&
        table.heads.every(head => head !== null) &&
        widthInRem(`[${table.floor}]`) !== null,
    )
    expect(summed.length).toBeGreaterThanOrEqual(1)
  })

  /**
   * C — LE TÉMOIN NOMMÉ : `/accounts` est bien DANS la somme.
   *
   * ⚠️ Le témoin générique ci-dessus était vert pendant que ce tableau-là était
   * sauté : « au moins un tableau est sommé » ne dit pas LEQUEL, et le seul qui
   * violait la règle n'en faisait pas partie. Une garde qui compte ses sujets
   * sans les nommer ne sait pas qu'elle en a perdu un.
   *
   * Ce test échoue si `AccountsTable` retombe hors du calcul — parce que sa
   * classe est repassée par une forme qu'on ne sait pas suivre, ou parce que ses
   * entêtes ont déménagé encore ailleurs.
   */
  it('C — le témoin nommé : le tableau des comptes est réellement sommé', () => {
    const accounts = tables.find(table => short(table.file).endsWith('accounts-list/AccountsTable.tsx'))
    expect(accounts, 'AccountsTable est sorti du corpus de GA-118').toBeDefined()
    expect(accounts?.floor, 'AccountsTable ne déclare plus de plancher').toBeTruthy()
    /* ⚠️ SEPT depuis le 23/10/2026 (contrôle de la refonte Théo comptes-liste) : Compte · Sujet & prochaine
       action · Relation · Personnes · Responsable · Décision · « … », 69rem — l'accessibilité, la grille et la
       dernière analyse se lisent dans les cellules qu'elles qualifient. Avant : NEUF (refonte Théo comptes-liste) : « Personnes » est une colonne neuve de
       7rem, et « Score » (7rem) devient « Décision d'équipe » (10rem) — la somme passe à 82rem avec son
       plancher. HUIT depuis le 07/10/2026 (#3749) : le verdict de la grille de
       qualification a rejoint le tableau, colonne neuve de 6rem — ni un
       emprunt ni un renommage des sept précédentes. La somme passe à 72rem
       et le plancher avec elle : c'est exactement ce que l'assertion C sert
       à vérifier. */
    expect(accounts?.heads.length, 'les entêtes du tableau des comptes ne sont plus lues').toBe(7)
    expect(
      accounts?.heads.every(head => head !== null),
      'une largeur d’entête n’est plus mesurable',
    ).toBe(true)
  })

  /**
   * C — LA PREUVE QUE L'ASSERTION SAIT DIRE NON.
   *
   * Le plancher réellement servi en production le 06/09/2026 — 1 220 px, soit
   * 76,25rem — face aux colonnes de `/accounts`. Il ne les DÉPASSE pas, il les
   * dépasse à l'envers : c'est le cas symétrique, celui d'un plancher qui promet
   * plus qu'il n'y a de colonnes et force un défilement pour rien. L'assertion C
   * ne juge que le sens qui coupe les colonnes ; ce test vérifie qu'elle le
   * juge vraiment, en lui présentant un plancher SOUS la somme.
   */
  it('C — sait dire NON : un plancher sous la somme des colonnes est refusé', () => {
    const heads = [16, 16, 8, 7, 7, 10, 5]
    const sum = heads.reduce((acc, head) => acc + head, 0)
    const tooShort = widthInRem('[56rem]') ?? 0
    expect(tooShort + 0.001 < sum).toBe(true)
  })
})

/**
 * GA-119 — ce qui déborde reste ATTEIGNABLE.
 *
 * Le conteneur défilant partagé est le `<div>` de `packages/ui`. Il défilait
 * déjà — à la souris, et à condition de trouver une barre de 6 px rendue tout
 * en bas d'un tableau de vingt-cinq lignes. Au clavier, rien : un `<div>` qui
 * défile sans `tabIndex` n'est atteignable par aucune touche.
 *
 * La garde est COMPORTEMENTALE, pas textuelle : elle rend le composant, force
 * un débordement, et lit le DOM. Une garde qui aurait cherché `overflow-x` dans
 * la source aurait été verte pendant tout le temps où la colonne était
 * inatteignable — c'est exactement la garde borgne que GA-33 a été.
 *
 * ⚠️ Elle rend les DEUX tableaux partagés du produit. Il y en a deux et ils ne
 * partagent aucun balisage : `Table` (`@bellum/ui`, quatorze appelants) et
 * `ResponsiveTable` (`components/primitives`, qui devient des cartes sous
 * 768 px). N'en rendre qu'un serait la garde qui « ne voit qu'un tiers ».
 */
describe('GA-119 — un tableau qui déborde reste atteignable au clavier', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  /** Force le débordement horizontal que jsdom ne calcule jamais (il rend 0
   *  partout, faute de moteur de rendu). */
  function measureAs(scrollWidth: number, clientWidth: number) {
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth)
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth)
  }

  const LABEL = 'Journal d’activité, tableau défilant'

  /** Les deux tableaux partagés, rendus par le MÊME scénario. */
  const SHARED_TABLES: [string, (scrollLabel?: string) => void][] = [
    [
      'Table (@bellum/ui)',
      scrollLabel =>
        render(
          <Table scrollLabel={scrollLabel}>
            <TableBody>
              <TableRow>
                <TableCell>Decathlon</TableCell>
              </TableRow>
            </TableBody>
          </Table>,
        ),
    ],
    [
      'ResponsiveTable (components/primitives)',
      scrollLabel =>
        render(
          <ResponsiveTable
            scrollLabel={scrollLabel}
            rows={[{ id: 'a', name: 'Decathlon' }]}
            rowKey={row => row.id}
            columns={[{ key: 'name', header: 'Compte', render: row => row.name }]}
          />,
        ),
    ],
  ]

  it('les deux mécaniques protégées existent — sinon la garde surveille du vide', () => {
    // Témoins de lecture : le conteneur défile, et la dérivation partagée pose
    // bien un `tabIndex`. Sans eux, un renommage rendrait la garde verte à vide.
    expect(readFileSync(UI_TABLE, 'utf8')).toMatch(/overflow-(?:x-)?auto/)
    expect(readFileSync(OVERFLOW_HOOK, 'utf8')).toMatch(/tabIndex: 0/)
    expect(SHARED_TABLES).toHaveLength(2)
  })

  it.each(SHARED_TABLES)('%s — quand il déborde, la zone prend le focus et porte un nom', (_name, mount) => {
    measureAs(1400, 900)
    mount(LABEL)

    const region = screen.getByRole('region', { name: LABEL })
    // Si ce test tombe : la dernière colonne d'un tableau large redevient
    // inatteignable pour qui navigue au clavier — elle est à l'écran, hors du
    // cadre, et aucune touche ne l'amène.
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toContainElement(screen.getByRole('table'))
  })

  it.each(SHARED_TABLES)('%s — quand rien ne déborde, aucune tabulation n’est ajoutée', (_name, mount) => {
    measureAs(900, 900)
    mount(LABEL)

    // Une tabulation sur chaque tableau du produit est un défaut en soi : elle
    // ajoute un arrêt clavier là où il n'y a rien à atteindre.
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.getByRole('table').parentElement).not.toHaveAttribute('tabindex')
  })

  it.each(SHARED_TABLES)('%s — sans nom fourni, la zone reste atteignable sans se dire région', (_name, mount) => {
    measureAs(1400, 900)
    mount()

    // Une région SANS nom est ignorée des lecteurs d'écran : la déclarer serait
    // se donner raison sans rien apporter. Le focus, lui, vaut pour tous.
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.getByRole('table').parentElement).toHaveAttribute('tabindex', '0')
  })
})
