import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { AccueilLaura } from './OnboardingAccueilTemps'
import { FramingPage } from './FramingLayout'

vi.mock('@/features/onboarding/components/FramingTopBar', () => ({ FramingTopBar: () => null }))

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('#4970 — « Renseigner mon contexte » dit ce que le contexte apporte', () => {
  it('une phrase sous le bouton nomme ce que recouvre le contexte', () => {
    render(<AccueilLaura onBack={vi.fn()} onNext={vi.fn()} />)
    const hint = screen.getByTestId('onboarding-next-hint')
    expect(hint).toHaveTextContent('ton offre')
    expect(hint).toHaveTextContent('tes clients cibles')
    expect(screen.getByRole('button', { name: 'Renseigner mon contexte' })).toBeInTheDocument()
  })
  it('les autres écrans n’ont pas cette phrase (rien d’inventé ailleurs)', () => {
    render(<div />)
    expect(screen.queryByTestId('onboarding-next-hint')).toBeNull()
  })
})

describe('#4968 — le panneau défile même si la hauteur parente ne se résout pas', () => {
  it('la coque est bornée à la hauteur visible (dvh) et la zone de contenu défile', () => {
    const { container } = render(<FramingPage>contenu</FramingPage>)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('max-h-[calc(100dvh')
    const scroller = container.querySelector('#framing-scroll') as HTMLElement
    expect(scroller.className).toContain('overflow-y-auto')
    expect(scroller.className).toContain('min-h-0')
  })
})
