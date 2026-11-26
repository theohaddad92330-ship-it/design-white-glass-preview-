import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * GA-379 — #2117.54 : INTERDIRE UNE SUCCESSION DE QUINZE CARTES IDENTIQUES.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SONDE VOIT, ET CE QU'ELLE NE VOIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * jsdom ne calcule aucune géométrie et ne rend rien : elle ne peut pas
 * compter combien de cartes une liste produit une fois hydratée avec des
 * données réelles — un `.map()` sur un tableau de quinze contacts n'a
 * qu'UNE seule occurrence dans le SOURCE, quel que soit le nombre d'éléments
 * à l'exécution. Cette garde ne prétend donc pas voir « quinze cartes à
 * l'écran » (#2117.54 reste aussi un critère de recette, #2117.83).
 *
 * Ce qu'elle voit, et qui est un vrai bug distinct — le COPIÉ-COLLÉ : quinze
 * fois (ou plus) la MÊME balise `<XyzCard ...>` écrite littéralement, au
 * caractère près, dans un seul fichier. Un développeur qui duplique un bloc
 * de carte quinze fois plutôt que de le piloter par une donnée est
 * exactement la « succession de cartes identiques » que #2117.54 vise : rien
 * ne les distingue, y compris leurs props, parce que c'est le MÊME texte
 * source répété. Une balise différente ne serait plus « identique » ; un
 * `.map()` sur des données réelles ne serait plus « une succession écrite
 * en dur ».
 *
 * Corpus : `features/accounts/view/account-detail` + `AccountDetail.tsx`,
 * comme `dossier-grammaire-visuelle.test.ts`.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const racineDossier = join(racineWeb, 'src/features/accounts/view/account-detail')
const ecranDossier = join(racineWeb, 'src/features/accounts/view/AccountDetail.tsx')

/** Le seuil est celui du point : QUINZE, pas quatorze. Le plus haut compte
 *  réel mesuré le 22/09/2026 sur ce corpus est 3 (`FocalOrgView.tsx`,
 *  `PersonCard`, un arbre écrit à la main sur 3 niveaux) : large marge. */
const SEUIL_IDENTIQUES = 15

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin))
    else if (/\.tsx$/.test(entree) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

/** Le code sans ses commentaires : une balise CITÉE en exemple dans un
 *  commentaire n'est pas une carte copiée-collée — piège mesuré sur ce
 *  dépôt (« une garde qui lit la prose accuse le bien »). */
function sansCommentaires(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const corpus = [...fichiersSous(racineDossier), ecranDossier].map(chemin => ({
  chemin: relative(racineWeb, chemin),
  code: sansCommentaires(readFileSync(chemin, 'utf8')),
}))

/** Toute balise `<XyzCard` (ou `<Card`) répétée MOT POUR MOT dans un fichier, avec son décompte. */
function cartesRepetees(code: string): Array<{ balise: string; occurrences: number }> {
  const tags = code.match(/<[A-Z][A-Za-z0-9]*Card\b[^>]*\/?>/g) ?? []
  const comptes = new Map<string, number>()
  for (const tag of tags) comptes.set(tag, (comptes.get(tag) ?? 0) + 1)
  return [...comptes.entries()]
    .filter(([, n]) => n >= SEUIL_IDENTIQUES)
    .map(([balise, occurrences]) => ({ balise, occurrences }))
}

describe('#2117.54 — une carte du dossier ne se copie pas quinze fois (GA-379)', () => {
  it('LIT quelque chose : le corpus du dossier n’est pas vide', () => {
    expect(corpus.length).toBeGreaterThan(50)
  })

  it('sait dire NON — et n’attrape pas un `.map()` sur des données réelles', () => {
    const balise = '<OpportunityCard title="Exemple" icon="star" />'
    const seizeIdentiques = Array.from({ length: 16 }, () => balise).join('\n')
    expect(cartesRepetees(sansCommentaires(seizeIdentiques))).toEqual([{ balise, occurrences: 16 }])

    // La même chose CITÉE dans un commentaire n'est pas un copié-collé réel.
    const seizeEnCommentaire = `/*\n${seizeIdentiques}\n*/`
    expect(cartesRepetees(sansCommentaires(seizeEnCommentaire))).toEqual([])

    // Juste sous le seuil : pas de violation.
    const quatorze = Array.from({ length: 14 }, () => balise).join('\n')
    expect(cartesRepetees(quatorze)).toEqual([])

    // Un `.map()` : UNE seule occurrence littérale, quel que soit le tableau réel.
    const carteEnMap = `{items.map(item => (\n  <OpportunityCard key={item.id} title={item.title} icon={item.icon} />\n))}`
    expect(cartesRepetees(carteEnMap)).toEqual([])

    // Seize balises DIFFÉRENTES (props distinctes) : pas « identiques ».
    const seizeDifferentes = Array.from({ length: 16 }, (_, i) => `<OpportunityCard title="Cas ${i}" />`).join('\n')
    expect(cartesRepetees(seizeDifferentes)).toEqual([])
  })

  it('aucune carte du dossier n’est copiée-collée quinze fois ou plus', () => {
    const fautifs = corpus.flatMap(({ chemin, code }) =>
      cartesRepetees(code).map(({ balise, occurrences }) => `${chemin} : ${occurrences}× ${balise}`),
    )
    expect(fautifs).toEqual([])
  })
})
