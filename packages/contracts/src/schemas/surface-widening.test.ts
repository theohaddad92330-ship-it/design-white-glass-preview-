import { describe, expect, it } from 'vitest'
import { CRITERIA_WIDEN_MIN_RESULTS } from './criteria-referential.js'
import {
  SURFACE_WIDEN_TIERS,
  contactsSurfaceWidening,
  surfaceWideningSchema,
  widenToThreshold,
} from './surface-widening.js'

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `a${from + i}`)
const keyOf = (value: string) => value

// #4433.9 — l'échelle des autres surfaces : le seuil est CELUI des critères, jamais une seconde constante.
describe('widenToThreshold (#4433.9)', () => {
  it('au seuil ou au-dessus : aucun palier tenté, aucune étape', () => {
    const second = () => {
      throw new Error('ne doit pas être évalué')
    }
    const out = widenToThreshold([() => range(0, CRITERIA_WIDEN_MIN_RESULTS), second], ['watch_intent'], keyOf)
    expect(out.items).toHaveLength(CRITERIA_WIDEN_MIN_RESULTS)
    expect(out.steps).toEqual([])
  })

  it('sous le seuil : élargit, garde l’exact en tête et dit le palier atteint', () => {
    const out = widenToThreshold([() => range(0, 3), () => range(0, 12)], ['watch_intent'], keyOf)
    expect(out.items.slice(0, 3)).toEqual(range(0, 3))
    expect(out.items).toHaveLength(12)
    expect(out.steps).toEqual([{ tier: 'watch_intent', added: 9 }])
  })

  it('un palier qui n’apporte rien n’est pas affiché, le suivant est tenté', () => {
    const out = widenToThreshold(
      [() => range(0, 3), () => range(0, 3), () => range(0, 8)],
      ['watch_intent', 'contacts_neighbour_roles'],
      keyOf,
    )
    expect(out.steps).toEqual([{ tier: 'contacts_neighbour_roles', added: 5 }])
  })

  it('s’arrête dès que le seuil est atteint (pas de palier de trop)', () => {
    const third = () => {
      throw new Error('ne doit pas être évalué')
    }
    const out = widenToThreshold(
      [() => range(0, 2), () => range(0, CRITERIA_WIDEN_MIN_RESULTS + 1), third],
      ['watch_intent', 'contacts_neighbour_roles'],
      keyOf,
    )
    expect(out.steps.map(step => step.tier)).toEqual(['watch_intent'])
  })

  it('exact vide et rien en vue : ni écran à zéro inventé ni étape', () => {
    const out = widenToThreshold([() => [], () => []], ['watch_intent'], keyOf)
    expect(out.items).toEqual([])
    expect(out.steps).toEqual([])
  })

  it('le schéma n’accepte que les paliers connus et jamais added à 0', () => {
    expect(SURFACE_WIDEN_TIERS).toContain('watch_intent')
    expect(
      surfaceWideningSchema.safeParse({ minResults: 10, steps: [{ tier: 'watch_intent', added: 2 }] }).success,
    ).toBe(true)
    expect(surfaceWideningSchema.safeParse({ minResults: 10, steps: [{ tier: 'inconnu', added: 2 }] }).success).toBe(
      false,
    )
    expect(
      surfaceWideningSchema.safeParse({ minResults: 10, steps: [{ tier: 'watch_intent', added: 0 }] }).success,
    ).toBe(false)
  })
})

// #4433.9 — l'analyse de compte : la passe d'élargissement des contacts se DIT, seulement si elle a apporté.
describe('contactsSurfaceWidening (#4433.9)', () => {
  it('une passe qui a ajouté des contacts devient le palier « postes voisins »', () => {
    expect(contactsSurfaceWidening({ attempted: true, initialStock: 5, added: 4 })).toEqual({
      minResults: CRITERIA_WIDEN_MIN_RESULTS,
      steps: [{ tier: 'contacts_neighbour_roles', added: 4 }],
    })
  })

  it.each([
    ['absente', undefined],
    ['null', null],
    [
      'qui ne trouve rien (added 0) : un palier sans apport ne s’affiche pas',
      { attempted: true, initialStock: 5, added: 0 },
    ],
    ['en échec (added inconnu) : jamais un 0 inventé', { attempted: true, initialStock: 5, failure: 'timeout' }],
  ])('%s : rien à dire', (_label, outcome) => {
    expect(contactsSurfaceWidening(outcome)).toBeNull()
  })
})
