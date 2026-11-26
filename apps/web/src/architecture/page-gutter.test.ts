/**
 * GA-284 — une seule gouttière de PAGE, celle de `page-gutter.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE (#1846)
 * ─────────────────────────────────────────────────────────────────────────
 * « harmonise tous les paddings entre toutes les pages qu'on retrouve
 * partout ». Le réglage existait déjà et il était bon
 * (`CustomerPageContent.tsx`, `CONTENT_PADDING = 'px-4 py-4 md:px-6 md:py-6'`)
 * — le défaut n'était pas la VALEUR, c'était sa RÉPÉTITION À LA MAIN. Mesuré
 * le 10/09/2026 : au moins 54 occurrences hors de ce fichier, dans ~35
 * fichiers, chaque écran qui neutralise `contentClassName` (`px-0 …`) pour
 * reposer sa gouttière section par section (barre d'outils, filtres,
 * onglets…) retapant `'px-4 md:px-6'` (ou son équivalent en marge,
 * `'mx-4 md:mx-6'`) plutôt que d'importer la valeur. Deux conséquences
 * concrètes trouvées dans le dépôt : `ContactDetail.tsx` retapait `px-4` SANS
 * le palier `md:px-6` (16 px de marge sur desktop au lieu de 24, quand
 * `AccountDetail.tsx` — même largeur — en portait 24), et `AccountDetail.tsx`
 * portait une DOUBLE gouttière à trois paliers (`px-4 py-8 sm:px-8 sm:py-10
 * lg:px-16 lg:py-16`) par-dessus celle, déjà posée, de `CustomerPage`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EXIGE
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun fichier du corpus ci-dessous ne recopie la paire RESPONSIVE de la
 * gouttière de page (`px-4` … `md:px-6`, horizontale, ou `mx-4` … `md:mx-6`,
 * sa variante en marge) en dur dans un `className` — il importe
 * `PAGE_GUTTER_X` / `PAGE_GUTTER_MX` / `CONTENT_PADDING` depuis
 * `@/components/page/page-gutter` à la place.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE VISE PAS (témoins de cas légitimes voisins)
 * ─────────────────────────────────────────────────────────────────────────
 *  - une gouttière de CARTE (`p-4` sur un `<Card>`, ou même `px-4 md:px-6`
 *    quand c'est le PADDING INTERNE d'une carte plutôt que sa position dans
 *    la page — ex. `OpportunityBanner.tsx`, `BillingUnavailable.tsx`,
 *    `Knowledge.tsx` (zone de dépôt) : leur échelle est la leur, coïncider
 *    avec celle de la page ne les rend pas responsables de la garder) ;
 *  - la coque PRÉ-CONNEXION (auth, onboarding, `/welcome`) : un shell
 *    différent, sans `CustomerPage`, hors périmètre de ce lot ;
 *  - `apps/web/src/features/accounts/view/account-detail/**` : chantier
 *    PARALLÈLE (un autre agent y écrit pendant le lot #1846) — hors scope
 *    d'ÉCRITURE ici, donc hors CORPUS de cette garde tant qu'il n'est pas
 *    repassé. Les violations observées le 10/09/2026 y sont NOTÉES dans le
 *    rapport du lot, pas corrigées : `WatchSignalTimeline.tsx`,
 *    `WatchSourcesPanel.tsx`, `AccountProvenancePanel.tsx`,
 *    `WhyNowItemList.tsx`, `ImportContactsDialog.tsx`, `BattleCardModal.tsx`,
 *    `AccountPdfPreviewSheet.tsx`.
 *
 * Un écran neuf de la coque `CustomerPage` qui repose sa gouttière section
 * par section s'AJOUTE à `PAGE_GUTTER_SCREENS` ci-dessous : la garde n'a de
 * sens que sur un corpus qui grandit avec le produit (cliquet), jamais sur un
 * scan aveugle du dépôt entier — un scan aveugle attraperait aussi bien la
 * coque pré-connexion que les cartes qui partagent la même échelle par
 * coïncidence.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cn } from '@bellum/ui'
import { describe, expect, it } from 'vitest'
import {
  CONTENT_PADDING,
  PAGE_GUTTER_MX,
  PAGE_GUTTER_X,
  PAGE_GUTTER_Y,
  pageContentClassName,
} from '../components/page/page-gutter'

const WEB_SRC = join(__dirname, '..')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function readSource(relativePath: string): string {
  return stripComments(readFileSync(join(WEB_SRC, relativePath), 'utf8'))
}

// Le défaut EXACT que cette garde interdit : la paire RESPONSIVE de la
// gouttière (`px-4` … `md:px-6`, ou son équivalent en marge) recopiée en dur
// dans UN SEUL className — une fenêtre de 40 caractères, bornée par un
// guillemet, un backtick ou un retour à la ligne : assez large pour couvrir
// « items-center gap-1 px-4 md:px-6 pt-2 » (le cas mesuré le plus long),
// assez étroite pour ne jamais franchir deux attributs `className` distincts.
// Ni `px-4` ni `md:px-6` ne portent le drapeau `g` : `.test()` reste sans état
// (le piège documenté du dépôt : `RegExp.test()` avec `g` est STATEFUL).
const HARDCODED_PADDING_GUTTER = /(?:px-4[^\n'"`]{0,40}md:px-6|md:px-6[^\n'"`]{0,40}px-4)/
const HARDCODED_MARGIN_GUTTER = /(?:mx-4[^\n'"`]{0,40}md:mx-6|md:mx-6[^\n'"`]{0,40}mx-4)/

function hasHardcodedPageGutter(source: string): boolean {
  return HARDCODED_PADDING_GUTTER.test(source) || HARDCODED_MARGIN_GUTTER.test(source)
}

/**
 * Les écrans de la coque `CustomerPage` qui reposent leur gouttière section
 * par section (chemin relatif à `apps/web/src/`), rendus propres par #1846.
 * `page-gutter.ts` lui-même EST le seul endroit autorisé à écrire les deux
 * classes côte à côte — il est donc hors corpus, pas une exception dans le
 * corpus.
 */
