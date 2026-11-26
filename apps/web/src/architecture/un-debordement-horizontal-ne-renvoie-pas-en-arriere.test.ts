import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2588 — « on tombe sur `/chat` en scrollant » : un tableau large qui déborde
 * horizontalement chaîne son geste jusqu'au retour arrière NATIF du
 * navigateur. `overscroll-behavior-x` vaut `auto` par défaut sur `html`/`body`
 * — rien, dans le CSS de base, n'arrête la propagation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE, ET CE QU'ELLE NE PROUVE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * L'enquête a éliminé toute navigation programmatique (`navigate(`, les
 * gestionnaires `onWheel`/`onScroll`/`onFocus`, `history.back()`…) et une
 * mesure en production (molette instrumentée sur `/missions` et
 * `/consultants`) n'a vu ni navigation ni entrée d'historique. La seule piste
 * qui reste est un DÉBORDEMENT horizontal non contenu — mais rien ici ne
 * REJOUE un balayage physique à deux doigts. Cette garde prouve donc une
 * chose plus étroite et plus durable : que tout conteneur qui déborde
 * RÉELLEMENT déclare un comportement de débordement horizontal, pas que ce
 * défaut précis en est la cause.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « DÉBORDE RÉELLEMENT » CONTRE « AU CAS OÙ », SANS NOM DE FICHIER EN DUR
 * ─────────────────────────────────────────────────────────────────────────
 * Douze `overflow-x-auto`/`overflow-x-scroll` existent dans le dépôt pour une
 * barre d'onglets, une bande de cartes ou un kanban — un débordement
 * DÉCORATIF, dont le geste natif de retour arrière reste légitime. Les
 * traiter pareil que les tableaux larges serait « au jugé ».
 *
 * La distinction ne lit donc pas des CHEMINS : elle lit la FORME du
 * conteneur, sur la ligne qui porte `overflow-x-*` et les trois qui suivent —
 * assez pour atteindre le contenu direct, jamais assez pour traverser un
 * composant partagé imbriqué plus loin dans le fichier.
 *
 *   - `min-w-[…]` : un plancher de largeur EXPLICITE — le contenu REFUSE de
 *     rétrécir, donc il déborde dès que le conteneur est plus étroit. C'est
 *     la marque exacte d'un tableau large (`OpenNeedsTable`, 27/08/2026 :
 *     « sans largeur minimale, le tableau se COMPRIME au lieu de défiler »).
 *     `min-w-0` (sans crochets) ne compte PAS : c'est l'inverse, un reset
 *     flexbox qui AUTORISE le rétrécissement.
 *   - `<table` en minuscule : une balise HTML brute. Le composant PARTAGÉ
 *     `<Table>` (majuscule, `@bellum/ui`) est vérifié séparément ci-dessous —
 *     une balise `<table` brute est un tableau qui n'est PAS passé par ce
 *     composant, et qui doit donc porter sa propre déclaration.
 *   - `role="grid"` : la même donnée tabulaire, en `<div>` plutôt qu'en
 *     `<table>` (`TabCoverage.tsx`, la matrice de couverture).
 */

