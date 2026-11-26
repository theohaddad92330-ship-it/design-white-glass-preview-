import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * GARDE — aucun paramètre de route en `:nom?`.
 *
 * Depuis `express@5` / `path-to-regexp@8`, le suffixe `?` n'est plus une syntaxe de route :
 * `pathToRegexp` lève `TypeError: Unexpected ? at index N` **au démarrage**, quand Nest enregistre
 * les routes. L'application entière refuse donc de booter — pas une requête, pas un test : tout.
 *
 * Mesuré le 25/10/2026 : `abc536dced` (#4546) a posé `@Delete(':connectionId?')` sur les contrôleurs
 * Google et Microsoft. `apps/api` ne démarrait plus sur `main`, et la production ne tenait que parce
 * qu'elle servait encore un commit antérieur — le déploiement suivant l'aurait coupée.
 *
 * La forme qui marche : un TABLEAU de chemins, `@Delete(['', ':connectionId'])`.
 */
const SRC = resolve(__dirname, '..')

function decoratorPaths(): { file: string; line: number; text: string }[] {
  // `grep -n` plutôt qu'une lecture de tout l'arbre : la garde doit rester à quelques dizaines de ms.
  let out = ''
  try {
    out = execFileSync(
      'grep',
      ['-rnoE', '@(Get|Post|Put|Patch|Delete|All)\\(["\'][^"\']*["\']\\)', '--include=*.ts', SRC],
      { encoding: 'utf8' },
    )
  } catch (error) {
    // grep sort en 1 quand il ne trouve RIEN : ce serait une garde aveugle, pas une garde verte.
    const status = (error as { status?: number }).status
    if (status === 1) return []
    throw error
  }
  return (
    out
      .split('\n')
      .filter(Boolean)
      .map(row => {
        const [file, line, ...rest] = row.split(':')
        return { file: file.replace(`${SRC}/`, ''), line: Number(line), text: rest.join(':') }
      })
      // Cette garde CITE la forme interdite dans ses propres commentaires : elle ne s'attrape pas elle-même.
      .filter(row => !row.file.endsWith('routes-express5.spec.ts'))
  )
}

describe('routes — la syntaxe optionnelle `:param?` ne boote pas sous express 5', () => {
  it('lit vraiment des décorateurs de route (contrôle positif : une garde qui ne lit rien est verte pour rien)', () => {
    expect(decoratorPaths().length).toBeGreaterThan(50)
  })

  it('aucun chemin ne porte un paramètre en `:nom?`', () => {
    const fautifs = decoratorPaths().filter(row => /:[A-Za-z0-9_]+\?/.test(row.text))
    expect(
      fautifs.map(row => `${row.file}:${row.line} ${row.text}`),
      // Le message porte le remède, pas seulement le constat.
      // `@Delete(':id?')` → `@Delete(['', ':id'])`
    ).toEqual([])
  })
})
