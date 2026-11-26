import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2323.10 / #2323.11 — les motifs de clôture « expiré » / « non pertinent »,
 * PAR L'INTERACTION.
 *
 * ⚠️ Avant ce fichier, `NeedActionsMenu.tsx` n'avait AUCUN test : le lot
 * précédent (25/09) a justement déprioritisé ces deux points faute de ce
 * test — écrire les presets sans lui aurait pu les poser sur un dialogue
 * inerte sans que rien ne le prouve (leçon `#2692`, mesurer dans un test qui
 * clique réellement, pas seulement un test de source).
 *
 * `status_reason` était déjà du texte libre sur `cancelled` — ces deux motifs
 * sont donc juste NOMMÉS, comme `DEFAULT_UNSTAFFABLE_REASONS` (staffable-gate.ts)
 * le fait déjà pour G3 : des raccourcis qui remplissent le champ, jamais une
 * valeur fermée qui remplacerait le texte libre.
 */
type ApiCall = { path: string; method?: string; body?: unknown }
const apiFetch = vi.fn(async (_args: ApiCall): Promise<unknown> => ({}))
vi.mock('@/lib/api', () => ({ apiFetch: (args: ApiCall) => apiFetch(args) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [], isLoading: false }),
}))

const { NeedActionsMenu } = await import('./NeedActionsMenu')

function need(id: string) {
  return {
    id,
    status: 'qualified' as const,
    skills: [{ term: 'React', required: true, level: null }],
    archived_at: null,
  }
}

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NeedActionsMenu needs={[need('n-1')]} trigger={<button type="button">Actions</button>} />
    </QueryClientProvider>,
  )
}

describe('les presets de motif de clôture', () => {
  it('propose « Expiré » et « Non pertinent » sur le dialogue d’annulation, et rien sur celui de perte', async () => {
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Marquer annulé…' }))

    expect(await screen.findByRole('button', { name: 'Expiré' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Non pertinent' })).toBeInTheDocument()

    // Fermer et rouvrir sur « Marquer perdu » : les presets d'annulation ne
    // doivent PAS s'y retrouver — perdu et annulé ne fusionnent jamais.
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Marquer perdu…' }))
    expect(screen.queryByRole('button', { name: 'Expiré' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Non pertinent' })).toBeNull()
  })

  it('remplit le motif au clic sur « Expiré », et l’envoie tel quel', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Marquer annulé…' }))

    const confirm = screen.getByRole('button', { name: 'Marquer annulé' })
    expect(confirm).toBeDisabled()

    await user.click(await screen.findByRole('button', { name: 'Expiré' }))
    expect(screen.getByRole('textbox', { name: 'Motif de l’annulation' })).toHaveValue('Expiré')
    expect(confirm).toBeEnabled()

    await user.click(confirm)

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1/status',
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'Expiré' },
    })
  })

  it('un preset REMPLACE le texte déjà tapé, il ne s’y ajoute pas', async () => {
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Marquer annulé…' }))

    await user.type(screen.getByRole('textbox', { name: 'Motif de l’annulation' }), 'Brouillon')
    await user.click(screen.getByRole('button', { name: 'Non pertinent' }))

    expect(screen.getByRole('textbox', { name: 'Motif de l’annulation' })).toHaveValue('Non pertinent')
  })
})

describe('#3389.13 — la mise en veille porte sa date de reprise', () => {
  async function openHold(user: ReturnType<typeof userEvent.setup>) {
    draw()
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mettre en veille…' }))
    await user.type(screen.getByRole('textbox', { name: 'Motif de la mise en veille' }), 'Budget gelé')
  }

  it('envoie resume_on quand la date est posée', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    await openHold(user)

    fireEvent.change(screen.getByLabelText('Reprise prévue le (facultatif)'), { target: { value: '2099-01-15' } })
    await user.click(screen.getByRole('button', { name: 'Mettre en veille' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1/status',
      method: 'PATCH',
      body: { status: 'on_hold', reason: 'Budget gelé', resume_on: '2099-01-15' },
    })
  })

  it('⚠️ sans date, la clé n’est PAS envoyée — une veille sans échéance, jamais une date devinée', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    await openHold(user)

    await user.click(screen.getByRole('button', { name: 'Mettre en veille' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch.mock.calls[0]?.[0]).toEqual({
      path: '/projects/needs/n-1/status',
      method: 'PATCH',
      body: { status: 'on_hold', reason: 'Budget gelé' },
    })
  })

  it('le champ date n’existe QUE sur la veille, pas sur une perte', async () => {
    const user = userEvent.setup()
    draw()
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Marquer perdu…' }))
    expect(screen.queryByLabelText('Reprise prévue le (facultatif)')).toBeNull()
  })
})
