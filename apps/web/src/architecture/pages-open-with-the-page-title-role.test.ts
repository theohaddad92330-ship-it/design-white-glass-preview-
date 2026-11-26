/**
 * F2-FIX #4332 — UN SEUL RÔLE TYPOGRAPHIQUE POUR LE TITRE D'UNE PAGE D'OUVERTURE.
 *
 * Recette prod du 20/10/2026 (commit servi c286ea4889), le `h1` mesuré : 30 px sur `/briefing`
 * (`size="3xl"`), 24 px sur `/accounts`, `/projects`, `/consultants` (`ScreenIntro`, `size="2xl"`),
 * 20 px sur `/dashboard` (`TYPE_SCALE.pageTitle`). `TYPE_SCALE` (packages/ui, #4332.1) nomme le rôle ;
 * la première garde (`lot-screens-use-the-type-scale`) ne tient que les écrans de la refonte du 19/10.
 * Celle-ci tient TOUTES les pages d'ouverture : leur `h1` vient du rôle `pageTitle`, soit en le citant,
 * soit par `ScreenIntro` — qui le cite lui-même, UNE fois (GA-26).
 *
 * CE QU'ELLE REFUSE : une page d'ouverture dont le titre porte une taille écrite à la main, ou qui
 * ne tire pas son `h1` du rôle. CE QU'ELLE NE VISE PAS : les pages de réglages et les écrans de détail
 * (leur passage est un autre lot) ; `ManagerDashboardPage` (/team, refondu par Louis).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB_SRC = fileURLToPath(new URL('../', import.meta.url))

/** Les pages d'ouverture : ce qu'on voit en arrivant sur une entrée de la barre latérale. */
const PAGES_OUVERTURE = [
  'features/briefing/view/BriefingHero.tsx',
  'features/dashboard/components/personal/PersonalCockpitHeader.tsx',
  // Refonte Théo (23/10) — `AccountsPage.tsx` n'écrit plus son h1 : il DÉCLARE `pageTitle` / `pageSubtitle` à
  // `CustomerPage`, dont l'en-tête commun (`PageHeader`, coque Théo) rend le titre (COQUE.md §2).
  'features/projects/view/ProjectsPage.tsx',
  'features/consultants/view/VivierIntro.tsx',
  'features/contacts/view/contacts-list/ContactsIntro.tsx',
  'features/missions/view/MissionsPage.tsx',
  'features/missions/view/PlanningPage.tsx',
  'features/pilotage/view/PilotagePage.tsx',
  'features/mailbox/view/MailboxPage.tsx',
  // Refonte Théo (23/10, Découvrir / Signaux) — l'ouverture de Découvrir est `DiscoverOverview` ; Mes cibles
  // ouvre sur la bibliothèque de signaux (`SignalsLibrary`) ou sur Mes veilles (`WatchesPage`).
  'features/discover/view/DiscoverOverview.tsx',
  'features/watchlist/view/SignalsLibrary.tsx',
  'features/watchlist/view/WatchesPage.tsx',
  'features/discover/view/DiscoverHistory.tsx',
  'features/projects/open-needs/view/OpenNeedsPage.tsx',
  'components/primitives/ScreenIntro.tsx',
]

