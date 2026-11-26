import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-381 — #2117.64 : DESKTOP, PAS DE COLONNE DROITE PERMANENTE PAR SECTION.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ LE 22/09/2026, ET POURQUOI CETTE GARDE EST NÉE ROUGE
 * ─────────────────────────────────────────────────────────────────────────
 * Le registre (#2117.64) documentait UNE colonne latérale permanente sur la
 * Synthèse (`SideBarOverview`, `TabOverview.tsx`) comme « conforme à l'esprit
 * — une seule, pas dupliquée par carte ». `git grep "<aside" tabs/` montre
 * une réalité plus large : TROIS AUTRES sections en portent chacune une,
 * elles aussi jamais démontées :
 *   - `TabPlan.tsx:157`               — `xl:w-80 xl:shrink-0`
 *   - `TabEvaluation.tsx:40`          — `xl:w-80 xl:shrink-0`
 *   - `organigramme/OrganigrammeSidebar.tsx:24` (appelée par `TabOrganigramme.tsx`)
 *
 * Quatre sections sur les sept ont donc CHACUNE sa colonne droite permanente
 * — exactement la « colonne droite permanente PAR SECTION » que #2117.64
 * interdit. Ce lot est un lot de GARDES, PAS DE PIXELS (#2117, brief du
 * 22/09/2026) : redistribuer ces quatre colonnes dans le flux principal est
 * une refonte de mise en page à part, pas un correctif borné. Cette garde ne
 * les défait donc pas — elle les NOMME, les DATE, et surtout **interdit
 * qu'une CINQUIÈME apparaisse sans qu'on en discute** : la dette est gelée,
 * elle ne grossit plus en silence.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SONDE VOIT, ET CE QU'ELLE NE VOIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * jsdom ne calcule aucune géométrie : elle ne dit ni qu'une colonne recouvre
 * le contenu, ni qu'elle occupe réellement l'écran à une largeur donnée. Elle
 * lit le SOURCE de `features/accounts/view/account-detail/tabs` (les sept
 * sections et leurs sous-dossiers) et cherche un `<aside` dont la classe
 * porte à la fois une largeur `xl:` (ou `lg:`) fixe ET `shrink-0` — la
 * signature textuelle d'une colonne qui ne rétrécit ni ne disparaît. Un
 * panneau qui s'ouvre en `Sheet`/`Dialog` (transitoire, sur geste) n'a pas
 * cette forme et n'est pas visé.
 */

const RACINE_TABS = join(__dirname, '..', 'features', 'accounts', 'view', 'account-detail', 'tabs')

/**
 * Dette nommée, datée, avec sa raison — pas une exemption aveugle : une
 * section retirée d'ici redevient interdite, une section AJOUTÉE ici doit
 * porter sa propre raison. Chemins relatifs à `RACINE_TABS`.
 */
const COLONNES_DROITES_DEJA_LA = new Map<string, string>([
  // #3499 (01/10/2026) — `SideBarOverview` (TabOverview.tsx) RETIRÉE : la
  // Synthèse est une colonne unique de sections repliées. Dette remboursée,
  // donc la Synthèse redevient soumise à la règle comme toute autre section.
  ['TabPlan.tsx', 'antérieure à #2117 — PlanAttackSummary/QuestionLibraryCard/AccountDeliverables'],
  ['TabEvaluation.tsx', 'antérieure à #2117 — SignalListCard quick wins/risques'],
  [
    'organigramme/OrganigrammeSidebar.tsx',
    'antérieure à #2117 — RoleLegendCard/RecommendedPathCard, appelée par TabOrganigramme.tsx',
  ],
])

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin))
    else if (/\.tsx$/.test(entree) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

const corpus = fichiersSous(RACINE_TABS).map(chemin => ({
  chemin: relative(RACINE_TABS, chemin),
  code: readFileSync(chemin, 'utf8'),
}))

/** Une colonne droite permanente : un `<aside` dont la classe fixe une largeur `xl:`/`lg:` ET ne rétrécit pas. */
function colonnesDroites(code: string): string[] {
  const tags = code.match(/<aside\b[^>]*>/g) ?? []
  return tags.filter(tag => /\b(?:xl|lg):w-\d+\b/.test(tag) && /\bshrink-0\b/.test(tag))
}

describe('#2117.64 — une section du dossier n’ajoute pas sa propre colonne droite (GA-381)', () => {
  it('LIT quelque chose : le corpus des sections n’est pas vide', () => {
    expect(corpus.length).toBeGreaterThan(10)
    expect(corpus.some(f => f.chemin === 'TabOverview.tsx')).toBe(true)
  })

  it('sait dire NON — et n’attrape pas un panneau qui n’est pas une colonne permanente', () => {
    const mauvais = '<aside className="flex w-full flex-col gap-4 xl:w-80 xl:shrink-0">'
    const bons = [
      '<aside className="flex w-full flex-col gap-4">', // pas de largeur fixe : rétrécit avec le contenu
      '<aside className="flex w-full flex-col gap-4 xl:w-80">', // pas de shrink-0 : peut céder de la place
      '<div className="xl:w-80 xl:shrink-0">', // pas un <aside> : un bloc de mise en page ordinaire
    ].join(' ')
    expect(colonnesDroites(mauvais).length).toBeGreaterThan(0)
    expect(colonnesDroites(bons)).toEqual([])
  })

  it('aucune section HORS de la dette nommée n’ajoute sa colonne droite', () => {
    const fautifsHorsListe = corpus
      .filter(({ chemin }) => !COLONNES_DROITES_DEJA_LA.has(chemin))
      .flatMap(({ chemin, code }) => colonnesDroites(code).map(tag => `${chemin} : ${tag}`))
    expect(fautifsHorsListe).toEqual([])
  })

  it('chaque section de la dette nommée n’en porte qu’UNE — pas dupliquée par carte', () => {
    const dupliquees = corpus
      .filter(({ chemin }) => COLONNES_DROITES_DEJA_LA.has(chemin))
      .filter(({ code }) => colonnesDroites(code).length > 1)
      .map(({ chemin }) => chemin)
    expect(dupliquees).toEqual([])
  })

  it('la dette nommée existe encore et n’est pas un vœu pieux — chacune se relit dans son fichier', () => {
    const disparues = [...COLONNES_DROITES_DEJA_LA.keys()].filter(chemin => {
      const fichier = corpus.find(f => f.chemin === chemin)
      return !fichier || colonnesDroites(fichier.code).length === 0
    })
    expect(disparues).toEqual([])
  })
})
