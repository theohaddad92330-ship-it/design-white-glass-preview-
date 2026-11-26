import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4628 (rattrape #4490) — « une piste POSE les critères et s'arrête là : aucun appel sans geste ».
 *
 * La garde voisine (`decouvrir-saisie-libre-ne-lance-rien-seule`) ne lit que `FilterRail.tsx`. L'arrivée sur /discover
 * vit dans `Discover.tsx` : en démonstration, un effet y LANÇAIT la première recherche enregistrée (`launch(first.filters)`,
 * #4556) — mesuré en recette de production le 26/10, une recherche « cybersécurité » partait seule et rendait 5 comptes.
 *
 * Règle tenue ici : tout `launch(` posé DANS un effet de rendu est un pré-remplissage seul — son troisième argument est
 * `true` (« pose, ne lance pas », #4490.1). Un lancement se fait au geste (clic, envoi), jamais d'un effet — démo comprise.
 */
const HERE = new URL('.', import.meta.url).pathname
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Les corps des `useEffect(() => { … })` d'un source, accolades appariées. */
function effectBodies(source: string): string[] {
  const bodies: string[] = []
  for (const match of source.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{/g)) {
    let depth = 1
    let index = (match.index ?? 0) + match[0].length
    const start = index
    while (depth > 0 && index < source.length) {
      const char = source[index]
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      index += 1
    }
    bodies.push(source.slice(start, index))
  }
  return bodies
}

/** Les `launch(…)` d'un effet qui ne sont PAS un pré-remplissage seul (dernier argument ≠ `true`). */
function launchesFromEffects(source: string): string[] {
  const offenders: string[] = []
  for (const body of effectBodies(source)) {
    for (const call of body.matchAll(/\blaunch\(([^;\n]*)\)/g)) {
      if (!/,\s*true\s*$/.test(call[1] ?? '')) offenders.push(call[0])
    }
  }
  return offenders
}

const discover = stripComments(readFileSync(join(HERE, '../features/discover/view/Discover.tsx'), 'utf8'))

describe('Découvrir — aucun appel sans geste, sur le chemin d’arrivée aussi (#4628, #4490)', () => {
  it('lit quelque chose : Discover.tsx pose bien un pré-remplissage seul depuis un effet', () => {
    expect(effectBodies(discover).some(body => /\blaunch\([^;\n]*,\s*true\)/.test(body))).toBe(true)
  })

  it('aucun effet de Discover.tsx ne lance une recherche — démo comprise', () => {
    expect(launchesFromEffects(discover)).toEqual([])
  })

  it('sait dire NON — la lecture de l’arrivée en démo d’avant #4628 est vue', () => {
    const before =
      'useEffect(() => { if (!isDemo) return; launch(first.filters); setAppliedSavedSearchId(first.id) }, [])'
    expect(launchesFromEffects(before)).toEqual(['launch(first.filters)'])
  })

  it('sait ne pas attraper ce qu’elle ne vise pas — un pré-remplissage seul, ou un lancement au clic', () => {
    expect(launchesFromEffects('useEffect(() => { launch(restored, undefined, true) }, [])')).toEqual([])
    expect(launchesFromEffects('const play = useCallback(() => { launch(search.filters) }, [])')).toEqual([])
  })
})
