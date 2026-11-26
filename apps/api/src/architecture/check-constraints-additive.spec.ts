import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-11 — une contrainte `CHECK ... IN (...)` ne RÉTRÉCIT jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 21/08/2026, une migration ajoutant `imported` aux statuts de compte a
 * recopié sa liste depuis `1779200000000` — une migration PÉRIMÉE, car
 * `1783000000000` y avait ajouté `archived` et `deleted` depuis. Élargir d'un
 * côté, rétrécir de l'autre.
 *
 * Le `ADD CONSTRAINT` a donc échoué sur les lignes portant ces valeurs. Or
 * `migration:run:prod` est le `preDeployCommand` de Railway : son échec ABANDONNE
 * le déploiement et laisse l'ancienne version en ligne. L'application ne dit
 * rien, `/version` continue d'annoncer l'ancien commit, et on cherche une panne
 * applicative pendant une heure alors que le nouveau code n'a jamais démarré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI GA-08 NE POUVAIT PAS L'ATTRAPER
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-08 gèle les taxonomies TypeScript (`export const X = [...] as const`). Une
 * contrainte SQL vit dans une chaîne, à l'intérieur d'une migration, et aucune
 * garde ne la lisait. C'est pourtant le MÊME invariant — « additif, jamais un
 * renommage » — et c'est même la moitié la plus dangereuse : une valeur retirée
 * du TypeScript casse une compilation, une valeur retirée d'un `CHECK` casse un
 * déploiement en production.
 *
 * La règle vérifiée : pour un même nom de contrainte, chaque liste successive
 * doit être un SUR-ENSEMBLE de la précédente.
 */

const MIGRATIONS = join(__dirname, '..', 'migrations')

/**
 * `CONSTRAINT <nom> CHECK (<colonne> IN ('a', 'b'))`, avec ou sans `ADD`.
 *
 * ⚠️ Le `ADD ` était obligatoire dans la première version de cette lecture, si
 * bien que toute contrainte déclarée EN LIGNE dans un `CREATE TABLE` était
 * invisible — `interventions_state_check` par exemple. Une garde qui ne voit
 * qu'une moitié des contraintes passe au vert sur l'autre.
 */
const ADD_CHECK = /(?:ADD\s+)?CONSTRAINT\s+([a-z0-9_]+)\s+CHECK\s*\(\s*[a-z0-9_."]+\s+IN\s*\(([^)]*)\)/gi

type Declaration = { file: string; constraint: string; values: string[] }

function declarations(): Declaration[] {
  const out: Declaration[] = []
  // Les migrations s'exécutent dans l'ordre de leur horodatage, qui est aussi
  // l'ordre alphabétique de leurs noms de fichier.
  for (const file of readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .sort()) {
    const source = readFileSync(join(MIGRATIONS, file), 'utf8')
    // Seul le `up()` compte : un `down()` restaure volontairement l'état d'avant,
    // et c'est justement son rôle de rétrécir.
    const up = source.split('public async down')[0] ?? source
    for (const [, constraint, body] of up.matchAll(ADD_CHECK)) {
      const values = [...(body ?? '').matchAll(/'([^']*)'/g)].map(match => match[1] as string)
      if (values.length > 0) out.push({ file, constraint: constraint as string, values })
    }
  }
  return out
}

describe('GA-11 — les contraintes CHECK ne rétrécissent jamais', () => {
  const all = declarations()

  it('chaque redéclaration d’une contrainte est un SUR-ENSEMBLE de la précédente', () => {
    const seen = new Map<string, { file: string; values: string[] }>()
    const shrinks: string[] = []

    for (const declaration of all) {
      const previous = seen.get(declaration.constraint)
      if (previous) {
        const lost = previous.values.filter(value => !declaration.values.includes(value))
        if (lost.length > 0) {
          shrinks.push(
            `${declaration.file} retire ${lost.map(value => `'${value}'`).join(', ')} de ${declaration.constraint} (déclarée en dernier par ${previous.file})`,
          )
        }
      }
      seen.set(declaration.constraint, { file: declaration.file, values: declaration.values })
    }

    if (shrinks.length > 0) {
      throw new Error(
        [
          'Une contrainte CHECK a été RÉTRÉCIE. Le ADD CONSTRAINT échouera sur les lignes',
          'qui portent la valeur retirée — et comme les migrations sont le preDeployCommand,',
          'le déploiement sera ABANDONNÉ sans que rien dans l’application ne le dise.',
          '',
          'Reprends la liste de la DERNIÈRE migration qui déclare cette contrainte, pas',
          'd’une plus ancienne, et ajoute ta valeur à la fin.',
          '',
          ...shrinks.map(line => `  · ${line}`),
        ].join('\n'),
      )
    }
    expect(shrinks).toEqual([])
  })

  it('la garde lit bien quelque chose — une garde vide passe au vert pour toujours', () => {
    // Sans ce test, une expression régulière cassée rendrait la première
    // assertion inoffensive et personne ne s'en apercevrait.
    expect(all.length).toBeGreaterThan(5)
    expect(all.some(declaration => declaration.constraint === 'accounts_status_check')).toBe(true)
  })
})
