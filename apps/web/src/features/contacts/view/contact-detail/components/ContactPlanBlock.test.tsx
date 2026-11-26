import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionPlanItem, Contact } from '@bellum/contracts'
import { MANUAL_ACTION_WEEK_INDEX } from '@bellum/contracts'
import { ContactPlanBlock } from './ContactPlanBlock'

const state = vi.hoisted(() => ({ items: [] as unknown[], loading: false, mutate: vi.fn(), pending: false }))
vi.mock('@/features/actions/hooks/usePlanItems', () => ({
  usePlanItems: () => ({ items: state.items, isLoading: state.loading, itemFor: () => undefined }),
}))
vi.mock('@/features/contacts/hooks/usePrepareContactPlan', () => ({
  usePrepareContactPlan: () => ({ mutate: state.mutate, isPending: state.pending }),
}))
vi.mock('@/features/accounts/view/account-detail/tabs/plan/PlanStepsList', () => ({
  PlanStepsList: ({ steps, title }: { steps: { label: string }[]; title: string }) => (
    <section aria-label={title}>
      {steps.map(s => (
        <p key={s.label}>{s.label}</p>
      ))}
    </section>
  ),
}))

const claire = {
  id: 'c1',
  account_id: 'acc-1',
  full_name: 'Claire Martin',
  email: 'claire@acme.test',
  phone: null,
  linkedin_url: null,
} as unknown as Contact

const item = (over: Partial<ActionPlanItem>) =>
  ({
    id: 'i',
    label: 'x',
    week_index: MANUAL_ACTION_WEEK_INDEX,
    step_index: 0,
    done: false,
    channel: 'email',
    contact_id: 'c1',
    ...over,
  }) as ActionPlanItem

describe('ContactPlanBlock (#4416)', () => {
  beforeEach(() => {
    state.items = []
    state.loading = false
    state.pending = false
    state.mutate.mockClear()
  })

  it('contact visé par 2 étapes → « Plan pour Claire » en montre 2, sans bouton de génération', () => {
    state.items = [
      item({ id: 'a', label: 'Envoyer un e-mail à Claire Martin' }),
      item({ id: 'b', step_index: 1, label: 'Relancer Claire Martin' }),
    ]
    render(<ContactPlanBlock contact={claire} rawAnalysis={{}} />)
    expect(screen.getByRole('region', { name: 'Plan pour Claire' })).toBeInTheDocument()
    expect(screen.getAllByText(/Claire Martin/)).toHaveLength(2)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('contact sans étape → un bouton « Préparer un plan pour Claire », jamais « 0 », jamais de liste vide', async () => {
    const { container } = render(<ContactPlanBlock contact={claire} rawAnalysis={{}} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0\b/)
    await userEvent.click(screen.getByRole('button', { name: 'Préparer un plan pour Claire' }))
    expect(state.mutate).toHaveBeenCalledTimes(1)
  })

  it('les étapes d’un autre contact ou déjà faites ne comptent pas', () => {
    state.items = [item({ contact_id: 'c2' }), item({ id: 'd', done: true })]
    render(<ContactPlanBlock contact={claire} rawAnalysis={{}} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Préparer un plan pour Claire' })).toBeInTheDocument()
  })

  it('sans aucun canal joignable ni étape → rien (la génération refuserait)', () => {
    const lonely = { ...claire, email: null } as Contact
    const { container } = render(<ContactPlanBlock contact={lonely} rawAnalysis={{}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('plan en cours de chargement → rien (le zéro de chargement n’est pas « aucune étape »)', () => {
    state.loading = true
    const { container } = render(<ContactPlanBlock contact={claire} rawAnalysis={{}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('contact sans compte → rien', () => {
    const { container } = render(
      <ContactPlanBlock contact={{ ...claire, account_id: null } as Contact} rawAnalysis={{}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
