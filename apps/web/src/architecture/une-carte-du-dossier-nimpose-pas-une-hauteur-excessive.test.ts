import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * GA-380 — #2117.56 : INTERDIRE DES CARTES TROP HAUTES.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SONDE VOIT, ET CE QU'ELLE NE VOIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * jsdom ne calcule aucune géométrie : elle ne mesure ni le rendu réel d'une
 * `Card`, ni son contenu au moment où il est le plus long — « trop haute »
 * reste, pour partie, un critère de recette (#2117.83, mesuré sur un compte
 * riche ET un compte pauvre).
 *
 * Ce qu'une lecture de source PEUT prouver : une hauteur PIXEL ARBITRAIRE,
 * plantée en dur sur un `<Card`, au-delà de ce que le dossier utilise déjà
 * légitimement. Mesuré le 22/09/2026 sur ce corpus, la plus haute valeur
 * RÉELLE est `min-h-[620px]` (`FranceMapPanel.tsx` — une carte de France
 * D3, qui a besoin d'une vraie surface de dessin, pas un texte qui déborde).
 * Le seuil ci-dessous (900px) laisse une marge large au-dessus de cet usage
 * légitime et n'attrape que ce qui le dépasse largement — une carte fixée à
 * une hauteur que rien dans ce dossier ne justifie aujourd'hui.
 *
 * ⚠️ Elle ne vise QUE `<Card` (le composant `@bellum/ui`), jamais un `<div`
 * de mise en page (une carte de visualisation, un graphe, un conteneur
 * scrollable interne portent légitimement une hauteur — seule la carte
 * ELLE-MÊME imposant une taille plancher au contenu est visée). Elle ne vise
 * pas non plus un `max-h-[…px]` couplé à `overflow` : plafonner une hauteur
 * avec défilement est l'inverse du défaut (empêcher un débordement), pas le
 * défaut lui-même.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const racineDossier = join(racineWeb, 'src/features/accounts/view/account-detail')
const ecranDossier = join(racineWeb, 'src/features/accounts/view/AccountDetail.tsx')

/** Marge large au-dessus du plus haut usage légitime mesuré (620px, `FranceMapPanel.tsx`). */
const SEUIL_PX_EXCESSIF = 900

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin))
    else if (/\.tsx$/.test(entree) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

/** Le code sans ses commentaires — piège connu : une balise CITÉE en exemple n'est pas un défaut réel. */
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

/** Chaque `<Card` dont la hauteur (fixe OU plancher) en pixels dépasse le seuil, SANS `overflow` de secours. */
function cartesTropHautes(code: string): string[] {
  const balises = code.match(/<Card\b[^>]*>/g) ?? []
  return balises.filter(balise => {
    const hauteurs = [...balise.matchAll(/\b(?:min-h|h)-\[(\d+)px\]/g)].map(m => Number(m[1]))
    const excessive = hauteurs.some(px => px >= SEUIL_PX_EXCESSIF)
    const bornee = /\boverflow(?:-y)?-(?:auto|scroll)\b/.test(balise)
    return excessive && !bornee
  })
}

describe('#2117.56 — une carte du dossier n’impose pas une hauteur excessive (GA-380)', () => {
  it('LIT quelque chose : le corpus du dossier n’est pas vide', () => {
    expect(corpus.length).toBeGreaterThan(50)
  })

  it('sait dire NON — et n’attrape pas un usage légitime voisin', () => {
    const mauvais = '<Card className="flex flex-col min-h-[2000px] p-4">'
    const bons = [
      '<Card className="flex h-full min-h-[620px] flex-col overflow-hidden p-0">', // FranceMapPanel.tsx réel, sous le seuil
      '<Card className="max-h-[2000px] overflow-y-auto">', // plafonné ET défilant : l'inverse du défaut
      '<div className="min-h-[2000px]">', // pas une Card : un conteneur de mise en page
    ].join(' ')
    expect(cartesTropHautes(mauvais).length).toBeGreaterThan(0)
    expect(cartesTropHautes(bons)).toEqual([])
  })

  it('n’attrape pas une hauteur excessive seulement CITÉE dans un commentaire', () => {
    const enCommentaire = '// <Card className="min-h-[2000px]">'
    expect(cartesTropHautes(sansCommentaires(enCommentaire))).toEqual([])
  })

  it('aucune carte du dossier n’impose une hauteur excessive et arbitraire', () => {
    const fautifs = corpus.flatMap(({ chemin, code }) => cartesTropHautes(code).map(balise => `${chemin} : ${balise}`))
    expect(fautifs).toEqual([])
  })
})