const PAGE_GUTTER_SCREENS = [
  'components/page/CustomerPage.tsx',
  'components/page/SettingsPage.tsx',
  'components/layout/PageHeader.tsx',
  'features/accounts/view/AccountsPage.tsx',
  'features/accounts/view/AccountContent.tsx',
  'features/accounts/view/AccountDetail.tsx',
  // `OpportunityBanner.tsx` N'EST PAS dans ce corpus, volontairement : sa
  // MARGE de positionnement importe déjà `PAGE_GUTTER_MX` (couvert par le
  // témoin ci-dessous), mais son PADDING INTERNE de carte (`px-4 md:px-6
  // py-3`) coïncide avec la même échelle sans être une gouttière de page —
  // exactement le cas que cette garde ne doit PAS attraper (§ témoins
  // ci-dessus). Un scan aveugle du fichier entier le confondrait avec le
  // défaut ; le témoin `OpportunityBanner` de la section « sait dire NON »
  // vérifie directement les deux faits qui comptent à sa place.
  'features/accounts/view/accounts-list/AccountsBillingCardList.tsx',
  'features/accounts/view/accounts-list/AccountsTable.tsx',
  'features/contacts/view/ContactContent.tsx',
  'features/contacts/view/ContactsPage.tsx',
  'features/contacts/view/contacts-list/ContactsToolbar.tsx',
  'features/contacts/view/contacts-list/ContactsTableSkeleton.tsx',
  'features/contacts/view/contacts-list/ContactsTable.tsx',
  'features/contacts/view/contact-detail/ContactDetailPage.tsx',
  'features/contacts/view/contact-detail/ContactDetail.tsx',
  'features/action-history/view/ActionHistoryPage.tsx',
  'features/action-history/view/ActionHistoryDetailPage.tsx',
  'features/action-history/view/ActionHistoryToolbar.tsx',
  'features/action-history/view/ActionHistoryTable.tsx',
  'features/action-history/view/TraceabilityPanel.tsx',
  'features/projects/view/ProjectsPage.tsx',
  'features/projects/open-needs/view/OpenNeedsPage.tsx',
  // #2151.60 — `WatchlistPage` a disparu : le plateau qui repose sa gouttière
  // section par section vit dans `WatchlistBoard`, monté par « Mes cibles »,
  // qui répartit à son tour la gouttière bloc par bloc.
  'features/watchlist/view/WatchlistBoard.tsx',
  'features/signals-library/view/SignalsLibraryPage.tsx',
  'features/signals-library/view/SignalsByAccount.tsx',
  'features/watchlist/view/WatchlistTable.tsx',
  'features/watchlist/view/WatchlistFacets.tsx',
  'features/missions/view/CreateMissionPage.tsx',
] as const

