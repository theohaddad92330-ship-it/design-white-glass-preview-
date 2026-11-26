import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import {
  ContactEngagementContext,
  type ContactEngagementContextValue,
} from '../../components/contact-engagement/ContactEngagementContext'
import { PlanStepsList } from './PlanStepsList'
import { toast } from 'sonner'
import type { PlanStepView } from './planSteps'

vi.mock('@/features/team-guardrails/components/ColleagueContactDialog', () => ({
  useColleagueContactGuard: () => ({ run: (action: () => void) => action(), dialog: null }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const claire = { id: 'c1', full_name: 'Claire Martin' } as Contact
const step = (over: Partial<PlanStepView>): PlanStepView => ({
  number: 1,
  weekIndex: 0,
  stepIndex: 0,
  label: 'Premier contact',
  channel: 'email',
  recipient: 'Claire Martin',
  contact: claire,
  message: 'Bonjour Claire',
  ...over,
})

const openEngagement = vi.fn()
const wrap = (children: ReactNode) => (
  <ContactEngagementContext.Provider value={{ openEngagement } as unknown as ContactEngagementContextValue}>
    {children}
  </ContactEngagementContext.Provider>
)

describe('PlanStepsList — #4399.6 largeur et répétition', () => {
  it('toutes les cartes d’étape ont la même largeur : pleine largeur, jamais rétrécies par leur contenu', () => {
    const { container } = render(
      wrap(
        <PlanStepsList
          steps={[step({ number: 1 }), step({ number: 2, stepIndex: 1 })]}
          rawAnalysis={{}}
          title="Étapes"
        />,
      ),
    )
    const cards = Array.from(container.querySelectorAll('ol > li'))
    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(card.className).toContain('w-full')
      expect(card.className).toContain('min-w-0')
    }
  })
  it('une étape qui répète le message de la précédente le renvoie au lieu de le réécrire', () => {
    render(
      wrap(
        <PlanStepsList
          steps={[step({ number: 1 }), step({ number: 2, stepIndex: 1, sameMessageAs: 1 })]}
          rawAnalysis={{}}
          title="Étapes"
        />,
      ),
    )
    expect(screen.getAllByTestId('plan-step-message')).toHaveLength(1)
    expect(screen.getByTestId('plan-step-same-message')).toBeInTheDocument()
  })
})

describe('PlanStepsList (#4415)', () => {
  beforeEach(() => {
    openEngagement.mockClear()
  })

  it('e-mail : « Préparer » ouvre le préparateur e-mail du contact, sans rien envoyer', async () => {
    const raw = { plan: {} }
    render(wrap(<PlanStepsList title="Tes trois prochaines étapes" steps={[step({})]} rawAnalysis={raw} />))
    expect(screen.getByText('Claire Martin')).toBeInTheDocument()
    expect(screen.getByText('Bonjour Claire')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Préparer' }))
    // #4415.2 — l'angle de l'étape voyage avec l'ouverture : un panneau à champ d'angle vide = rouge.
    expect(openEngagement).toHaveBeenCalledWith([claire], 'email', {
      rawAnalysis: raw,
      initialContext: 'Premier contact',
    })
  })

  it('LinkedIn : « Copier le message », pas de préparateur e-mail', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(
      wrap(
        <PlanStepsList title="t" steps={[step({ channel: 'linkedin', message: 'Salut Claire' })]} rawAnalysis={{}} />,
      ),
    )
    expect(screen.queryByRole('button', { name: 'Préparer' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copier le message' }))
    expect(writeText).toHaveBeenCalledWith('Salut Claire')
    expect(openEngagement).not.toHaveBeenCalled()
  })

  it('aucune étape → aucun bloc', () => {
    const { container } = render(
      wrap(<PlanStepsList title="Tes trois prochaines étapes" steps={[]} rawAnalysis={{}} />),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['linkedin', 'Copier le message'],
    ['phone', 'Copier le script'],
  ] as const)(
    '#4415.2 — étape %s sans message prêt : le geste « %s » existe quand même (texte de l’étape)',
    async (channel, name) => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      render(wrap(<PlanStepsList title="t" steps={[step({ channel, message: '' })]} rawAnalysis={{}} />))
      const button = screen.getByRole('button', { name })
      expect(button.className).toContain('min-h-11')
      await userEvent.click(button)
      expect(writeText).toHaveBeenCalledWith('Premier contact')
      expect(toast.success).toHaveBeenCalled()
    },
  )

  it('#4415.2 — étape sans destinataire connu : le geste de copie reste là, jamais de préparateur', () => {
    render(
      wrap(
        <PlanStepsList title="t" steps={[step({ channel: 'phone', contact: null, message: '' })]} rawAnalysis={{}} />,
      ),
    )
    expect(screen.getByRole('button', { name: 'Copier le script' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Préparer' })).not.toBeInTheDocument()
  })

  it('#4415.2 — étape e-mail dont le destinataire n’est pas résolu : jamais un bouton absent, la copie du message', () => {
    render(wrap(<PlanStepsList title="t" steps={[step({ contact: null, message: '' })]} rawAnalysis={{}} />))
    expect(screen.getByRole('button', { name: 'Copier le message' })).toBeInTheDocument()
  })

  it('#4415.2 — toutes les étapes ont la même largeur (w-full), la 1re comme les autres', () => {
    render(wrap(<PlanStepsList title="t" steps={[step({ message: '' }), step({ number: 2 })]} rawAnalysis={{}} />))
    for (const li of screen.getAllByRole('listitem')) expect(li.className).toContain('w-full')
  })
})
