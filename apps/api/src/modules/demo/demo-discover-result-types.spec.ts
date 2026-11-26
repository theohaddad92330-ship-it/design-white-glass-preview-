import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DISCOVER_RESULT_TYPES } from './demo-coverage'

/**
 * #2165.7 à #2165.10 — « et en démonstration, chaque TYPE de résultat montre
 * quoi ? »
 *
 * `/discover` n'a aucune table à lui : la garde PAR TABLE ne posera jamais
 * cette question. Un type de résultat ajouté à l'écran peut donc arriver vide
 * devant un prospect sans que rien ne rougisse — c'est le silence exact que la
 * craft rule n°9 vise.
 *
 * Ce que cette garde prouve, en plus de la couverture :
 *  - elle **LIT** un corpus non vide, et elle le lit DANS LE CONTRAT qui porte
 *    les types (`discover-result-type.ts`), pas dans une liste recopiée ici —
 *    une copie ne voit jamais ce qui n'y est pas ;
 *  - elle **sait dire NON** : un cinquième type ajouté au contrat sans décision
 *    de démonstration la fait rougir, EN LE NOMMANT ;
 *  - elle **n'attrape pas ce qu'elle ne vise pas** : elle ne dit rien des
 *    ÉTATS de résultat (liste / vide / non vérifiable), qui ont leur propre
 *    registre et leur propre garde — deux questions, deux réponses.
 *
 * ⚠️ Ne JAMAIS déplacer une entrée vers « vide à dessein » pour faire passer ce
 * test. La raison doit tenir devant quelqu'un qui présente le produit.
 */

const CONTRAT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'contracts',
  'src',
  'schemas',
  'discover-result-type.ts',
)

/** Les types déclarés par le CONTRAT, lus dans son tableau littéral. */
function typesDuContrat(): string[] {
  const source = readFileSync(CONTRAT, 'utf8')
  const ligne = source.split('\n').find(l => l.includes('export const DISCOVER_RESULT_TYPES'))
  if (!ligne) throw new Error('DISCOVER_RESULT_TYPES introuvable dans le contrat')
  return [...ligne.matchAll(/'([a-z]+)'/g)].map(match => match[1] as string)
}

describe('couverture démo — les types de résultat de /discover (#2165.7-.10)', () => {
  it('LIT un corpus non vide — sans ça, la garde passerait au vert sur du vide', () => {
    const types = typesDuContrat()
    expect(types.length).toBeGreaterThan(0)
    expect(Object.keys(DEMO_DISCOVER_RESULT_TYPES).length).toBeGreaterThan(0)
    // Contrôle positif : le type historique est bien lu depuis le contrat. S'il
    // disparaissait de l'extraction, tout le reste serait vert sans rien voir.
    expect(types).toContain('accounts')
  })

  it('classe CHAQUE type déclaré au contrat', () => {
    // Si ce test tombe : un type a été ajouté sans que personne ait répondu
    // « et en démonstration, ça montre quoi ? ». Le nom du fautif est DANS la
    // valeur comparée — sinon l'échec dirait « false n'est pas true ».
    const nonClasses = typesDuContrat().filter(type => !DEMO_DISCOVER_RESULT_TYPES[type])
    expect(nonClasses).toEqual([])
  })

  it('ne classe RIEN qui ne soit pas un type du contrat', () => {
    // Le sens inverse : une entrée orpheline resterait verte pour toujours en
    // prétendant couvrir quelque chose qui n'existe plus.
    const orphelines = Object.keys(DEMO_DISCOVER_RESULT_TYPES).filter(key => !typesDuContrat().includes(key))
    expect(orphelines).toEqual([])
  })

  it('exige une raison SUBSTANTIELLE pour tout type laissé vide à dessein', () => {
    const tropCourtes = Object.entries(DEMO_DISCOVER_RESULT_TYPES)
      .filter(([, entree]) => entree.state !== 'seede' && entree.reason.length <= 200)
      .map(([key]) => key)
    expect(tropCourtes).toEqual([])
  })

  it('n’attrape pas ce qu’il ne vise pas : les ÉTATS de résultat ne sont pas des types', () => {
    // Témoin : « aucuneCorrespondance » est un ÉTAT, il est classé ailleurs, et
    // il n'a rien à faire ici. Si ce registre se mettait à l'accueillir, c'est
    // que les deux questions auraient fusionné.
    expect(Object.keys(DEMO_DISCOVER_RESULT_TYPES)).not.toContain('aucuneCorrespondance')
  })
})