describe('GA-284 — la garde lit bien quelque chose', () => {
  it('le corpus des écrans de la coque CustomerPage existe, et n’est pas vide', () => {
    expect(PAGE_GUTTER_SCREENS.length).toBeGreaterThan(0)
    for (const relativePath of PAGE_GUTTER_SCREENS) {
      expect(() => readSource(relativePath), `introuvable sur le disque : ${relativePath}`).not.toThrow()
    }
  })

  it('page-gutter.ts définit bien la gouttière — la valeur reste celle citée par #1846', () => {
    expect(PAGE_GUTTER_X).toBe('px-4 md:px-6')
    expect(PAGE_GUTTER_Y).toBe('py-4 md:py-6')
    expect(PAGE_GUTTER_MX).toBe('mx-4 md:mx-6')
    // Même JEU de classes que la valeur d'avant #1846 (`'px-4 py-4 md:px-6 md:py-6'`)
    // — l'ORDRE de la chaîne diffère (composée depuis PAGE_GUTTER_X/Y), pas
    // l'ensemble des classes Tailwind qu'elle porte, et donc pas le rendu.
    for (const token of ['px-4', 'md:px-6', 'py-4', 'md:py-6']) {
      expect(CONTENT_PADDING.split(' ')).toContain(token)
    }
  })
})

describe('GA-284 — la garde sait dire NON', () => {
  it('repère la forme EXACTE du défaut : la paire responsive recopiée en dur', () => {
    const faulty = `<Box display="flex" className="items-center gap-1 px-4 md:px-6 pt-2">`
    expect(hasHardcodedPageGutter(faulty)).toBe(true)
  })

  it('repère la variante MARGE, dans les deux ordres', () => {
    expect(hasHardcodedPageGutter('<Box className="mx-4 flex flex-col gap-2 md:mx-6">')).toBe(true)
    expect(hasHardcodedPageGutter('<div className="md:mx-6 space-y-1 mx-4">')).toBe(true)
  })

  it('repère l’ordre inverse (md:px-6 avant px-4)', () => {
    expect(hasHardcodedPageGutter('<Text className="md:px-6 text-xs px-4">')).toBe(true)
  })

  it('un exemple fautif CITÉ dans un commentaire n’est pas du code rendu', () => {
    const commented = '// #1846 — avant : className="items-center gap-1 px-4 md:px-6 pt-2"'
    expect(hasHardcodedPageGutter(stripComments(commented))).toBe(false)
  })

  it('ne franchit pas deux className distincts (fenêtre bornée par les guillemets)', () => {
    const distinctAttributes = `<Box className="px-4"><Inner className="md:px-6" /></Box>`
    expect(hasHardcodedPageGutter(distinctAttributes)).toBe(false)
  })

  it('laisse passer la forme corrigée : le token importé, jamais la classe littérale', () => {
    const fixed = `<Box display="flex" className={\`items-center gap-1 pt-2 \${PAGE_GUTTER_X}\`}>`
    expect(hasHardcodedPageGutter(fixed)).toBe(false)
  })

  it('témoin — une gouttière de CARTE (p-4 sur un Card) n’est PAS une gouttière de page', () => {
    const cardPadding = `<Card className="min-w-0 flex-1 p-4">`
    expect(hasHardcodedPageGutter(cardPadding)).toBe(false)
  })

  it('témoin — le padding INTERNE d’une carte peut coïncider avec l’échelle sans être visé (OpportunityBanner)', () => {
    // La marge de POSITIONNEMENT (PAGE_GUTTER_MX) est importée ; le padding
    // interne de la carte, lui, reste écrit en dur — légitime, ce n'est pas
    // une gouttière de PAGE. Le test lit le fichier RÉEL, pas un extrait
    // recopié : si `OpportunityBanner.tsx` se remet un jour à recomposer sa
    // marge en dur, ce test le sait avant la garde « en vrai » ci-dessous.
    const source = readSource('features/accounts/view/OpportunityBanner.tsx')
    expect(source).toContain('PAGE_GUTTER_MX')
    expect(source).toContain('px-4 md:px-6 py-3')
  })
})

