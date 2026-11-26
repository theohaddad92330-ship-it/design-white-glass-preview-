import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * R15-10 (recette du 15/09/2026, prod `5ca597d5a`) — LA DATE D'UNE PROVENANCE
 * SE FORMATE À UN SEUL ENDROIT.
 *
 * Mesuré à l'écran, fiche contact THALES › Informations clés › Email
 * professionnel :
 *
 *   « lu dans un outil connecté · le 2026-09-11T07:22:37:46.992Z »
 *
 * La cause n'est pas la ligne fautive, c'est le CONTRAT de la propriété
 * `observedAt` : il n'en avait pas un, il en avait deux. Dix appelants
 * passaient une date DÉJÀ formatée — chacun avec son propre formateur, et il
 * y en avait quatre (`formatObservedAt`, `formatAnalysisDate`,
 * `formatContactDate`, un `formatDate` local) —, cinq passaient l'ISO brut. La
 * primitive, elle, recopiait ce qu'on lui donnait : les cinq derniers
 * publiaient donc l'ISO tel quel, et n'importe quelle chaîne passait pour une
 * date (celle-ci en portait deux `:` là où il en faut un).
 *
 * `Provenance` formate désormais elle-même, via `formatDate` (`@/lib/locale`),
 * la seule dérivation « date lisible » du front (GA-26). Cette garde tient ce
 * que le correctif a établi : personne ne reformate avant elle.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function fichiersSous(dir: string, ext: string[]): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules' || entree === 'dist') continue
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin, ext))
    else if (ext.some(e => entree.endsWith(e)) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

/** `observedAt={format…(…)}` — une date remise en forme AVANT la primitive. */
const PRE_FORMATE = /observedAt=\{[^}\n]*\bformat[A-Za-z]*\(/

describe('la date d’une provenance', () => {
  const sources = fichiersSous(join(racineWeb, 'src'), ['.tsx'])

  it('a un corpus à lire — une garde qui ne lit rien ne garde rien', () => {
    expect(sources.length).toBeGreaterThan(300)
    // Et ce corpus contient bien des appelants de la primitive.
    expect(sources.filter(f => /observedAt=\{/.test(readFileSync(f, 'utf8'))).length).toBeGreaterThan(5)
  })

  it('n’est jamais remise en forme par l’appelant — la primitive s’en charge', () => {
    const coupables = sources
      .filter(f => PRE_FORMATE.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(racineWeb.length + 1))

    expect(coupables).toEqual([])
  })

  it('sait dire NON — les lignes réellement mesurées en prod sont reconnues', () => {
    expect(PRE_FORMATE.test('<Provenance source="public" observedAt={formatDate(row.observedOn)} />')).toBe(true)
    expect(PRE_FORMATE.test('observedAt={formatObservedAt(field.provenance.observedAt, locale)}')).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une valeur brute passe', () => {
    expect(PRE_FORMATE.test('observedAt={contact.created_at}')).toBe(false)
    expect(PRE_FORMATE.test('observedAt={provenance.observedAt}')).toBe(false)
    // Une date formatée pour un AUTRE usage, à côté, n'est pas visée.
    expect(PRE_FORMATE.test('<Text>{formatDate(trend.fromDate)}</Text>')).toBe(false)
  })
})
