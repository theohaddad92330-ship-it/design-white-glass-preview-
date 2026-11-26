import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Un effet qui appelle le serveur ne dépend JAMAIS d'une PROP fonction.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'INCIDENT, MESURÉ EN PRODUCTION LE 09/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * La palette ⌘K appelait son action serveur **une fois par seconde, sans
 * fin**, tant qu'elle restait ouverte — cinq endpoints d'administration par
 * tour. Mesuré dans le navigateur : 10 `fetch` en 10 secondes avec une requête
 * STABLE et zéro frappe ; 0 en 8 secondes une fois la palette fermée.
 *
 * Le mécanisme : l'effet de recherche listait `search` — une PROP — dans ses
 * dépendances. Chaque résolution appelait `setResult`, donc un rendu, donc un
 * effet relancé, donc une recherche de plus. Sans fin.
 *
 * ⚠️ Ce que l'écran en montrait : « Recherche… » affiché POUR TOUJOURS, même
 * résultats en place. Le symptôme visible était un libellé qui traîne ; le
 * vrai coût — une boucle contre la production — était INVISIBLE. C'est
 * pourquoi aucune relecture ne l'aurait vu, et pourquoi il a fallu compter les
 * appels plutôt que regarder la page.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET POURQUOI ELLE N'EST PAS UN CAPRICE
 * ─────────────────────────────────────────────────────────────────────────
 * L'identité d'une prop fonction n'est pas contrôlée par le composant qui la
 * reçoit. La mettre en dépendance revient à laisser QUELQU'UN D'AUTRE décider
 * de la fréquence de tes appels réseau. La parade standard est une référence :
 * l'effet ne dépend alors que de ce qui doit VRAIMENT le relancer.
 *
 * ⚠️ Cette garde épingle une RÈGLE, pas un état : elle reste vraie quand le
 * code s'améliore, et ne rougit que si quelqu'un remet une prop instable dans
 * les dépendances d'un effet réseau. (La leçon de GA-241, payée le même jour.)
 */

const FICHIER = fileURLToPath(new URL('../app/_components/global-search.tsx', import.meta.url))

/** Le corps ET les dépendances de chaque `useEffect` du fichier. */
function effetsDuFichier(source: string): Array<{ corps: string; deps: string[] }> {
  const out: Array<{ corps: string; deps: string[] }> = []
  const re = /useEffect\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    // On avance jusqu'à la parenthèse fermante de l'appel, en comptant.
    let profondeur = 0
    let i = m.index + 'useEffect'.length
    for (; i < source.length; i++) {
      if (source[i] === '(') profondeur++
      else if (source[i] === ')') {
        profondeur--
        if (profondeur === 0) break
      }
    }
    const appel = source.slice(m.index, i + 1)
    const deps = /,\s*\[([^\]]*)\]\s*\)$/.exec(appel)
    if (deps) {
      out.push({
        corps: appel,
        deps: (deps[1] ?? '')
          .split(',')
          .map(d => d.trim())
          .filter(Boolean),
      })
    }
  }
  return out
}

/**
 * Un effet qui APPELLE — pas un effet qui se contente de ranger la prop dans
 * une référence.
 *
 * ⚠️ La première version de cette garde bannissait `search` de TOUTE
 * dépendance. Elle a immédiatement attrapé la parade elle-même
 * (`useEffect(() => { searchRef.current = search }, [search])`), qui doit
 * évidemment dépendre de la prop et n'appelle rien. Une garde trop gourmande
 * interdit le correctif qu'elle est censée protéger.
 */
function appelleLaRecherche(corps: string): boolean {
  // ⚠️ Tolérant à la mise en forme : prettier coupe volontiers
  // `searchRef.current(trimmed)` en `void searchRef\n  .current(trimmed)`.
  // La première version de cette garde s'ancrait sur la chaîne littérale et
  // est devenue rouge au premier passage du formateur — une garde ne doit pas
  // dépendre de l'endroit où un outil place ses retours à la ligne.
  return /\bsearch(Ref\s*\.\s*current)?\s*\(/.test(corps.replace(/useEffect\(/g, ''))
}

describe('un effet réseau ne dépend pas d’une prop fonction', () => {
  const source = readFileSync(FICHIER, 'utf8')

  it('LIT quelque chose — le fichier existe et porte bien des effets', () => {
    // Sans ça, un chemin devenu faux rendrait la garde verte en ne lisant RIEN.
    expect(source.length).toBeGreaterThan(2000)
    expect(effetsDuFichier(source).length).toBeGreaterThanOrEqual(4)
    expect(effetsDuFichier(source).some(e => appelleLaRecherche(e.corps))).toBe(true)
  })

  it('aucun effet qui APPELLE la recherche ne dépend de la prop `search`', () => {
    const fautifs = effetsDuFichier(source)
      .filter(e => appelleLaRecherche(e.corps) && e.deps.includes('search'))
      .map(e => `deps [${e.deps.join(', ')}]`)
    expect(fautifs).toEqual([])
  })

  it('la prop passe bien par une référence — la parade, pas une omission', () => {
    // Retirer la dépendance SANS la référence figerait la palette sur la
    // première version de l'action. Les deux vont ensemble.
    expect(source).toContain('searchRef')
    expect(source).toMatch(/searchRef\s*\.\s*current\s*\(/)
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — les autres dépendances restent permises', () => {
    // Le témoin : l'effet de recherche DOIT continuer de dépendre de la
    // requête et de l'ouverture. Une garde qui interdirait toute dépendance
    // casserait le composant au lieu de le protéger.
    const toutes = effetsDuFichier(source).flatMap(e => e.deps)
    expect(toutes).toContain('query')
    expect(toutes).toContain('open')
    // …et le témoin de la sur-gourmandise : l'effet qui RANGE la prop dans la
    // référence dépend de `search`, ne l'appelle pas, et reste PERMIS.
    const rangement = effetsDuFichier(source).filter(e => e.deps.includes('search') && !appelleLaRecherche(e.corps))
    expect(rangement.length).toBe(1)
  })
})