describe('GA-284 — en vrai : aucun écran du corpus ne recopie la gouttière en dur', () => {
  it.each(PAGE_GUTTER_SCREENS)('%s', relativePath => {
    const source = readSource(relativePath)
    expect(hasHardcodedPageGutter(source), `${relativePath} recopie la gouttière de page en dur`).toBe(false)
  })
})

/**
 * GA-284 (ter) — UN PADDING POSÉ PAR L'ÉCRAN VAUT À TOUS LES PALIERS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT (mesuré en production le 13/09/2026 sur /chat, #1906.7)
 * ─────────────────────────────────────────────────────────────────────────
 * La coque composait `cn(base, CONTENT_PADDING, contentClassName)`. Un écran
 * qui écrit `px-0` pour reposer sa gouttière section par section voit
 * `tailwind-merge` retirer `px-4`… et GARDER `md:px-6`, qui est d'un autre
 * palier : 24 px de marge au-delà de 768 px, ajoutés à celle que l'écran repose
 * lui-même. La branche de finition l'avait corrigé pour la seule route /chat
 * (`md:p-0` recopié) ; le même mécanisme touchait huit autres écrans — Comptes,
 * Veille, Projets, Besoins ouverts, /actions, /search, Contacts et le détail de
 * l'historique.
 *
 * La correction vit donc dans la PRIMITIVE (`pageContentClassName`) : un axe
 * sur lequel l'écran écrit un padding sans palier ne reçoit plus AUCUN jeton de
 * la gouttière de page, à aucun palier. Cette garde balaie TOUS les appelants
 * qui passent une chaîne littérale, plutôt qu'une liste d'écrans à tenir à jour.
 */
const GUTTER_TOKENS_BY_AXIS = {
  x: PAGE_GUTTER_X.split(' '),
  y: PAGE_GUTTER_Y.split(' '),
} as const

type Axis = keyof typeof GUTTER_TOKENS_BY_AXIS

/** Les axes sur lesquels l'appelant écrit un padding SANS palier (`p-*`, `px-*`, `py-*`). */
function axesSetByCaller(contentClassName: string): Axis[] {
  const base = contentClassName.split(/\s+/).filter(token => token.length > 0 && !token.includes(':'))
  const axes = new Set<Axis>()
  for (const token of base) {
    if (/^p-/.test(token)) {
      axes.add('x')
      axes.add('y')
    }
    if (/^px-/.test(token)) axes.add('x')
    if (/^py-/.test(token)) axes.add('y')
  }
  return [...axes]
}

/** Les jetons de la gouttière de page qui survivent sur un axe que l'appelant a pris en main. */
function leakedGutter(resolved: string, contentClassName: string): string[] {
  const own = new Set(contentClassName.split(/\s+/))
  const tokens = resolved.split(/\s+/)
  return axesSetByCaller(contentClassName).flatMap(axis =>
    GUTTER_TOKENS_BY_AXIS[axis].filter(token => tokens.includes(token) && !own.has(token)),
  )
}