const racineWeb = join(__dirname, '..')
const racineUi = join(__dirname, '../../../../packages/ui/src')

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules' || entree === 'dist') continue
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin))
    else if (/\.tsx?$/.test(entree) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

/** Même nettoyage que `one-vertical-scroller-per-screen.test.ts` (GA-08) : un
 *  commentaire qui CITE `overflow-x-auto` pour dire pourquoi il reste ne doit
 *  pas se faire passer pour une déclaration. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const OVERFLOW = /overflow-x-(auto|scroll)/
/**
 * La déclaration, sous ses DEUX formes valides : la classe Tailwind littérale
 * (`ContactEngagementLauncher.tsx`, le précédent d'avant #2588) ou la
 * constante partagée `HORIZONTAL_OVERSCROLL_CLASS` (`use-horizontal-overflow.ts`,
 * GA-26 — un seul endroit écrit la valeur, tout le monde l'importe).
 */
const OVERSCROLL = /overscroll-x-(contain|none)|HORIZONTAL_OVERSCROLL_CLASS/
const PLANCHER_EXPLICITE = /min-w-\[/
const TABLE_BRUTE = /<table\b/
const GRILLE = /role="grid"/

/** Les quatre lignes qui suivent la déclaration — assez pour lire le contenu
 *  direct d'un conteneur, jamais assez pour traverser un `<Table>` partagé. */
const HAUTEUR_FENETRE = 4

function fenetres(source: string): string[] {
  const lignes = source.split('\n')
  const sorties: string[] = []
  for (let i = 0; i < lignes.length; i++) {
    if (OVERFLOW.test(lignes[i])) sorties.push(lignes.slice(i, i + HAUTEUR_FENETRE).join('\n'))
  }
  return sorties
}

export function debordeReellement(fenetre: string): boolean {
  return PLANCHER_EXPLICITE.test(fenetre) || TABLE_BRUTE.test(fenetre) || GRILLE.test(fenetre)
}

export function declareSonDebordement(fenetre: string): boolean {
  return OVERSCROLL.test(fenetre)
}

function fautifsDe(racine: string): string[] {
  const fautifs: string[] = []
  for (const fichier of fichiersSous(racine)) {
    const lignes = sansCommentaires(readFileSync(fichier, 'utf8')).split('\n')
    for (let i = 0; i < lignes.length; i++) {
      if (!OVERFLOW.test(lignes[i])) continue
      const fenetre = lignes.slice(i, i + HAUTEUR_FENETRE).join('\n')
      if (debordeReellement(fenetre) && !declareSonDebordement(fenetre)) {
        fautifs.push(`${fichier.slice(fichier.indexOf('/src/'))}:${i + 1}`)
      }
    }
  }
  return fautifs
}

describe('#2588 — un conteneur qui déborde réellement déclare son débordement horizontal', () => {
  it('a un corpus à lire, dans les deux dossiers', () => {
    expect(fichiersSous(racineWeb).length).toBeGreaterThan(400)
    expect(fichiersSous(racineUi).length).toBeGreaterThan(5)
  })

  it('la garde voit bien des conteneurs à défilement horizontal — sinon elle est verte sur du vide', () => {
    const total = [...fichiersSous(racineWeb), ...fichiersSous(racineUi)].reduce(
      (acc, fichier) => acc + fenetres(sansCommentaires(readFileSync(fichier, 'utf8'))).length,
      0,
    )
    expect(total).toBeGreaterThan(10)
  })

  it('aucun conteneur qui déborde réellement ne tait son comportement de débordement', () => {
    const fautifs = [...fautifsDe(racineWeb), ...fautifsDe(racineUi)]
    // Preuve, pas hypothèse : `debordeReellement` / `declareSonDebordement`
    // lisent la FORME du conteneur, jamais un chemin de fichier — un
    // treizième conteneur qui déborde vraiment est couvert sans qu'on y pense.
    expect(fautifs, "un conteneur qui déborde réellement n'a pas déclaré overscroll-x-contain/-none").toEqual([])
  })

  /**
   * ⚠️ PROUVÉE ROUGE : ces fixtures sont la forme EXACTE de `TabCoverage.tsx`
   * avant #2588 (matrice `role="grid"` + plancher `min-w-[44rem]`, sans
   * déclaration) et après. Retirer `overscroll-x-contain` de n'importe lequel
   * des fichiers listés ci-dessus ferait échouer le test précédent de la même
   * façon.
   */
  it('sait dire NON, et NE dit PAS non à ce qu’elle ne vise pas', () => {
    const avant = '<div className="overflow-x-auto">\n  <div role="grid" aria-label={g} className="min-w-[44rem]">'
    const apres =
      '<div className={cn(\'overflow-x-auto\', HORIZONTAL_OVERSCROLL_CLASS)}>\n  <div role="grid" aria-label={g} className="min-w-[44rem]">'
    expect(debordeReellement(avant)).toBe(true)
    expect(declareSonDebordement(avant)).toBe(false)
    expect(debordeReellement(apres)).toBe(true)
    expect(declareSonDebordement(apres)).toBe(true)

    // Une barre d'onglets ou une bande de cartes : décoratif, geste natif
    // légitime, jamais requis.
    const barreOnglets = '<div className="w-full overflow-x-auto">\n  <TabNav tabs={tabs} />'
    expect(debordeReellement(barreOnglets)).toBe(false)

    // Le composant `<Table>` PARTAGÉ (majuscule) reçoit un plancher en prop :
    // il est vérifié séparément (packages/ui/src/components/table.tsx), pas
    // ici — une balise `<table` MINUSCULE, elle, reste visée.
    const tablePartagee = '<Box className="min-w-0 overflow-x-auto rounded-md border border-border">\n  <Table>'
    expect(debordeReellement(tablePartagee)).toBe(false)
  })

  it('la primitive partagée (packages/ui) déclare la classe — un seul endroit, GA-26', () => {
    const source = readFileSync(join(racineUi, 'components', 'table.tsx'), 'utf8')
    expect(source).toContain('HORIZONTAL_OVERSCROLL_CLASS')
    const hookSource = readFileSync(join(racineUi, 'hooks', 'use-horizontal-overflow.ts'), 'utf8')
    expect(hookSource).toContain("export const HORIZONTAL_OVERSCROLL_CLASS = 'overscroll-x-contain'")
  })

  it('la seconde primitive partagée (ResponsiveTable) déclare la même classe', () => {
    const source = readFileSync(join(racineWeb, 'components', 'primitives', 'ResponsiveTable.tsx'), 'utf8')
    expect(source).toContain('HORIZONTAL_OVERSCROLL_CLASS')
  })
})
