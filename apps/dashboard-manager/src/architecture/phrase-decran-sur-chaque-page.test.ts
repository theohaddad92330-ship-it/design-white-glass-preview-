import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * #1678 — « La phrase d'écran est OBLIGATOIRE sur les 24 pages. C'est la règle
 * du produit client — "une route sans phrase échoue" — et elle vaut ici. »
 *
 * La raison, écrite dans l'issue : quand une troisième personne arrive, elle
 * doit comprendre le back-office sans que quelqu'un lui fasse le tour. Un titre
 * seul ne dit ni à quoi sert l'écran ni qui le lit.
 *
 * CE QUE LA GARDE VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VÉRIFIER
 * Elle vérifie qu'un texte d'au moins 40 caractères existe dans un `.subtitle`
 * ou un `.muted` de la page. Elle ne peut pas juger si ce texte est UTILE —
 * ça demanderait de lire du français. C'est une garde de présence, et c'est
 * dit plutôt que sous-entendu.
 *
 * ⚠️ Une page de REDIRECTION est hors sujet : elle n'a pas d'écran. L'exception
 * est mesurée sur le CODE (`redirect(`), pas sur une liste de chemins écrite à
 * la main — une liste ne voit jamais la page qu'on ajoutera demain.
 */

const APP = fileURLToPath(new URL('../app/', import.meta.url))

/** Un `.subtitle` ou un `.muted` qui porte au moins 40 caractères de texte. */
const PHRASE = /className="(?:subtitle|muted)"[^>]*>([\s\S]{40,}?)</

function pages(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) pages(chemin, out)
    else if (entree === 'page.tsx') out.push(chemin)
  }
  return out
}

/** Une redirection n'a pas d'écran — elle n'a donc pas de phrase à porter. */
export function estUneRedirection(source: string): boolean {
  return /\bredirect\(/.test(source)
}

export function porteUnePhrase(source: string): boolean {
  return estUneRedirection(source) || PHRASE.test(source)
}

describe('chaque page du back-office dit à quoi elle sert (#1678)', () => {
  it('LIT quelque chose — le corpus de pages n’est pas vide', () => {
    // Contrôle positif : un `APP` faux rendrait zéro page, donc zéro manquante,
    // donc une garde verte qui n'a ouvert aucun fichier.
    const trouvees = pages(APP)
    expect(trouvees.length).toBeGreaterThan(15)
    expect(trouvees.map(chemin => relative(APP, chemin))).toContain('changelog/page.tsx')
  })

  it('sait dire NON — une page sans phrase est refusée', () => {
    const sansPhrase = 'export default function Vide() {\n  return <main className="wrap"><h1>Vide</h1></main>\n}'
    expect(porteUnePhrase(sansPhrase)).toBe(false)
    // Et une phrase trop courte pour dire quoi que ce soit ne compte pas.
    const troppeu = '<p className="subtitle">Clients.</p>'
    expect(porteUnePhrase(troppeu)).toBe(false)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une redirection n’a pas d’écran', () => {
    const redirection =
      "import { redirect } from 'next/navigation'\nexport default function I() {\n  redirect('/clients')\n}"
    expect(estUneRedirection(redirection)).toBe(true)
    expect(porteUnePhrase(redirection)).toBe(true)
  })

  it('toutes les pages qui ont un écran portent leur phrase', () => {
    const manquantes = pages(APP)
      .filter(chemin => !porteUnePhrase(readFileSync(chemin, 'utf8')))
      .map(chemin => relative(APP, chemin))

    expect(
      manquantes,
      [
        'Une page sans phrase n’explique pas à quoi elle sert.',
        'Ajouter un <p className="subtitle"> sous le <h1>, en FR / EN,',
        'qui dise ce que l’écran répond et à qui (#1678).',
        '',
        ...manquantes,
      ].join('\n'),
    ).toEqual([])
  })
})