/** Chaque `contentClassName="…"` littéral passé à la coque, dans tout `apps/web/src`. */
function literalContentClassNames(): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx$/.test(entry) || entry.includes('.test.')) continue
      const source = stripComments(readFileSync(full, 'utf8'))
      for (const match of source.matchAll(/contentClassName=(?:"([^"]*)"|\{\s*'([^']*)'\s*\})/g)) {
        out.push({ path: full.split('/src/')[1] ?? full, value: match[1] ?? match[2] ?? '' })
      }
    }
  }
  walk(WEB_SRC)
  return out
}

const CONTENT_BASE = 'mx-auto flex min-h-0 w-full flex-1 flex-col'

/** Les huit écrans de la famille relevée le 13/09/2026, en plus de /chat. */
const MARGIN_FAMILY = [
  'features/accounts/view/AccountsPage.tsx',
  // #2151.60 — la Veille était de la famille (`px-0 py-0`) ; sa page a disparu
  // et son plateau est monté par « Mes cibles », qui écrit `px-0 py-4` : la
  // famille compte toujours huit écrans, et c'est celui qui porte la Veille.
  'features/signals-library/view/SignalsLibraryPage.tsx',
  'features/projects/view/ProjectsPage.tsx',
  'features/projects/open-needs/view/OpenNeedsPage.tsx',
  'routes/actions/index.tsx',
  'routes/search/index.tsx',
  'features/contacts/view/ContactsPage.tsx',
  'features/action-history/view/ActionHistoryDetailPage.tsx',
] as const

describe('GA-284 (ter) — un padding posé par l’écran vaut à tous les paliers', () => {
  const callers = literalContentClassNames()

  it('LIT quelque chose — les appelants existent, et les huit écrans de la famille en sont', () => {
    expect(callers.length).toBeGreaterThanOrEqual(MARGIN_FAMILY.length)
    const paths = callers.map(caller => caller.path)
    for (const screen of MARGIN_FAMILY) expect(paths, screen).toContain(screen)
  })

  it('sait dire NON — la composition d’avant garde `md:px-6` derrière un `px-0`', () => {
    const caller = 'flex h-full flex-col px-0 py-0'
    expect(leakedGutter(cn(CONTENT_BASE, CONTENT_PADDING, caller), caller)).toEqual(['md:px-6', 'md:py-6'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — sans padding écrit, la gouttière reste entière', () => {
    // `pointer-events-auto` commence par « p » sans être un padding ; `md:gap-6` porte un palier sans en être un.
    for (const caller of [undefined, 'flex h-full flex-col', 'pointer-events-auto md:gap-6']) {
      const tokens = pageContentClassName(caller).split(/\s+/)
      for (const token of ['px-4', 'md:px-6', 'py-4', 'md:py-6'])
        expect(tokens, `${caller} — ${token}`).toContain(token)
    }
    // Un axe pris en main laisse l'autre intact.
    expect(pageContentClassName('px-0').split(/\s+/)).toEqual(expect.arrayContaining(['py-4', 'md:py-6']))
  })

  it('la coque passe par la primitive, et ne recompose plus la gouttière à la main', () => {
    const shell = readSource('components/page/CustomerPageContent.tsx')
    expect(shell).toContain('pageContentClassName(contentClassName)')
    expect(shell).not.toMatch(/CONTENT_PADDING,\s*contentClassName/)
  })

  it('en vrai : aucun appelant ne garde la gouttière d’un palier sur un axe qu’il a pris en main', () => {
    const leaks = callers
      .map(caller => ({ ...caller, leaked: leakedGutter(pageContentClassName(caller.value), caller.value) }))
      .filter(caller => caller.leaked.length > 0)
      .map(caller => `${caller.path} « ${caller.value} » garde ${caller.leaked.join(' ')}`)
    expect(leaks).toEqual([])
  })
})

/**
 * GA-284 (quater) — #2484 : une section ENCADRÉE s'aligne par la MARGE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ (16/09/2026, « /contacts — c'est super moche »)
 * ─────────────────────────────────────────────────────────────────────────
 * Le widget désignait `CollapsedSection.tsx:140` — la `<section>` bordée qui
 * replie les filtres de `/contacts`. `ContactContent.tsx` lui passait
 * `className={PAGE_GUTTER_X}` : sur un écran dont la coque est à `px-0`, la
 * gouttière devenait un padding INTERNE de la carte. Résultat : la bordure
 * collée aux deux bords de la colonne de contenu, et le titre de la section à
 * 32 px (40 au-delà de 768) quand l'intro, la barre d'outils et les onglets
 * juste dessous sont à 16 (24). `PAGE_GUTTER_MX` existe précisément pour ce
 * cas (« une Card qui s'aligne seule sur les bords de page »), et personne ne
 * le tenait.
 *
 * La garde lit chaque balise ouvrante `<CollapsedSection …>` — en équilibrant
 * les accolades, pour qu'une flèche `() =>` ne coupe pas la balise (piège
 * déjà payé) — et refuse la gouttière en PADDING. Un conteneur NON encadré
 * (`<FilterBar className={PAGE_GUTTER_X}>`, un `<div>`) reste libre : son
 * padding ne déplace aucune bordure.
 */
function openingTags(source: string, component: string): string[] {
  const tags: string[] = []
  for (const match of source.matchAll(new RegExp(`<${component}\\b`, 'g'))) {
    let depth = 0
    let quote: string | null = null
    for (let i = (match.index ?? 0) + match[0].length; i < source.length; i += 1) {
      const char = source[i] as string
      if (quote) {
        if (char === quote) quote = null
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char
      } else if (char === '{') {
        depth += 1
      } else if (char === '}') {
        depth -= 1
      } else if (char === '>' && depth === 0) {
        tags.push(source.slice(match.index, i + 1))
        break
      }
    }
  }
  return tags
}

const FRAMED_SECTION = 'CollapsedSection'
const framesWithPaddingGutter = (source: string): string[] =>
  openingTags(stripComments(source), FRAMED_SECTION).filter(tag => /\bPAGE_GUTTER_X\b/.test(tag))

function framedSectionTags(): { path: string; tag: string }[] {
  const out: { path: string; tag: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx$/.test(entry) || entry.includes('.test.')) continue
      for (const tag of openingTags(stripComments(readFileSync(full, 'utf8')), FRAMED_SECTION)) {
        out.push({ path: full.split('/src/')[1] ?? full, tag })
      }
    }
  }
  walk(WEB_SRC)
  return out
}

