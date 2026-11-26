import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-337 — #2165.57 / #2165.58 (16/09/2026) : LA DEMANDE EXPLICITE DU TOUR
 * DOMINE LE PROFIL, ET LE PROFIL NE COMPLÈTE QUE VISIBLEMENT.
 *
 * Numéro vérifié le 16/09/2026 : GA-336 (`aucune-presence-esn-sans-preuve.
 * test.ts`, posée dans ce même lot) était le plus haut existant. Si un lot
 * parallèle du même jour en pose une aussi, c'est à l'intégration de
 * renuméroter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES DEUX POINTS DEMANDENT, ET CE QUI ÉTAIT DÉJÀ VRAI SANS GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2165.57 : un critère saisi n'est jamais réécrit PAR LE PROFIL. #2165.58 :
 * le profil complète les trous, VISIBLEMENT — pas en silence, dans un état que
 * l'écran ne montre pas. Lecture de `Discover.tsx` : le profil ESN
 * (`useProfileContext`) n'y est lu que par UN SEUL GESTE explicite — jamais un
 * effet qui s'exécute tout seul : le bouton « Ma cible » (#4530, 24/10/2026 —
 * `toggleMyTarget`, qui remplace `applyStartingPoint` / « Appliquer à la
 * recherche » du panneau « Ta cible », retirés) — et il écrit dans LE MÊME état
 * `filters` que le rail affiche : remplir devient visible au prochain rendu,
 * par construction (aucun état caché ni miroir séparé). #4529 : l'arrivée n'en
 * pose plus rien (la zone du profil n'est plus pré-appliquée).
 * (#3081, 26/09/2026 — l'ancien second geste, `runAutopilot` — le raccourci
 * de lancement immédiat à côté de la saisie libre — est retiré à la demande
 * de Louis ; `plan`/`autopilotPlan` ne sont donc plus calculés dans cet écran.)
 * Aucun des deux `useEffect` de l'écran (le préremplissage Laura, le contexte
 * marché) ne référence le profil — un critère saisi ne peut donc pas se faire
 * réécrire PAR LE PROFIL pendant que l'utilisateur tape.
 *
 * Cette garde fixe ce fait dans le temps : un futur `useEffect(() =>
 * setFilters(…), [profileContext])` la ferait rougir avant la recette.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PREUVES QU'UNE GARDE DOIT DONNER
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Elle sait dire NON — testée sur un extrait SYNTHÉTIQUE qui viole la règle.
 * 2. Elle LIT quelque chose — le fichier réel est relu et compté.
 * 3. Elle n'attrape PAS ce qu'elle ne vise pas — les DEUX `useEffect`
 *    légitimes de l'écran (Laura, contexte marché, aucun des deux ne
 *    touchant au profil) restent verts.
 */

const DISCOVER = join(__dirname, '..', 'features', 'discover', 'view', 'Discover.tsx')

/**
 * Les corps de bloc `useEffect(() => { … }, […])`, comptage de crochets
 * ÉQUILIBRÉ — une regex seule ne sait pas s'arrêter à la bonne accolade dès
 * qu'un objet littéral apparaît dans le corps.
 *
 * ⚠️ Ce lecteur de TEXTE ne s'appelle PAS `useEffectBodies` : `react-hooks` lit
 * les noms, pas les intentions, et une fonction dont le nom commence par `use`
 * appelée depuis une fonction ordinaire est pour lui un hook hors composant —
 * une ERREUR ESLint, seule erreur d'un job par ailleurs tout en avertissements.
 */
function effectBodiesIn(source: string): string[] {
  const bodies: string[] = []
  const marker = 'useEffect('
  let searchFrom = 0
  for (;;) {
    const start = source.indexOf(marker, searchFrom)
    if (start === -1) break
    const braceStart = source.indexOf('{', start)
    if (braceStart === -1) break
    let depth = 0
    let index = braceStart
    for (; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1
      else if (source[index] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    bodies.push(source.slice(braceStart, index + 1))
    searchFrom = index + 1
  }
  return bodies
}

/** LE DÉTECTEUR. Un effet qui lit le profil ET écrit l'état de recherche est
 *  exactement ce que la règle interdit — un remplissage SILENCIEUX. */
function effectsThatOverrideOnProfile(source: string): string[] {
  return effectBodiesIn(source).filter(body => /profileContext/.test(body) && /setFilters|launch\(/.test(body))
}

describe('GA-337 — la garde LIT quelque chose', () => {
  it('trouve Discover.tsx, et il porte du code', () => {
    expect(readFileSync(DISCOVER, 'utf8').length).toBeGreaterThan(5000)
  })

  it('trouve au moins deux blocs useEffect dans l’écran réel', () => {
    expect(effectBodiesIn(readFileSync(DISCOVER, 'utf8')).length).toBeGreaterThanOrEqual(2)
  })
})

describe('GA-337 — aucun effet ne réécrit la recherche depuis le profil', () => {
  it('l’écran réel est propre', () => {
    expect(effectsThatOverrideOnProfile(readFileSync(DISCOVER, 'utf8'))).toEqual([])
  })

  it('le profil n’est lu que dans des gestes explicites, jamais un useEffect', () => {
    const source = readFileSync(DISCOVER, 'utf8')
    for (const body of effectBodiesIn(source)) {
      expect(body.includes('profileContext')).toBe(false)
    }
  })
})

describe('GA-337 — elle sait dire NON', () => {
  it('rougit sur un effet synthétique qui applique le profil tout seul', () => {
    const casse = `
      useEffect(() => {
        setFilters(current => ({ ...current, sectors: profileContext?.profile_context?.idealAccountProfile?.sectorsPriority ?? [] }))
      }, [profileContext])
    `
    expect(effectsThatOverrideOnProfile(casse)).toHaveLength(1)
  })

  it('rougit aussi sur la forme `launch(...)`, pas seulement `setFilters`', () => {
    const casse = `
      useEffect(() => {
        launch(autopilotPlan(profileContext?.profile_context?.idealAccountProfile).filters)
      }, [profileContext])
    `
    expect(effectsThatOverrideOnProfile(casse)).toHaveLength(1)
  })
})

describe('GA-337 — elle n’attrape PAS ce qu’elle ne vise pas', () => {
  it('laisse passer un effet qui écrit l’état SANS lire le profil (Laura, contexte marché)', () => {
    const legitime = `
      useEffect(() => {
        const prefilled = filtersFromSearch(location.search)
        if (!prefilled) return
        launch(prefilled)
      }, [location.search, launch])
    `
    expect(effectsThatOverrideOnProfile(legitime)).toEqual([])
  })

  it('laisse passer un `useMemo` qui CALCULE le plan sans l’appliquer', () => {
    const legitime = `
      const plan = useMemo(() => autopilotPlan(profileContext?.profile_context?.idealAccountProfile), [profileContext])
    `
    expect(effectsThatOverrideOnProfile(legitime)).toEqual([])
  })
})
