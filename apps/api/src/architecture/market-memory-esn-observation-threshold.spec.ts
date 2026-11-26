import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-285 — #1624 / #1631.4 / #1606.2 (lot 14) — le plancher d'une ligne ESN
 * observée s'applique à CHAQUE ligne, pas seulement au total de l'entreprise —
 * et il vit à UN SEUL endroit.
 *
 * ⚠️⚠️ RENVERSEMENT DATÉ du 11/10/2026 (Louis, épopée #4016 lot L10 : « concurrent
 * affiché dès 1 parcours, libellé « 1-2 parcours » »). Jusque-là le plancher
 * ESN était le seuil transverse (3). Il est désormais `MARKET_ESN_OBSERVED_MIN_PATHS`
 * (1) pour les lignes ESN d'un compte DÉJÀ couvert ; le seuil transverse (3)
 * reste celui du TOTAL de l'entreprise et des destinations d'une société de
 * services. L'ancien défaut (Keyrus « 2 parcours observés » sur un compte à 2)
 * reste fermé autrement : sous 3 le compte exact ne s'affiche plus, la fourchette
 * « 1-2 » le remplace (`esnObservedPathsRange`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION LE 10/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /api/accounts/5ba0b848-3a7c-4e0d-bce5-82435e966ead/partners` (BNP
 * Paribas) rendait Keyrus à **2 parcours**, certitude « faible » — et l'écran
 * affichait « 2 parcours observés relient Keyrus à cet environnement. »,
 * exactement ce que la doctrine interdit (sous 3 observations, une entité
 * n'apparaît pas). `coverageFor` ET `searchByFilters` filtraient CHACUN leur
 * propre ligne ESN par `MARKET_OBSERVATION_MIN_PERSONS` (2 — pensé pour la
 * pile technique, une notion DIFFÉRENTE), jamais par le seuil TRANSVERSE de
 * toute la mémoire marché, `MARKET_MEMORY_MIN_PATHS` (3) — et les deux filtres
 * étaient déjà des dérivations SÉPARÉES, prêtes à diverger davantage.
 *
 * Le correctif introduit `esnObservedFrom` : UNE SEULE dérivation, utilisée
 * par les deux appelants. Cette garde lit le SOURCE et vérifie les deux
 * moitiés de la correction : le seuil qu'elle applique, ET qu'elle reste
 * unique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE A ATTRAPÉ LE 11/09/2026 (#1636)
 * ─────────────────────────────────────────────────────────────────────────────
 * Une TROISIÈME lecture (`esnViewFor`, les destinations d'une société de
 * services) a refiltré `row.persons >= MARKET_MEMORY_MIN_PATHS` de son côté —
 * le bon seuil, mais une deuxième dérivation, donc deux endroits à corriger le
 * jour où le plancher bouge. La garde a dit NON, et le filtre a été extrait
 * dans `meetsObservationFloor`, que les trois lectures appellent.
 *
 * C'est pourquoi l'assertion d'unicité porte désormais sur DEUX choses : un
 * seul `row.persons >= …` dans le fichier, ET un prédicat de plancher appelé
 * plusieurs fois — sans la seconde, extraire le filtre puis n'en appeler qu'un
 * passerait, et la troisième lecture aurait juste perdu son plancher.
 */

const SERVICE = join(__dirname, '..', 'modules', 'market-memory', 'market-memory.service.ts')

/** Le nom de la constante comparée dans chaque `row.persons >= XXX` du source. */
function personsFilterThresholds(source: string): string[] {
  const thresholds: string[] = []
  const re = /row\.persons >= (\w+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) thresholds.push(match[1])
  return thresholds
}

/** Les valeurs de `minEsnPersons` passées aux requêtes SQL du service. */
function minEsnPersonsParams(source: string): string[] {
  return [...source.matchAll(/minEsnPersons: (\w+)/g)].map(match => match[1])
}

describe('#4016 L10 — le plancher des lignes ESN observées vit à UN endroit, et vaut 1 (renversement du 11/10/2026)', () => {
  const source = readFileSync(SERVICE, 'utf8')

  it('lit un corpus non vide', () => {
    expect(source.length).toBeGreaterThan(1000)
    expect(source.includes('esnObservedFrom')).toBe(true)
  })

  it('SAIT DIRE NON — un filtre au plancher `MARKET_OBSERVATION_MIN_PERSONS` (2) est détecté', () => {
    const fautif = `.filter(row => row.persons >= MARKET_OBSERVATION_MIN_PERSONS)`
    expect(personsFilterThresholds(fautif)).toEqual(['MARKET_OBSERVATION_MIN_PERSONS'])
  })

  it("n'attrape pas ce qu'elle ne vise pas — un seuil d'ENTREPRISE reste légitime", () => {
    const temoin = 'if (!signal || signal.pathsTotal < MARKET_MEMORY_MIN_PATHS) return { status: 0 }'
    expect(personsFilterThresholds(temoin)).toEqual([])
    expect(source.includes('signal.pathsTotal < MARKET_MEMORY_MIN_PATHS')).toBe(true)
  })

  it('exactement DEUX prédicats de plancher : 1 pour les lignes ESN, 3 pour les destinations — rien d’autre', () => {
    expect(personsFilterThresholds(source).sort()).toEqual(['MARKET_ESN_OBSERVED_MIN_PATHS', 'MARKET_MEMORY_MIN_PATHS'])
  })

  it('`esnObservedFrom` filtre par le prédicat ESN, et les destinations par le prédicat à 3', () => {
    const esnBody = source.slice(
      source.indexOf('private static esnObservedFrom'),
      source.indexOf('private static esnObservedFrom') + 400,
    )
    expect(esnBody).toContain('meetsEsnObservedFloor')
    expect(esnBody).not.toContain('meetsObservationFloor')
    expect(source).toMatch(/destinationRows\s*\.filter\(meetsObservationFloor\)/)
  })

  it('les deux filtres SQL d’entreprise (`esn` nommé, `externalRecourseObserved`) portent le MÊME plancher que la ligne', () => {
    const params = minEsnPersonsParams(source)
    expect(params.length).toBeGreaterThanOrEqual(2)
    for (const param of params) expect(param).toBe('MARKET_ESN_OBSERVED_MIN_PATHS')
  })

  it('elle reste UNIQUE — `esnObservedFrom` est RÉUTILISÉE par les lectures, jamais refiltrée localement', () => {
    expect((source.match(/esnObservedFrom\(/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect((source.match(/meetsEsnObservedFloor/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect((source.match(/meetsObservationFloor/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})