describe('GA-284 (quater) — #2484 : une section encadrée prend la gouttière en marge', () => {
  const tags = framedSectionTags()

  it('LIT quelque chose — les appelants de la section repliable existent', () => {
    // 24 balises au 16/09/2026 (Contacts, Comptes, Découvrir, Pilotage…).
    expect(tags.length).toBeGreaterThanOrEqual(20)
  })

  it('sait dire NON — la gouttière en padding sur la carte, flèche comprise', () => {
    const fautif = `<CollapsedSection title={t('x')} onOpenChange={() => setOpen(o => !o)} className={PAGE_GUTTER_X}>`
    expect(framesWithPaddingGutter(fautif)).toHaveLength(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas — la marge, un conteneur non encadré, un commentaire', () => {
    expect(framesWithPaddingGutter(`<CollapsedSection title="x" className={PAGE_GUTTER_MX}>`)).toEqual([])
    expect(framesWithPaddingGutter(`<FilterBar className={PAGE_GUTTER_X} />`)).toEqual([])
    expect(framesWithPaddingGutter(`<div className={PAGE_GUTTER_X}><CollapsedSection title="x">`)).toEqual([])
    expect(framesWithPaddingGutter(`// <CollapsedSection className={PAGE_GUTTER_X}>`)).toEqual([])
    expect(PAGE_GUTTER_MX).toBe('mx-4 md:mx-6')
  })

  it('en vrai : aucune section encadrée ne reçoit la gouttière en padding', () => {
    const offenders = tags.filter(({ tag }) => /\bPAGE_GUTTER_X\b/.test(tag)).map(({ path }) => path)
    expect(offenders).toEqual([])
  })
})
