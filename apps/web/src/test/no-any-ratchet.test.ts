import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-09, côté interface — `any` ne remonte pas.
 *
 * Le web est en `strict: true`, donc aucun `any` n'y est implicite : les 56
 * occurrences comptées ici ont toutes été ÉCRITES à la main. La règle ESLint
 * qui les vise est en `warn` et aucun script ne passe `--max-warnings 0` : le
 * job `Lint` de la CI passe au vert en les affichant.
 *
 * Le pendant côté API fige à **zéro** parce que l'API n'en écrit aucun. Ici,
 * exiger zéro reviendrait à demander un chantier avant de pouvoir livrer quoi
 * que ce soit ; la garde fige donc le niveau et interdit d'empirer. Le chiffre
 * n'est pas un budget à dépenser : c'est un plafond, et il descend.
 */

const SRC = resolve(process.cwd(), 'src')

/**
 * Le constat au 19/08/2026 pour `apps/web/src`, fichiers générés exclus : **zéro**.
 *
 * Le plafond valait 56 tant que `routeTree.gen.ts` était compté — c'est-à-dire
 * que la garde ne mesurait pas le code écrit à la main mais la sortie d'un
 * générateur, et montait d'un cran à chaque écran ajouté. Une fois le fichier
 * généré exclu, le vrai chiffre apparaît : le web livré n'a AUCUN `any`.
 */
const ANY_AT_FREEZE = 0

const ANY_FORMS = /:\s*any\b|<any>|\bas any\b|\bany\[\]/g

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry) || entry.endsWith('.d.ts')) continue
    // Les tests simulent des dépôts et des réponses réseau ; les exclure évite
    // qu'un plafond serve à autre chose qu'à surveiller le code livré.
    if (/\.test\.tsx?$/.test(entry)) continue
    // Les fichiers GÉNÉRÉS (`routeTree.gen.ts`) sont exclus, et c'est une
    // correction du plafond, pas un assouplissement : le message de cette garde
    // dit « type ce qui vient d'être écrit », or personne n'écrit ce fichier —
    // il est produit par le plugin du routeur. Chaque route ajoutée y faisait
    // monter le compteur d'un `any` que personne ne pouvait retirer, si bien
    // que la garde finissait par punir l'ajout d'un écran.
    if (/\.gen\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

function codeLines(source: string): string[] {
  return source
    .split('\n')
    .map(line => line.trim())
    .filter(line => !line.startsWith('*') && !line.startsWith('//') && !line.startsWith('/*'))
}

describe('GA-09 — le nombre de `any` du web ne remonte pas', () => {
  const total = sourceFiles(SRC).reduce(
    (sum, file) => sum + codeLines(readFileSync(file, 'utf8')).flatMap(line => [...line.matchAll(ANY_FORMS)]).length,
    0,
  )

  it('reste sous le plafond figé', () => {
    // Si ce test tombe : type ce qui vient d'être écrit. Pour une charge
    // réseau, `unknown` + le schéma zod de `@bellum/contracts` dit la même
    // chose sans éteindre le compilateur là où la donnée entre.
    expect(total).toBeLessThanOrEqual(ANY_AT_FREEZE)
  })

  it('le plafond reste collé au réel — un plafond trop haut ne garde plus rien', () => {
    // Quand le réel descend nettement, c'est le plafond qu'il faut baisser :
    // sinon la garde se met à tolérer en silence une régression de vingt.
    expect(ANY_AT_FREEZE - total).toBeLessThanOrEqual(10)
  })
})
