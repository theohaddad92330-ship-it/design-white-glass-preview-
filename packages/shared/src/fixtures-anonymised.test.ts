import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Aucune fixture committée ne porte le nom d'une personne RÉELLE.
 *
 * ## Le défaut que cette garde ferme
 *
 * `real-run-sg.raw.json` contenait un run réel de Société Générale avec les
 * noms et les fonctions de vingt-trois personnes physiques : des membres du
 * conseil, des dirigeants, des interlocuteurs. Ils vivaient dans le dépôt, dans
 * l'historique Git, et dans chaque copie clonée — sans qu'aucun d'eux ne l'ait
 * su. C'est la première ligne de la doctrine du paquet de récupération, et le
 * dépôt la violait dans le fichier même qui servait de référence de contrat.
 *
 * ## Ce que la garde vérifie, et ce qu'elle ne peut pas
 *
 * Elle vérifie une LISTE NOMMÉE — les vingt-trois noms qui étaient là, plus les
 * patronymes seuls. Elle ne sait PAS reconnaître un nom de personne en général :
 * « Sopra Steria » et « Bini Smaghi » ont exactement la même forme, et une
 * heuristique renommerait une entreprise publique en croyant protéger quelqu'un.
 *
 * C'est donc une garde de NON-RETOUR, pas un détecteur : elle empêche que ces
 * noms-là reviennent par un rebase, une reprise de fixture ou un copier-coller
 * depuis un run réel. La règle générale — « ne pas committer un run client » —
 * reste une règle humaine.
 *
 * ⚠️ Les noms d'ENTREPRISES restent : « Société Générale », « Capgemini »,
 * « KPMG » sont des faits publics, et les remplacer rendrait les fixtures
 * incompréhensibles sans protéger personne.
 */

const FIXTURES = join(__dirname, '..', 'schemas', '__fixtures__')

/**
 * Les personnes physiques qui étaient nommées dans les fixtures avant le
 * 25/08/2026. Écrites en minuscules : la comparaison est insensible à la casse,
 * parce que le même dirigeant apparaissait en `CAPITALES` dans le registre et en
 * `Capitalisé` dans le reste du dossier.
 */
const REAL_PEOPLE: readonly string[] = [
  'messemer',
  'de ruffray',
  'côté',
  'houssaye',
  'poupart-lafarge',
  'ingrid-helen arnold',
  'contamine',
  'praud',
  'barlow',
  'bini smaghi',
  'ekman',
  'olivier klein',
  'palmieri',
  'wetter',
  'krupa',
  'connelly',
  'voiment',
  'delas',
  'gonçalves',
  'calmejane',
  'oudéa',
  'stricher',
  'lubomira rochet',
]

function fixtureFiles(): string[] {
  return readdirSync(FIXTURES)
    .filter(name => name.endsWith('.json'))
    .map(name => join(FIXTURES, name))
}

describe('les fixtures committées ne nomment aucune personne réelle', () => {
  const files = fixtureFiles()

  it('la garde lit bien des fichiers — sinon elle est verte pour toujours', () => {
    // Sans cette assertion, un dossier renommé rendrait zéro fichier et chaque
    // « aucun nom trouvé » passerait au vert par absence de sujet.
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) expect(readFileSync(file, 'utf8').length).toBeGreaterThan(100)
  })

  it.each(REAL_PEOPLE)('« %s » n’apparaît dans aucune fixture', person => {
    const guilty = files.filter(file => readFileSync(file, 'utf8').toLowerCase().includes(person))
    expect(guilty, `« ${person} » est une personne réelle — anonymise la fixture`).toEqual([])
  })

  it('les noms d’ENTREPRISES restent — les remplacer ne protégerait personne', () => {
    // La garde inverse : elle prouve que l'anonymisation a visé les gens et non
    // les faits publics. Une fixture dont on aurait aussi renommé les sociétés
    // serait incompréhensible, et l'anonymisation deviendrait un chiffrement.
    const corpus = files.map(file => readFileSync(file, 'utf8')).join('\n')
    expect(corpus).toContain('SOCIETE GENERALE')
  })
})
