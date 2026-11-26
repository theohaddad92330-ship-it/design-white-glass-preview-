import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { i18n } from '@/i18n'

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  trigger: vi.fn().mockResolvedValue(true),
  state: { status: 'completed', awaiting_company_admin: null } as unknown as OnboardingStateResponse,
  credits: { is_demo: false } as { is_demo: boolean } | null,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({ useOnboardingState: () => ({ data: h.state }) }))
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: () => ({ data: h.credits }) }))
vi.mock('@/features/profile/hooks/useReconfigureOnboarding', () => ({
  useReconfigureOnboarding: () => ({ available: true, alreadyRequested: false, pending: false, trigger: h.trigger }),
}))

const { OnboardingPermanentLink } = await import('./OnboardingPermanentLink')

const renderLink = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <OnboardingPermanentLink />
    </I18nextProvider>,
  )

beforeEach(() => {
  h.navigate.mockReset()
  h.trigger.mockClear()
  h.state = { status: 'completed', awaiting_company_admin: null } as unknown as OnboardingStateResponse
  h.credits = { is_demo: false }
})

describe('#4364.2 — le lien permanent vers le questionnaire', () => {
  it('est visible sans aucun drapeau, après un onboarding terminé, et se tabule (bouton ≥ 44 px)', async () => {
    renderLink()
    const link = screen.getByRole('button', { name: /questionnaire/i })
    expect(link.className).toMatch(/min-h-11/)
    await userEvent.click(link)
    // Terminé : `/onboarding` renverrait chez Laura — on rouvre par le geste existant (#2021).
    expect(h.trigger).toHaveBeenCalledTimes(1)
  })

  it('#4364.1 — reporté ou jamais fini (in_progress) : il rouvre /onboarding directement', async () => {
    h.state = { status: 'in_progress', awaiting_company_admin: null } as unknown as OnboardingStateResponse
    renderLink()
    await userEvent.click(screen.getByRole('button', { name: /questionnaire/i }))
    expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding' })
    expect(h.trigger).not.toHaveBeenCalled()
  })

  it('REFUS — un membre qui attend son administrateur ne le voit pas', () => {
    h.state = {
      status: 'in_progress',
      awaiting_company_admin: { admin_name: 'Marie' },
    } as unknown as OnboardingStateResponse
    renderLink()
    expect(screen.queryByRole('button', { name: /questionnaire/i })).toBeNull()
  })

  it('REFUS — l’espace démo ne le voit pas', () => {
    h.credits = { is_demo: true }
    renderLink()
    expect(screen.queryByRole('button', { name: /questionnaire/i })).toBeNull()
  })
})
