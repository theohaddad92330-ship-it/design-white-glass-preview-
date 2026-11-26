import { describe, expect, it } from 'vitest'
import type { EsnAnswers } from '@bellum/contracts'
import { ONBOARDING_ESSENTIAL_BLOCKS, essentialBlocksProgress, firstPendingEssentialKey } from './onboarding-essentials'
import { TEMPS1_CATALOGUE_SUBSTEPS } from './questions'
import { COMPLEMENT_QUESTIONS } from './complement-questions'

const answers = (partial: Record<string, unknown>): EsnAnswers => partial as unknown as EsnAnswers

describe('Théo O onboarding-essentiel — les 5 blocs, 18 repères', () => {
  it('compte 5 blocs et 18 repères, dans l’ordre de la maquette', () => {
    expect(ONBOARDING_ESSENTIAL_BLOCKS.map(b => b.keys.length)).toEqual([4, 3, 4, 4, 3])
    expect(ONBOARDING_ESSENTIAL_BLOCKS.flatMap(b => b.keys)).toHaveLength(18)
  })

  it('ne nomme que des clés du catalogue : rien de renommé, aucune réponse déjà donnée perdue', () => {
    const known = new Set<string>([
      ...TEMPS1_CATALOGUE_SUBSTEPS.flatMap(s => s.questions.map(q => q.key as string)),
      ...COMPLEMENT_QUESTIONS.map(q => q.key as string),
    ])
    expect(ONBOARDING_ESSENTIAL_BLOCKS.flatMap(b => b.keys).filter(k => !known.has(k))).toEqual([])
  })

  it('un bloc sans réponse n’est pas « 0 / n traités » mais ses n repères restent à poser', () => {
    const progress = essentialBlocksProgress(answers({}))
    expect(progress.map(p => p.done)).toEqual([0, 0, 0, 0, 0])
    expect(progress.every(p => !p.complete)).toBe(true)
  })

  it('compte les repères répondus par bloc', () => {
    const progress = essentialBlocksProgress(
      answers({ esn_name: 'Altimance', consultant_size: '30-80', user_role: 'agency_director', geo_zones: [] }),
    )
    expect(progress[0]?.done).toBe(2)
    expect(progress[1]?.done).toBe(1)
    expect(progress[3]?.done).toBe(0)
  })

  it('reprend sur le premier repère sans réponse', () => {
    expect(firstPendingEssentialKey(answers({}))).toBe('esn_name')
    expect(firstPendingEssentialKey(answers({ esn_name: 'Altimance' }))).toBe('esn_maturity_situation')
  })

  it('renvoie null quand les 18 repères sont posés', () => {
    const full: Record<string, unknown> = {}
    for (const key of ONBOARDING_ESSENTIAL_BLOCKS.flatMap(b => b.keys)) full[key] = ['x']
    expect(firstPendingEssentialKey(answers(full))).toBeNull()
  })
})
