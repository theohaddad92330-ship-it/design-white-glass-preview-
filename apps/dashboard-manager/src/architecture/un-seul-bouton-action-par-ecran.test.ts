import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * #1642.4 — « --action, réservé au bouton primaire UNIQUE d'un écran » ne se
 * tenait qu'en commentaire (`EmptyState.tsx:6-9`, `globals.css:13-19`) :
 * rien ne vérifiait qu'un écran n'en affiche pas deux. Cette garde tient DEUX
 * choses distinctes :
 *
 *  1. Au niveau du SYSTÈME : un seul sélecteur CSS, dans tout `src/ui/`, a le
 *     droit de peindre un FOND avec `var(--action)`. Aujourd'hui c'est
 *     `.action` d'`EmptyState.module.css` — et lui seul. Un deuxième
 *     composant qui s'y mettrait rendrait la règle « un seul par écran »
 *     impossible à garantir, quel que soit le comptage par écran ci-dessous.
 *
 *  2. Au niveau de l'ÉCRAN : aucune page ne rend deux fois `<EmptyState
 *     action={…} />` (le seul consommateur réel aujourd'hui). Un « écran »,
 *     ici, c'est sa `page.tsx` PLUS tout ce que ses dossiers privés (`_xxx`,
 *     la convention déjà en usage dans ce dépôt) contiennent — jamais une
 *     route imbriquée (`/revenus/clients` a sa PROPRE `page.tsx`, ce n'est
 *     pas la même écran que `/revenus`).
 *
 * ⚠️ CE QUE CETTE GARDE NE PEUT PAS VOIR
 *  - `.btn` (fond `var(--accent)`, PAS `--action`) peut légitimement
 *    apparaître plusieurs fois sur un même écran (`feedback-card.tsx` en a
 *    trois) : c'est un bouton générique, pas LE bouton d'action réservé. Le
 *    confondre avec `--action` casserait ce cas réel — volontairement hors
 *    du sujet ici (voir `contraste-aa.test.ts` pour le constat séparé sur
 *    `.btn`).
 *  - Un futur DEUXIÈME composant consommant `--action` (pas seulement
 *    `EmptyState`) n'est vu qu'au niveau CSS (point 1) tant que le comptage
 *    par écran (point 2) ne connaît que la syntaxe `<EmptyState … action=`.
 *  - Un `--action` posé par un import indirect (un composant qui reçoit sa
 *    couleur d'un parent) échappe au comptage textuel — cette garde lit du
 *    JSX statique, pas un arbre de rendu.
 */

const UI_DIR = fileURLToPath(new URL('../ui/', import.meta.url))
const APP_DIR = fileURLToPath(new URL('../app/', import.meta.url))
const ESN_DIRECTORY = fileURLToPath(new URL('../app/clients/_components/esn-directory.tsx', import.meta.url))
const FEEDBACK_CARD = fileURLToPath(new URL('../app/feedback/_components/feedback-card.tsx', import.meta.url))

// ─────────────────────────────────────────────────────────────────────────
// 1. Au niveau du système — un seul sélecteur peint un fond `var(--action)`.
// ─────────────────────────────────────────────────────────────────────────

function sansCommentaires(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Les sélecteurs (bruts, pas résolus) dont le CORPS peint un fond avec le
 * jeton `--action`. Une regle par règle CSS de premier niveau — ce fichier
 * n'a pas de `@media` autour de `.action`, donc pas besoin de descendre plus
 * loin qu'un bloc `{ … }`. */
function selecteursAvecFondAction(css: string): string[] {
  const trouves: string[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(sansCommentaires(css)))) {
    const corps = m[2] as string
    if (/background(-color)?\s*:\s*var\(--action\)/.test(corps)) {
      trouves.push((m[1] as string).trim())
    }
  }
  return trouves
}

function fichiersModuleCss(dir: string): string[] {
  return readdirSync(dir)
    .filter(entree => entree.endsWith('.module.css'))
    .map(entree => join(dir, entree))
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Au niveau de l'écran — au plus une balise `<EmptyState … action=` par
//    écran (page.tsx + ses dossiers `_xxx`).
// ─────────────────────────────────────────────────────────────────────────

function estDossierPrive(nom: string): boolean {
  return nom.startsWith('_')
}

function fichiersTsxRecursifs(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) fichiersTsxRecursifs(chemin, out)
    else if (entree.endsWith('.tsx')) out.push(chemin)
  }
  return out
}

/** Les dossiers qui SONT un écran (portent une `page.tsx`), balayés
 * récursivement mais SANS jamais entrer dans un dossier `_xxx` (ce n'est
 * jamais une route) — une route imbriquée a la sienne, listée séparément. */
function dossiersDeRoute(dir: string, out: string[] = []): string[] {
  if (existsSync(join(dir, 'page.tsx'))) out.push(dir)
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory() && !estDossierPrive(entree)) {
      dossiersDeRoute(chemin, out)
    }
  }
  return out
}

function fichiersDeLecran(dossierRoute: string): string[] {
  const fichiers = [join(dossierRoute, 'page.tsx')]
  for (const entree of readdirSync(dossierRoute)) {
    const chemin = join(dossierRoute, entree)
    if (statSync(chemin).isDirectory() && estDossierPrive(entree)) {
      fichiers.push(...fichiersTsxRecursifs(chemin))
    }
  }
  return fichiers
}

/**
 * Compte les balises `<EmptyState …>` dont l'attribut `action=` est DANS la
 * balise d'ouverture. On avance caractère par caractère depuis `<EmptyState`
 * en suivant la profondeur des accolades `{}` : une expression JSX peut
 * contenir un `>` (`onClick: () => …`), donc la balise ne se termine qu'au
 * premier `>` À PROFONDEUR ZÉRO — pas à la première occurrence de `>`.
 */
function balisesEmptyStateAvecAction(sourceBrute: string): number {
  const source = sourceBrute.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
  const motif = '<EmptyState'
  let compte = 0
  let depart = source.indexOf(motif)
  while (depart !== -1) {
    let profondeur = 0
    let fin = source.length
    for (let i = depart + motif.length; i < source.length; i++) {
      const c = source[i]
      if (c === '{') profondeur++
      else if (c === '}') profondeur--
      else if (c === '>' && profondeur === 0) {
        fin = i + 1
        break
      }
    }
    if (/\baction=\{/.test(source.slice(depart, fin))) compte++
    depart = source.indexOf(motif, fin)
  }
  return compte
}

function compteParEcran(dossierRoute: string): number {
  return fichiersDeLecran(dossierRoute).reduce(
    (total, chemin) => total + (existsSync(chemin) ? balisesEmptyStateAvecAction(readFileSync(chemin, 'utf8')) : 0),
    0,
  )
}

describe('un seul bouton --action par écran (#1642.4)', () => {
  it('LIT quelque chose — le corpus CSS et le corpus des écrans ne sont pas vides', () => {
    const modules = fichiersModuleCss(UI_DIR)
    const routes = dossiersDeRoute(APP_DIR)
    expect(modules.length).toBeGreaterThan(5)
    expect(routes.length).toBeGreaterThanOrEqual(20)
  })

  it('LIT vraiment — .action d’EmptyState.module.css est bien le sélecteur trouvé', () => {
    const css = readFileSync(join(UI_DIR, 'EmptyState.module.css'), 'utf8')
    expect(selecteursAvecFondAction(css)).toEqual(['.action'])
  })

  it('LIT vraiment — les vrais appels d’EmptyState d’aujourd’hui ne passent aucun `action`', () => {
    // `jobs-table.tsx` et `users-table.tsx` appellent `<EmptyState icon=… message=… />`
    // sans `action` — le compte réel, aujourd’hui, est bien zéro.
    const jobsTable = readFileSync(join(APP_DIR, 'queues/_components/jobs-table.tsx'), 'utf8')
    expect(balisesEmptyStateAvecAction(jobsTable)).toBe(0)
    const usersTable = readFileSync(join(APP_DIR, 'users/_components/users-table.tsx'), 'utf8')
    expect(balisesEmptyStateAvecAction(usersTable)).toBe(0)
  })

  it('sait dire NON — au niveau CSS, un deuxième sélecteur qui peint --action est détecté', () => {
    const cssFabrique = `.action {\n  background: var(--action);\n}\n.autreBouton {\n  background: var(--action);\n  color: white;\n}`
    expect(selecteursAvecFondAction(cssFabrique)).toEqual(['.action', '.autreBouton'])
  })

  it('sait dire NON — au niveau écran, deux boutons d’action sur le même fichier sont comptés', () => {
    const jsxFabrique = `
      <EmptyState message="a" action={{ label: 'Un', onClick: () => undefined }} />
      <p>texte</p>
      <EmptyState message="b" action={{ label: 'Deux', onClick: () => { doThing(); return; } }} />
    `
    expect(balisesEmptyStateAvecAction(jsxFabrique)).toBe(2)
  })

  it('n’attrape PAS ce qu’elle ne vise pas — un `<form action="...">` n’est pas `<EmptyState action=`', () => {
    // Trois écrans du dépôt écrivent `<form method="get" action="/…">` — la
    // même chaîne « action= » qu'on cherche, sur une balise SANS RAPPORT.
    const esnDirectory = readFileSync(ESN_DIRECTORY, 'utf8')
    expect(esnDirectory).toContain('action="/clients"')
    expect(balisesEmptyStateAvecAction(esnDirectory)).toBe(0)
  })

  it('n’attrape PAS ce qu’elle ne vise pas — plusieurs `.btn` génériques sur un écran ne comptent pas', () => {
    // `feedback-card.tsx` a TROIS `.btn` (fond `--accent`, pas `--action`) —
    // un bouton générique réutilisable, pas LE bouton d'action réservé.
    const feedbackCard = readFileSync(FEEDBACK_CARD, 'utf8')
    expect((feedbackCard.match(/className="btn"/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(balisesEmptyStateAvecAction(feedbackCard)).toBe(0)
  })

  it('un seul sélecteur, dans tout src/ui/, peint un fond avec --action', () => {
    const trouves = fichiersModuleCss(UI_DIR).flatMap(chemin =>
      selecteursAvecFondAction(readFileSync(chemin, 'utf8')).map(
        selecteur => `${chemin.slice(UI_DIR.length)} — ${selecteur}`,
      ),
    )
    expect(
      trouves,
      ['« --action » est réservé au bouton primaire UNIQUE d’un écran (#1642.4).', 'Trouvé :', ...trouves].join('\n'),
    ).toEqual(['EmptyState.module.css — .action'])
  })

  it('aucun écran ne rend deux fois <EmptyState action=…> (page.tsx + ses dossiers _xxx)', () => {
    const fautifs = dossiersDeRoute(APP_DIR)
      .map(dossier => ({ dossier: dossier.slice(APP_DIR.length) || '/', compte: compteParEcran(dossier) }))
      .filter(({ compte }) => compte > 1)

    expect(
      fautifs,
      ['Un écran avec deux boutons --action dilue « LE » bouton primaire.', JSON.stringify(fautifs)].join('\n'),
    ).toEqual([])
  })
})
