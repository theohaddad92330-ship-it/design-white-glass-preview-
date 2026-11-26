import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactImportNextSteps } from './ContactImportNextSteps'

// #2197.43 — même parti pris que les autres écrans qui posent `<AskLaura>` :
// la bulle du copilote a ses propres tests, celui-ci prouve seulement que le
// GESTE est proposé.
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

const mockApiFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

/**
 * #2159.64/.65/.66 — les trois CTA après un import de contacts réussi.
 * #2159.63 (« Voir les exceptions ») ci-dessous : le bouton n'apparaît QUE
 * quand `skippedDetails` en porte, et le panneau nomme la raison RÉELLE.
 */
describe('ContactImportNextSteps', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it('montre les trois gestes, avec le nom du compte en portée', async () => {
    renderWithRouter(<ContactImportNextSteps accountId="acc-1" companyName="Thales" />)

    expect(await screen.findByRole('button', { name: /Créer une première cible/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mettre à jour mon audit/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Demander à Laura/ })).toBeInTheDocument()
  })

  it("n'affiche aucun bouton « Voir les exceptions » quand il n'y a rien à voir", async () => {
    renderWithRouter(<ContactImportNextSteps accountId="acc-1" companyName="Thales" />)

    await screen.findByRole('button', { name: /Créer une première cible/ })
    expect(screen.queryByRole('button', { name: /exception/i })).not.toBeInTheDocument()
  })

  it('« Voir les exceptions » liste chaque ligne écartée avec sa raison réelle (#2159.63)', async () => {
    renderWithRouter(
      <ContactImportNextSteps
        accountId="acc-1"
        companyName="Thales"
        skippedDetails={[
          { full_name: 'Jean Dupont', reason: 'duplicate' },
          { full_name: '', reason: 'blank_name' },
        ]}
      />,
    )

    const toggle = await screen.findByRole('button', { name: /Voir les exceptions/ })
    expect(screen.queryByText('Lignes non importées')).not.toBeInTheDocument()

    await userEvent.click(toggle)

    expect(screen.getByText('Lignes non importées')).toBeInTheDocument()
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
    expect(screen.getByText('Déjà connu (doublon)')).toBeInTheDocument()
    expect(screen.getByText('Nom manquant')).toBeInTheDocument()
  })

  it('« Mettre à jour mon audit » renvoie vers CE dossier', async () => {
    renderWithRouter(<ContactImportNextSteps accountId="acc-42" companyName="Thales" />)

    expect(await screen.findByRole('link', { name: /Mettre à jour mon audit/ })).toHaveAttribute(
      'href',
      '/accounts/acc-42',
    )
  })

  it('« Créer une première cible » crée une liste seedée avec ce compte', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'list-1',
        name: 'Thales',
        objective: null,
        type: null,
        owner_user_id: null,
        team: null,
        visibility: 'private',
        source: 'analysis',
        source_query: null,
        status: 'draft',
        counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
        next_action: null,
        sequence_id: null,
        prospecting_session_id: null,
        created_by: 'user-1',
        created_at: '2026-09-23T00:00:00.000Z',
        updated_at: '2026-09-23T00:00:00.000Z',
        items: [],
      })
      .mockResolvedValueOnce({
        id: 'item-1',
        target_list_id: 'list-1',
        kind: 'account',
        ref_id: 'acc-1',
        label: 'Thales',
        sublabel: null,
        selection_reason: null,
        priority: null,
        owner_user_id: null,
        work_status: 'to_review',
        provenance: 'analysis',
        refreshed_at: null,
        removed_at: null,
        removal_reason: null,
        next_action: null,
        notes: null,
        created_at: '2026-09-23T00:00:00.000Z',
        updated_at: '2026-09-23T00:00:00.000Z',
      })

    renderWithRouter(<ContactImportNextSteps accountId="acc-1" companyName="Thales" />)

    await userEvent.click(await screen.findByRole('button', { name: /Créer une première cible/ }))

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2))
    const [createCall, addItemCall] = mockApiFetch.mock.calls as [{ path: string; method: string; body: unknown }][]
    expect(createCall[0]).toMatchObject({ path: '/target-lists', method: 'POST', body: { name: 'Thales' } })
    expect(addItemCall[0]).toMatchObject({
      path: '/target-lists/list-1/items',
      method: 'POST',
      body: { kind: 'account', ref_id: 'acc-1' },
    })
  })
})
