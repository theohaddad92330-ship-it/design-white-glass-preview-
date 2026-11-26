import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LinkedinDraft } from '@bellum/contracts'
import { ConsultantFormDialog } from './ConsultantFormDialog'
import { useLinkedinLookup } from '../hooks'

// H-DECISIONS #4348 — l'adresse d'un profil pré-remplit la modale d'AJOUT ; la fiche reste éditable
// et l'enregistrement porte la source ; en ÉDITION le geste n'existe pas.
vi.mock('../hooks', () => ({ useLinkedinLookup: vi.fn(), useCvIntake: vi.fn() }))
vi.mock('../talent-api', () => ({
  useTalentDuplicates: vi.fn(() => ({ data: undefined })),
  useSkillSuggestion: vi.fn(() => ({ data: undefined })),
}))

const DRAFT: LinkedinDraft = {
  full_name: 'Nadia Benali',
  title: 'Lead Data Engineer',
  public_profile_url: 'https://www.linkedin.com/in/nadia-benali',
  email: null,
  phone: null,
  cv_text: 'Lead Data Engineer · Nordia · 2021-03 – aujourd’hui',
  stack: [],
  missing: ['stack'],
  source: 'linkedin_profile',
}

function renderDialog() {
  const onSubmit = vi.fn()
  vi.mocked(useLinkedinLookup).mockReturnValue({
    mutate: (_url: string, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess({ found: true, draft: DRAFT }),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useLinkedinLookup>)
  render(<ConsultantFormDialog open consultant={null} saving={false} onClose={vi.fn()} onSubmit={onSubmit} />)
  return onSubmit
}

describe('ConsultantFormDialog — pré-remplir depuis un profil LinkedIn (#4348)', () => {
  afterEach(cleanup)

  it('le geste s’ouvre à la demande, pré-remplit, reste éditable et envoie la source', () => {
    const onSubmit = renderDialog()
    expect(screen.queryByLabelText(/Adresse du profil/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Pré-remplir depuis/ }))
    fireEvent.change(screen.getByLabelText(/Adresse du profil/), {
      target: { value: 'https://www.linkedin.com/in/nadia-benali' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pré-remplir la fiche' }))

    const name = screen.getByDisplayValue('Nadia Benali')
    fireEvent.change(name, { target: { value: 'Nadia B. Benali' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'Nadia B. Benali',
        title: 'Lead Data Engineer',
        source: 'linkedin_profile',
        public_profile_url: DRAFT.public_profile_url,
      }),
      expect.anything(),
    )
  })
})
