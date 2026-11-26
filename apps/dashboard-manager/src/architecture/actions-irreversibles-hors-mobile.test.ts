import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Le point 9 de l'issue 1674 : sous 768 px, les actions irréversibles sont
 * ABSENTES DU DOM, pas masquées en CSS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le lot qui a introduit les trois paliers de largeur a livré la PREUVE de la
 * distinction (un `display:none` laisse le bouton tabulable et cliquable par
 * script) sur une démonstration isolée, et l'a appliquée à ZÉRO écran : les
 * fichiers concernés étaient hors de son périmètre. C'est le défaut le plus
 * cher de ce dépôt — du code juste que personne n'appelle — et il se referme
 * en cherchant l'APPELANT, pas la fonction.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────
 * Elle est une garde de POPULATION : elle balaie TOUS les écrans, trouve ceux
 * qui rendent une action irréversible, et exige que chacun passe la porte.
 * Ajouter demain un quatrième appelant sans la porte la fait échouer — c'est
 * ce qu'une garde ancrée sur une LISTE ÉCRITE À LA MAIN ne saurait pas faire.
 *
 * Ce qu'elle ne voit pas : une action irréversible rendue sous un nom qui
 * n'est pas dans `ACTIONS_IRREVERSIBLES`. La parade est que ce sont des
 * composants NOMMÉS et partagés, pas des `<button>` anonymes — et qu'un
 * nouveau nom se déclare ici en même temps qu'il se crée.
 */

const RACINE_APP = fileURLToPath(new URL('../app', import.meta.url))
const PORTE = 'PosteDeTravailSeulement'

/** Les composants dont un rendu engage un geste qu'on ne défait pas. */
const ACTIONS_IRREVERSIBLES = ['DeleteUser', 'SuspendUser', 'Impersonate', 'UserRowActions'] as const

function fichiersTsx(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) fichiersTsx(chemin, acc)
    else if (entree.endsWith('.tsx') && !entree.includes('.test.')) acc.push(chemin)
  }
  return acc
}

/** Le JSX seul : `<DeleteUser`, jamais la ligne d'import ni un commentaire. */
function rendCetteAction(source: string, nom: string): boolean {
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return new RegExp(`<${nom}[\\s/>]`).test(sansCommentaires)
}

describe('les actions irréversibles ne sont pas rendues sur un écran étroit (issue 1674, point 9)', () => {
  const fichiers = fichiersTsx(RACINE_APP)

  it('LIT quelque chose — le corpus d’écrans n’est pas vide', () => {
    // Sans ce test, un chemin faux rendrait la garde verte en ne lisant RIEN.
    expect(fichiers.length).toBeGreaterThan(40)
  })

  it('TROUVE des appelants — sinon elle garderait une population vide', () => {
    const appelants = fichiers.filter(f => {
      const source = readFileSync(f, 'utf8')
      return ACTIONS_IRREVERSIBLES.some(nom => rendCetteAction(source, nom))
    })
    expect(appelants.length).toBeGreaterThan(0)
  })

  it('chaque écran qui rend une action irréversible passe par la porte', () => {
    const manquants: string[] = []
    for (const fichier of fichiers) {
      const source = readFileSync(fichier, 'utf8')
      const rendues = ACTIONS_IRREVERSIBLES.filter(nom => rendCetteAction(source, nom))
      if (rendues.length === 0) continue
      if (!source.includes(`<${PORTE}>`)) {
        manquants.push(`${fichier.slice(RACINE_APP.length + 1)} rend ${rendues.join(', ')} sans ${PORTE}`)
      }
    }
    expect(manquants).toEqual([])
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — un écran sans action irréversible n’a rien à déclarer', () => {
    // Le témoin : un écran de lecture n'a pas besoin de la porte, et la garde
    // ne doit pas le lui réclamer. Sans ce test, la rendre plus stricte
    // (« tout écran importe la porte ») passerait inaperçu.
    const temoin = fichiers.find(f => f.endsWith(join('runbook', 'page.tsx')))
    expect(temoin).toBeDefined()
    const source = readFileSync(temoin as string, 'utf8')
    expect(ACTIONS_IRREVERSIBLES.some(nom => rendCetteAction(source, nom))).toBe(false)
    expect(source.includes(`<${PORTE}>`)).toBe(false)
  })
})
