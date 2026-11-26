import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LinkedinDraft } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { LinkedinLookup } from './LinkedinLookup'
import { useLinkedinLookup } from '../hooks'

vi.mock('../hooks', () => ({ useLinkedinLookup: vi.fn() }))

// H-DECISIONS #4348 — l'URL d'un profil pré-remplit la fiche ; le fournisseur ne se nomme JAMAIS.

const DRAFT: LinkedinDraft = {
  full_name: 'Nadia Benali',
  title: 'Lead Data Engineer',
  public_profile_url: 'https://www.linkedin.com/in/nadia-benali',
  email: null,
  phone: null,
  cv_text: 'Lead Data Engineer · Nordia · 2021-03 – aujourd’hui',
  stack: [],
  missing: ['email', 'phone', 'stack'],
  source: 'linkedin_profile',
}

function mockLookup(mutate: ReturnType<typeof vi.fn>, state: Record<string, unknown> = {}) {
  vi.mocked(useLinkedinLookup).mockReturnValue({
    mutate,
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
    ...state,
  } as unknown as ReturnType<typeof useLinkedinLookup>)
}

describe('LinkedinLookup — #4348', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('n’appelle personne au montage, et ne chiffre aucun coût (#4463)', () => {
    const mutate = vi.fn()
    mockLookup(mutate)
    render(<LinkedinLookup onDraft={vi.fn()} />)
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  it('refuse une adresse qui n’est pas linkedin.com/in/<slug> sans appeler le serveur', () => {
    const mutate = vi.fn()
    mockLookup(mutate)
    render(<LinkedinLookup onDraft={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Adresse du profil/), { target: { value: 'https://exemple.com/in/x' } })
    fireEvent.click(screen.getByRole('button', { name: /Pré-remplir/ }))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/linkedin\.com\/in/)
  })

  it('envoie l’URL et remet le brouillon au formulaire', () => {
    const onDraft = vi.fn()
    const mutate = vi.fn((_url: string, opts: { onSuccess: (r: unknown) => void }) =>
      opts.onSuccess({ found: true, draft: DRAFT }),
    )
    mockLookup(mutate)
    render(<LinkedinLookup onDraft={onDraft} />)
    fireEvent.change(screen.getByLabelText(/Adresse du profil/), {
      target: { value: 'https://www.linkedin.com/in/nadia-benali' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Pré-remplir/ }))
    expect(mutate.mock.calls[0]?.[0]).toBe('https://www.linkedin.com/in/nadia-benali')
    expect(onDraft).toHaveBeenCalledWith(DRAFT)
    expect(screen.getByRole('status')).toHaveTextContent(/relis/i)
  })

  it('#4348.4 — dit ce que le profil n’a pas rendu, sans le deviner', () => {
    const mutate = vi.fn((_url: string, opts: { onSuccess: (r: unknown) => void }) =>
      opts.onSuccess({ found: true, draft: DRAFT }),
    )
    mockLookup(mutate)
    render(<LinkedinLookup onDraft={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Adresse du profil/), {
      target: { value: 'https://www.linkedin.com/in/nadia-benali' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Pré-remplir/ }))
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/non trouvé/i)
    expect(status).toHaveTextContent(/e-mail/i)
    expect(status).toHaveTextContent(/téléphone/i)
    expect(status).toHaveTextContent(/compétences/i)
    expect(status).not.toHaveTextContent(/intitulé/i)
  })

  it('profil introuvable : le message renvoie vers le texte collé, et NE pré-remplit RIEN', () => {
    const onDraft = vi.fn()
    const mutate = vi.fn((_url: string, opts: { onSuccess: (r: unknown) => void }) =>
      opts.onSuccess({ found: false, code: 'profile_not_found' }),
    )
    mockLookup(mutate)
    render(<LinkedinLookup onDraft={onDraft} />)
    fireEvent.change(screen.getByLabelText(/Adresse du profil/), {
      target: { value: 'linkedin.com/in/inconnu' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Pré-remplir/ }))
    expect(onDraft).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Profil introuvable — colle le texte du profil.')
  })

  it('solde épuisé (402) : frein doux SANS chiffre, ne parle ni de crédits ni de panne (#4463)', () => {
    mockLookup(vi.fn(), { isError: true, error: new ApiError('Crédits épuisés', 402) })
    render(<LinkedinLookup onDraft={vi.fn()} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/Tu as beaucoup utilisé .* ce mois-ci/)
    expect(alert).not.toHaveTextContent(/crédit|panne/i)
  })

  it('ne nomme jamais le fournisseur', () => {
    mockLookup(vi.fn())
    const { container } = render(<LinkedinLookup onDraft={vi.fn()} />)
    expect(container.textContent).not.toMatch(/apollo/i)
  })
})
