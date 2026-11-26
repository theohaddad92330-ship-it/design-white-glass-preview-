import type { OrgGraphCorrection } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { ContactCorrectionsHistory } from './ContactCorrectionsHistory'

/**
 * #2150.60 — « la fiche Contact conserve les corrections. »
 *
 * Réutilise le MÊME endpoint que l'onglet Organigramme du compte
 * (`GET /accounts/:accountId/org-graph/corrections`, GA-26) — aucune route
 * neuve. Ce composant ne fait que le FILTRER sur CE contact
 * (`contactCorrectionsFor`) et l'afficher, sous un vocabulaire propre à la
 * fiche (pas de bouton « Annuler » ici : ce geste reste sur l'Organigramme,
 * qui porte le verrou de version).
 */
const entry = (over: Partial<OrgGraphCorrection>): OrgGraphCorrection => ({
  id: 'c-1',
  workspaceId: 'w-1',
  accountId: 'acc-1',
  graphVersionBefore: 1,
  graphVersionAfter: 2,
  objectType: 'person',
  objectId: 'contact-1',
  field: 'title',
  oldValue: 'DSI adjoint',
  newValue: 'DSI',
  reason: 'Vu sur LinkedIn',
  evidence: { kind: 'linkedin', claim: 'title' },
  userId: 'u-1',
  createdAt: '2026-08-21T10:00:00.000Z',
  revertedAt: null,
  motive: 'corrected',
  scope: 'account',
  visibility: 'workspace',
  ...over,
})

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ContactCorrectionsHistory accountId="acc-1" contactId="contact-1" />
    </QueryClientProvider>,
  )
}

describe('ContactCorrectionsHistory — #2150.60', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('appelle le MÊME endpoint que l’Organigramme du compte — aucune route neuve', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [] })
    renderCard()
    expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/accounts/acc-1/org-graph/corrections' }))
    await screen.findByText("Personne n'a encore corrigé ce contact.")
  })

  it('affiche une correction qui concerne CE contact', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [entry({})] })
    renderCard()
    expect(await screen.findByText(/DSI adjoint/)).toBeInTheDocument()
  })

  it('écarte une correction posée sur un AUTRE contact du même compte', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [entry({ objectId: 'contact-2' })] })
    renderCard()
    expect(await screen.findByText("Personne n'a encore corrigé ce contact.")).toBeInTheDocument()
  })

  it('un échec de lecture le DIT — jamais « aucune correction »', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('502'))
    renderCard()
    expect(await screen.findByTestId('contact-corrections-error')).toBeInTheDocument()
    expect(screen.queryByText("Personne n'a encore corrigé ce contact.")).not.toBeInTheDocument()
  })

  it('une correction ANNULÉE reste visible, marquée', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [entry({ revertedAt: '2026-08-25T10:00:00.000Z' })] })
    renderCard()
    expect(await screen.findByText('Annulée')).toBeInTheDocument()
  })
})
