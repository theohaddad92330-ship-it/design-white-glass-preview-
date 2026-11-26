import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #3822.D (vu en passant, recette prod 08/10, W 5b4b10d2f3) — LA PASTILLE DE
 * LAURA CHEVAUCHE LES LISTES DE /contacts ET /accounts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE DÉJÀ ÉCRITE, DÉJÀ CONTOURNÉE UNE FOIS
 * ─────────────────────────────────────────────────────────────────────────
 * #3480 (recette prod 01/10, RÉFUTÉ) l'a déjà dit une fois, pour `/actions` :
 * `CustomerPageContent` réserve la place de la bulle de Laura en PADDING BAS
 * du conteneur qui défile RÉELLEMENT (`md:pb-20`, gated par
 * `lauraDockClearance`), et agrandit l'enveloppe du contenu avec lui
 * (`md:min-h-fit`) — mais seulement si cette enveloppe peut CROÎTRE. Un écran
 * qui lui pose `h-full` la FIGE à la hauteur VISIBLE du viewport : le contenu
 * déborde d'elle sans jamais pousser le padding réservé après lui, et la
 * bulle (fixe, bas droite dès 768 px) recouvre alors la dernière ligne
 * réelle. `CustomerPageContent.scroll-restore.test.ts` / `.mobile.test.ts`
 * (#3480) vérifient déjà que `/actions` porte `min-h-full`, pas `h-full` —
 * mais seulement CE fichier-là. `/accounts` (`AccountsPage.tsx`) portait
 * EXACTEMENT le même défaut, mot pour mot (`flex h-full flex-col px-0 py-0`),
 * jamais vérifié : c'est la carte « chevauche /contacts, /accounts » de ce
 * lot. Cette garde généralise le contrôle à TOUT écran du dépôt, pour que la
 * prochaine page qui écrit `h-full` au lieu de `min-h-full` soit attrapée
 * avant la recette plutôt qu'après.
 *
 * ⚠️ Un écran qui gère son propre défilement (`skipHeader`, comme `/search`
 * ou `/chat`) a le droit de fixer `h-full` — il n'a pas de conteneur
 * `CustomerPageContent` qui défile à sa place. La garde ne le refuse pas.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules' || entree === 'dist') continue
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin))
    else if (/\.tsx$/.test(entree) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Chaque balise `<CustomerPage …>` ouvrante, jusqu'à son `>` de fermeture. */
const BALISE_CUSTOMER_PAGE = /<CustomerPage\b[\s\S]*?>/g

function geleSonEnveloppe(balise: string): boolean {
  const contentClassName = balise.match(/contentClassName="([^"]*)"/)?.[1] ?? ''
  const porteHFull = contentClassName.split(/\s+/).includes('h-full')
  if (!porteHFull) return false
  // Un écran qui gère son propre défilement a le droit — `/search`, `/chat`.
  return !/\bskipHeader\b/.test(balise)
}

describe('#3822.D — un écran ne fige pas l’enveloppe que la bulle de Laura doit pouvoir pousser', () => {
  const sources = [
    ...fichiersSous(join(racineWeb, 'src', 'routes')),
    ...fichiersSous(join(racineWeb, 'src', 'features')),
  ]

  it('a un corpus à lire', () => {
    expect(sources.length).toBeGreaterThan(200)
  })

  it('sait dire NON, et NE dit PAS non à ce qu’elle ne vise pas', () => {
    expect(geleSonEnveloppe('<CustomerPage titleInScreen contentClassName="flex h-full flex-col px-0 py-0">')).toBe(
      true,
    )
    // `min-h-full` : légitime, c'est précisément le correctif attendu.
    expect(geleSonEnveloppe('<CustomerPage titleInScreen contentClassName="flex min-h-full flex-col px-0 py-0">')).toBe(
      false,
    )
    // `skipHeader` : l'écran gère son propre défilement, `h-full` est son droit.
    expect(geleSonEnveloppe('<CustomerPage contentClassName="px-0 py-0 h-full" skipHeader>')).toBe(false)
    // Pas de `h-full` du tout : rien à dire.
    expect(geleSonEnveloppe('<CustomerPage contentClassName="px-0 py-4">')).toBe(false)
  })

  it('aucun écran (hors self-scroll) ne pose `h-full` sur l’enveloppe de CustomerPage', () => {
    const fautifs: string[] = []
    for (const fichier of sources) {
      const source = sansCommentaires(readFileSync(fichier, 'utf8'))
      const balises = source.match(BALISE_CUSTOMER_PAGE) ?? []
      if (balises.some(geleSonEnveloppe)) fautifs.push(fichier.slice(racineWeb.length + 1))
    }
    expect(
      fautifs,
      'un écran fige h-full au lieu de min-h-full — la bulle de Laura recouvrira sa dernière ligne',
    ).toEqual([])
  })
})
