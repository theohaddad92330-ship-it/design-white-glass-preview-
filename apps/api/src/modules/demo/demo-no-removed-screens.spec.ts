import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRODUCT_SCREENS } from '@bellum/contracts'

/**
 * #3710.2 — « LES BLOCS SUPPRIMÉS DU PRODUIT N'Y SUBSISTENT PAS ».
 *
 * La salle de démonstration montre les pages RÉELLEMENT livrées. Quand le
 * produit retire un écran (`/missions/renouvellements`, #3656) ou le réduit à
 * une simple redirection, une donnée de salle qui l'ADRESSE encore — un lien
 * semé, une destination de bandeau, la raison d'une classification — enverrait
 * le prospect vers une page qui n'existe plus que comme alias : un bouton mort
 * en réunion.
 *
 * La garde lit le CODE de ce dossier (les commentaires sont retirés : l'histoire
 * d'un écran a le droit de s'écrire, une destination vivante non) et refuse
 * toute route littérale que le catalogue des écrans (`PRODUCT_SCREENS`) classe
 * `technique` — c'est-à-dire qui ne rend plus d'écran. Elle sait dire NON (une
 * source qui cite la route supprimée est refusée) et LIT quelque chose (un
 * corpus de routes vivantes qu'elle laisse passer).
 */
const DEMO_DIR = __dirname

const COMMENTAIRE_BLOC = /\/\*[\s\S]*?\*\//g
const COMMENTAIRE_LIGNE = /(^|[^:'"`])\/\/.*$/gm
const ROUTE_LITTERALE = /['"`](\/[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*)(?:[?#][^'"`]*)?['"`]/g

function sansCommentaires(source: string): string {
  return source.replace(COMMENTAIRE_BLOC, ' ').replace(COMMENTAIRE_LIGNE, (_tout, avant: string) => avant)
}

const TECHNIQUES = new Set(PRODUCT_SCREENS.filter(screen => screen.nature === 'technique').map(screen => screen.route))
const CONNUES = new Set(PRODUCT_SCREENS.map(screen => screen.route))
/**
 * #4359 — un écran supprimé dont le fichier de route a disparu sort AUSSI du catalogue
 * (garde `product-screens-catalog-covers-routes`) : il n'y est plus `technique`, il n'y est
 * plus du tout. Ces adresses-là restent refusées par leur nom.
 */
const SUPPRIMEES = new Set(['/missions/renouvellements'])
const REFUSEES = new Set([...TECHNIQUES, ...SUPPRIMEES])

function routesCitees(source: string): string[] {
  return [...sansCommentaires(source).matchAll(ROUTE_LITTERALE)].map(match => match[1] as string)
}

function fichiersDeDemo(): string[] {
  return readdirSync(DEMO_DIR)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map(name => join(DEMO_DIR, name))
}

describe('démo — aucune destination vers un écran supprimé (#3710.2)', () => {
  it('LIT quelque chose : des routes vivantes du catalogue sont citées par la salle', () => {
    const vivantes = fichiersDeDemo()
      .flatMap(path => routesCitees(readFileSync(path, 'utf8')))
      .filter(route => CONNUES.has(route) && !REFUSEES.has(route))
    expect(new Set(vivantes).size).toBeGreaterThan(10)
  })

  it('la route supprimée est refusée — hors du catalogue des écrans vivants (#4359)', () => {
    expect(REFUSEES.has('/missions/renouvellements')).toBe(true)
    expect(CONNUES.has('/missions/renouvellements')).toBe(false)
  })

  it('SAIT DIRE NON : une source qui adresse la page supprimée est refusée', () => {
    const fautive = `const lien = '/missions/renouvellements'\n// '/missions/planification' en commentaire`
    const refusees = routesCitees(fautive).filter(route => REFUSEES.has(route))
    expect(refusees).toEqual(['/missions/renouvellements'])
  })

  it('n’attrape pas ce qu’elle ne vise pas : une route vivante, ou citée en commentaire, passe', () => {
    const saine = `const a = '/missions/planification'\n// '/missions/renouvellements' : histoire`
    expect(routesCitees(saine).filter(route => REFUSEES.has(route))).toEqual([])
  })

  it('aucun fichier de la salle n’adresse un écran qui ne rend plus rien', () => {
    const fautes = fichiersDeDemo().flatMap(path =>
      routesCitees(readFileSync(path, 'utf8'))
        .filter(route => REFUSEES.has(route))
        .map(route => `${path.split('/').pop()} → ${route}`),
    )
    expect(fautes).toEqual([])
  })
})
