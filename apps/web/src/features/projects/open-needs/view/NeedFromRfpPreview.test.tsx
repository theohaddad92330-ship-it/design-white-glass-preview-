import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'

/**
 * #2571 — un appel d'offres transféré devient un besoin EN PRÉVISUALISATION.
 *
 * Ce qui se garde ici : le besoin proposé affiche ses CRITÈRES et ses
 * INCONNUES avant tout clic (#2571.1/#2571.2), et rien n'est écrit tant que
 * l'utilisateur n'a pas choisi un projet et cliqué « Confirmer » (#2571.4 —
 * le garde-fou qui empêche une conversation exploratoire de devenir un besoin
 * confirmé toute seule).
 */
const preview = {
  need: { title: 'Refonte du SI de facturation', skills: [] },
  account_id: 'a-1',
  criteria: [
    { kind: 'issuer' as const, value: 'Client Grand Est' },
    { kind: 'requirement' as const, value: 'Hébergement en France' },
  ],
  unknowns: [
    { kind: 'skills' as const, value: null },
    { kind: 'ambiguous_requirement' as const, value: 'Pénalités de retard non chiffrées' },
  ],
}

const confirmMutate = vi.fn()
vi.mock('../hooks/useRfpNeedPreview', () => ({
  useRfpNeedPreview: () => ({
    preview,
    isLoading: false,
    isError: false,
    confirm: { mutate: confirmMutate, isPending: false },
  }),
}))

vi.mock('@/features/projects/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'p-1', label: 'Refonte SIRH', account_id: 'a-1' }] }),
}))

vi.mock('../hooks/useOpenNeed', () => ({
  useOpenNeed: () => ({
    need: {
      id: 'need-1',
      status: 'to_qualify',
      skills: [],
      deadline_at: null,
      staffable: 'unknown',
      shortlist_count: 0,
      target_tjm_cents: null,
    },
  }),
}))

const { NeedFromRfpPreview } = await import('./NeedFromRfpPreview')

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NeedFromRfpPreview rfpId="rfp-1" onDismiss={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('NeedFromRfpPreview — #2571', () => {
  it('affiche les critères ET les inconnues NOMMÉES, sans rien confirmer', () => {
    draw()
    expect(screen.getByText(/Client Grand Est/)).toBeInTheDocument()
    expect(screen.getByText(/Hébergement en France/)).toBeInTheDocument()
    expect(screen.getByText(/Pénalités de retard non chiffrées/)).toBeInTheDocument()
    // #2571.4 — rien n'est écrit tant que personne n'a cliqué.
    expect(confirmMutate).not.toHaveBeenCalled()
  })

  it('le bouton de confirmation est désactivé tant qu’aucun projet n’est choisi', () => {
    draw()
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled()
  })

  it('ne propose que les projets DU COMPTE concerné', async () => {
    draw()
    const values = (await import('@/test/select')).optionValues
    const options = await values(screen.getByRole('combobox', { name: /projet/i }))
    expect(options).toContain('p-1')
  })

  it('confirme avec le projet CHOISI, jamais deviné', async () => {
    draw()
    await chooseOption(screen.getByRole('combobox', { name: /projet/i }), 'Refonte SIRH')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(confirmMutate).toHaveBeenCalledWith('p-1', expect.anything())
  })
})