function sansCommentaires(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

/** La page DÉCLARE-t-elle son titre à la coque (Théo, COQUE.md §2) ? `pageTitle` sur `CustomerPage`, sans `titleInScreen`. */
function titreDeclareALaCoque(code: string): boolean {
  const ouverture = /<CustomerPage\b[\s\S]*?>/.exec(code)?.[0] ?? ''
  return /\bpageTitle=/.test(ouverture) && !/\btitleInScreen\b/.test(ouverture)
}

/** Le `h1` de cette source vient-il du rôle ? Le citer, passer par `ScreenIntro`, ou le déclarer à la coque — jamais un `h1` à la main. */
function titreVientDuRole(source: string): boolean {
  const code = sansCommentaires(source)
  const h1AMain =
    /<Text\b[^>]*element="h1"[^>]*\bsize="/.test(code) || /<h1\b[^>]*text-(?:base|lg|xl|[2-9]xl)\b/.test(code)
  if (h1AMain) return false
  return code.includes('TYPE_SCALE.pageTitle') || code.includes('<ScreenIntro') || titreDeclareALaCoque(code)
}

describe('F2-FIX #4332 — toutes les pages d’ouverture titrent avec le rôle pageTitle', () => {
  it('chaque page d’ouverture tire son h1 du rôle', () => {
    const fautives = PAGES_OUVERTURE.filter(chemin => !titreVientDuRole(readFileSync(join(WEB_SRC, chemin), 'utf8')))
    expect(fautives).toEqual([])
  })

  it('ScreenIntro, qui porte le h1 de neuf pages, cite le rôle lui-même', () => {
    const source = readFileSync(join(WEB_SRC, 'components/primitives/ScreenIntro.tsx'), 'utf8')
    expect(sansCommentaires(source)).toContain('TYPE_SCALE.pageTitle')
  })

  it('dit NON à un h1 à taille écrite à la main, et OUI au rôle', () => {
    expect(titreVientDuRole('<Text element="h1" size="3xl" weight="semibold">x</Text>')).toBe(false)
    expect(titreVientDuRole('<h1 className="text-2xl font-bold">x</h1>')).toBe(false)
    expect(titreVientDuRole('<Text element="h1" size="xl">x</Text>')).toBe(false)
    expect(titreVientDuRole('<Text element="h1" className={TYPE_SCALE.pageTitle}>x</Text>')).toBe(true)
    expect(titreVientDuRole('<ScreenIntro title="a" titleWithoutName="b" />')).toBe(true)
    expect(titreVientDuRole('// size="3xl"\n<ScreenIntro title="a" titleWithoutName="b" />')).toBe(true)
    expect(titreVientDuRole('<p>aucun titre</p>')).toBe(false)
    expect(titreVientDuRole('<CustomerPage anchorId="x" pageTitle={t("a")}>x</CustomerPage>')).toBe(true)
    expect(titreVientDuRole('<CustomerPage titleInScreen pageTitle={t("a")}>x</CustomerPage>')).toBe(false)
    expect(titreVientDuRole('<CustomerPage pageTitle="a"><h1 className="text-2xl">x</h1></CustomerPage>')).toBe(false)
  })
})

/**
 * F2-FIX #4332 — la rangée de chiffres clés de Comptes, Pipe et Vivier est UN composant (`KeyFigureRow`).
 * Recette du 20/10 : aucun chiffre sur Comptes, quatre cartes sur Pipe, cinq pastilles sur Vivier.
 */
// #4499 (Louis 23/10/2026) — les quatre cartes du Pipe sont remplacées par une synthèse courte (`PipelineSummaryLine`,
// maquette V22 `.bo11-summary`). Arbitrage Louis 24/10 : elle revient dans `KeyFigureRow` — la garde la lit de nouveau.
const RANGEES_DE_CHIFFRES = [
  'features/accounts/view/AccountsKeyFigures.tsx',
  'features/projects/view/PipelineSummaryLine.tsx',
  'features/consultants/view/TalentStatsBanner.tsx',
]

function utiliseLaRangeePartagee(source: string): boolean {
  const code = sansCommentaires(source)
  return /<KeyFigureRow\b/.test(code) && !/function (?:KpiCard|StatPastille)\b/.test(code)
}

describe('F2-FIX #4332 — une seule rangée de chiffres clés', () => {
  it('Comptes, Pipe et Vivier rendent leurs chiffres par KeyFigureRow', () => {
    const fautives = RANGEES_DE_CHIFFRES.filter(
      chemin => !utiliseLaRangeePartagee(readFileSync(join(WEB_SRC, chemin), 'utf8')),
    )
    expect(fautives).toEqual([])
  })

  it('Comptes monte sa rangée', () => {
    expect(readFileSync(join(WEB_SRC, 'features/accounts/view/AccountsPage.tsx'), 'utf8')).toContain(
      '<AccountsKeyFigures',
    )
  })

  it('dit NON à une carte écrite à la main', () => {
    expect(utiliseLaRangeePartagee('function KpiCard() { return null }\n<KeyFigureRow figures={[]} />')).toBe(false)
    expect(utiliseLaRangeePartagee('<div className="grid">x</div>')).toBe(false)
    expect(utiliseLaRangeePartagee('<KeyFigureRow figures={[]} />')).toBe(true)
  })
})
