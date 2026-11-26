import type { Contact } from '@bellum/contracts'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EnrichThenPrepareButton } from './EnrichThenPrepareButton'

const enrich = vi.fn()
let captured: { onEnriched?: (result: Contact) => void } | undefined
let disabled = false
vi.mock('../contact-detail/components/ContactEnrichButton', () => ({
  useContactEnrich: (_contact: Contact, options?: { onEnriched?: (result: Contact) => void }) => {
    captured = options
    return { enrich, enriching: false, disabled, hint: 'indice', buttonLabel: (label?: string) => label ?? 'Enrichir' }
  },
  ContactEnrichConfirm: () => <div data-testid="enrich-confirm" />,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
  }: {
    children: React.ReactNode
    params: { id: string; channel?: string }
    to: string
  }) => <a href={`${to}|${params.id}|${params.channel ?? ''}`}>{children}</a>,
}))

const contact = { id: 'c1', full_name: 'Paul Ferrer', email: null } as unknown as Contact

beforeEach(() => {
  vi.clearAllMocks()
  captured = undefined
  disabled = false
})

// #4981.1 — un seul bouton : confirmation (coût) → enrichissement → préparation.
describe('EnrichThenPrepareButton — #4981', () => {
  it('un clic arme la confirmation de coût existante, rien n’est préparé encore', async () => {
    const onPrepare = vi.fn()
    render(<EnrichThenPrepareButton contact={contact} onPrepare={onPrepare} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enrichir puis préparer' }))
    expect(enrich).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('enrich-confirm')).toBeInTheDocument()
    expect(onPrepare).not.toHaveBeenCalled()
  })

  it('enrichissement réussi avec un e-mail trouvé : la préparation part', () => {
    const onPrepare = vi.fn()
    render(<EnrichThenPrepareButton contact={contact} onPrepare={onPrepare} />)
    act(() => captured?.onEnriched?.({ ...contact, email: 'paul@altiver.fr' }))
    expect(onPrepare).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('enrich-no-email')).toBeNull()
  })

  // #4981.3 — sans e-mail trouvé : on le dit, on propose LinkedIn, on ne prépare rien.
  it('aucun e-mail trouvé : message + bascule LinkedIn, aucune préparation', () => {
    const onPrepare = vi.fn()
    render(<EnrichThenPrepareButton contact={contact} onPrepare={onPrepare} />)
    act(() => captured?.onEnriched?.({ ...contact, email: null }))
    expect(onPrepare).not.toHaveBeenCalled()
    expect(screen.getByTestId('enrich-no-email')).toHaveTextContent(/aucun e-mail trouvé/i)
    expect(screen.getByRole('link', { name: /réseau professionnel/ })).toHaveAttribute(
      'href',
      '/contacts/$id/approach/$channel|c1|linkedin',
    )
  })

  it('désactivé (crédit, société inconnue) : le bouton l’est aussi et garde son indice', () => {
    disabled = true
    render(<EnrichThenPrepareButton contact={contact} onPrepare={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Enrichir puis préparer' })).toBeDisabled()
  })
})
