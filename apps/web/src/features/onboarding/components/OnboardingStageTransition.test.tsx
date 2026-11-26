import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TEMPS1_STAGES, TEMPS1_SUBSTEPS } from '@/features/onboarding/lib/questions'
import { OnboardingStageTransition, isStageEntry } from './OnboardingStageTransition'

/**
 * #2087.19 / #2087.20 — l'écran de transition court à l'entrée de chaque
 * étape : le titre de l'étape, une phrase de sens, un seul CTA « Continuer ».
 */
describe('OnboardingStageTransition', () => {
  it('#2087.20 — titre d’étape + phrase de sens + CTA « Continuer »', () => {
    const onContinue = vi.fn()
    const offer = TEMPS1_STAGES.findIndex(stage => stage.code === 'offer_expertise')
    render(<OnboardingStageTransition stageIndex={offer} onContinue={onContinue} />)

    expect(screen.getByRole('heading', { name: 'Ton offre' })).toBeInTheDocument()
    expect(
      screen.getByText('Je vais distinguer ce que tu sais déjà vendre de ce que tu souhaites développer.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('#2087.19 — chaque étape du parcours a SA phrase de sens (aucune clé brute affichée)', () => {
    TEMPS1_STAGES.forEach((stage, index) => {
      const { unmount } = render(<OnboardingStageTransition stageIndex={index} onContinue={vi.fn()} />)
      const meaning = screen.getByTestId('onboarding-stage-transition-meaning').textContent ?? ''
      expect(meaning, stage.code).not.toMatch(/stageTransition\./)
      expect(meaning.length, stage.code).toBeGreaterThan(20)
      unmount()
    })
  })
})

describe('isStageEntry', () => {
  it('#2087.19 — vrai sur la PREMIÈRE sous-étape de chaque étape, faux ailleurs', () => {
    const entries = TEMPS1_SUBSTEPS.filter(isStageEntry)
    // Une entrée par étape effectivement posée au Temps 1, dans l'ordre.
    expect(entries.map(sub => sub.stageCode)).toEqual([...new Set(TEMPS1_SUBSTEPS.map(sub => sub.stageCode))])
    const second = TEMPS1_SUBSTEPS.find(
      (sub, index) => index > 0 && TEMPS1_SUBSTEPS[index - 1]?.stageIndex === sub.stageIndex,
    )
    expect(second && isStageEntry(second)).toBe(false)
  })
})
