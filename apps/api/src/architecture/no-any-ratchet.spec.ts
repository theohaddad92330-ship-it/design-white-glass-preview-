import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-09 — `any` ne remonte pas.
 *
 * Le socle interdit `any`. La règle ESLint existe bien, mais en `warn`, et
 * aucun script ne passe `--max-warnings 0` : le job `Lint` de la CI passe au
 * vert avec 86 avertissements. Autrement dit, l'interdit était une intention.
 *
 * Pire pour cette application-ci : `packages/tooling/typescript/nestjs.json`
 * pose `"noImplicitAny": false` et n'active pas `strict`. L'API est la seule
 * app du dépôt dans ce cas — le web, le site, le back-office et les paquets
 * sont tous en `strict: true`. Passer l'API en strict d'un coup n'est pas une
 * garde, c'est un chantier ; cette garde tient la ligne en attendant.
 *
 * Elle compte les `any` ÉCRITS (annotation, assertion, générique, tableau) et
 * refuse que le total monte. Les `.d.ts` générés et les specs sont hors
 * périmètre : les premiers ne sont pas du code qu'on écrit, et les seconds
 * utilisent légitimement `as never` / `as unknown` pour simuler des dépôts.
 */

const SRC = join(__dirname, '..')

/**
 * Le constat au 19/08/2026 pour `apps/api/src` : **zéro**.
 *
 * Le code de l'API n'écrit aucun `any` hors des specs — alors même que le
 * compilateur l'y autorise et qu'ESLint se contente d'un avertissement. C'est
 * une discipline tenue à la main pendant des mois ; elle n'était protégée par
 * rien. Ce chiffre la rend acquise : le premier `any` écrit fait tomber la CI,
 * au lieu d'ajouter un 87ᵉ avertissement que personne ne lit.
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
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts') || entry.endsWith('.spec.ts')) continue
    out.push(full)
  }
  return out
}

/** Les lignes de commentaire ne comptent pas : « renvoie `any` » est une
 *  explication, pas un type. */
function codeLines(source: string): string[] {
  return source
    .split('\n')
    .map(line => line.trim())
    .filter(line => !line.startsWith('*') && !line.startsWith('//') && !line.startsWith('/*'))
}

describe('GA-09 — le nombre de `any` ne remonte pas', () => {
  const occurrences = sourceFiles(SRC).flatMap(file => {
    const hits = codeLines(readFileSync(file, 'utf8')).flatMap(line => [...line.matchAll(ANY_FORMS)])
    return hits.map(() => file.slice(SRC.length + 1))
  })

  it('inspecte des fichiers : 0 inspecté serait un faux vert (#4682.4)', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(0)
  })

  it('reste sous le plafond figé', () => {
    // Si ce test tombe : type ce qui vient d'être écrit. `unknown` + un parse
    // zod dit la même chose sans éteindre le compilateur — et le contrat existe
    // déjà pour presque tout ce qui traverse le fil.
    expect(occurrences.length).toBeLessThanOrEqual(ANY_AT_FREEZE)
  })

  it('nomme les fichiers fautifs plutôt qu’un simple compte', () => {
    // Un test qui dit « 4 au lieu de 3 » envoie chercher ; celui-ci dit où.
    expect(occurrences).toEqual([])
  })
})
