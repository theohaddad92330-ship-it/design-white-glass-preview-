import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEMPS1_STAGES, type Question } from './index'

/**
 * #2025.2 — « une question existe si sa réponse est LUE quelque part » était
 * déjà tenue pour le profil progressif (`onboarding.ts:191`, un commentaire),
 * jamais GARDÉE pour `questions/*.ts` (Temps 1). C'est exactement le défaut
 * n°1 du dépôt dans sa forme la plus chère : #2007 avait dû réparer vingt-cinq
 * champs transportés, stockés, payés, jamais lus par le modèle — cette garde
 * empêche un vingt-sixième.
 *
 * « Lu » veut dire : le nom du champ apparaît dans le PROMPT effectivement
 * envoyé au modèle (`apps/ia/app/prompts/bellum_profiler.py`), pas seulement
 * transporté par `ia.client.ts` — #2007 l'a appris à ses dépens : le transport
 * seul avait laissé passer six mois de champs muets.
 *
 * ⚠️ `__dirname`, jamais `import.meta.url` : sous jsdom `fileURLToPath` échoue
 * au CHARGEMENT et vitest rend un vert qui n'a rien exécuté
 * (`discover-types-mirror-the-contract.test.ts`).
 */
const PROMPT_SOURCE = readFileSync(
  join(__dirname, '../../../../../../../apps/ia/app/prompts/bellum_profiler.py'),
  'utf8',
)

const ALL_QUESTIONS: Question[] = TEMPS1_STAGES.flatMap(stage => stage.steps.flatMap(step => step.questions))
const ALL_KEYS = [...new Set(ALL_QUESTIONS.map(q => q.key))]

/**
 * #2059.9/.10 — LA SEULE exception NOMMÉE à « une question existe si sa
 * réponse est lue quelque part » : l'attribution marketing ne doit JAMAIS
 * être lue par le prompt, c'est la doctrine elle-même, pas un oubli. Gardée
 * dans l'autre sens par
 * `packages/contracts/src/schemas/heard-about-bellum-attribution.guard.test.ts`
 * (qui vérifie l'absence, ici on vérifie qu'on ne l'EXIGE pas).
 */
const NEVER_REACHES_MODEL_BY_DOCTRINE: readonly string[] = ['heard_about_bellum']

describe('questions/*.ts (Temps 1) → bellum_profiler.py (golden)', () => {
  it('le corpus de la garde n’est pas vide', () => {
    expect(ALL_KEYS.length).toBeGreaterThanOrEqual(17)
  })

  it('chaque clé de question a un lecteur dans le prompt du profiler, sauf l’exception de doctrine NOMMÉE', () => {
    const sansLecteur = ALL_KEYS.filter(
      key => !NEVER_REACHES_MODEL_BY_DOCTRINE.includes(key) && !PROMPT_SOURCE.includes(`"${key}"`),
    )
    expect(sansLecteur, `clés Temps 1 sans lecteur dans bellum_profiler.py : ${sansLecteur.join(', ')}`).toEqual([])
  })

  it('l’exception de doctrine n’est vraiment PAS lue — sinon ce n’est plus une exception, c’est un trou', () => {
    for (const key of NEVER_REACHES_MODEL_BY_DOCTRINE) {
      expect(PROMPT_SOURCE, `${key} ne doit jamais apparaître dans le prompt du profiler`).not.toContain(`"${key}"`)
    }
  })

  it('sait dire NON : une clé retirée du prompt fait rougir le test au-dessus', () => {
    const sourceAmputee = PROMPT_SOURCE.replace(/"esn_maturity_situation"/g, '')
    const sansLecteur = ALL_KEYS.filter(
      key => !NEVER_REACHES_MODEL_BY_DOCTRINE.includes(key) && !sourceAmputee.includes(`"${key}"`),
    )
    expect(sansLecteur).toEqual(['esn_maturity_situation'])
  })

  it("n'attrape pas ce qu'elle ne vise pas : un nom de champ voisin non déclaré au wizard n'est pas exigé", () => {
    // Témoin : `offer_domain` (singulier) est lu par le prompt sans être une
    // clé de question Temps-1 (il est dérivé de `offer_domains`) — la garde
    // ne l'exige donc jamais et ne casse pas dessus.
    expect(ALL_KEYS).not.toContain('offer_domain')
  })
})
