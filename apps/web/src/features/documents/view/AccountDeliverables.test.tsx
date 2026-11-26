import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import type { AccountLinks } from '@/features/accounts/api'
import type { DataExitGrant } from '@/lib/data-exit'

const downloadDocument = vi.fn()
vi.mock('@/features/documents/api', () => ({ downloadDocument: (...a: unknown[]) => downloadDocument(...a) }))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}))

const accountLinksMock = vi.fn()
vi.mock('@/features/accounts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/accounts/api')>()
  return { ...actual, accountsApi: { ...actual.accountsApi, accountLinks: accountLinksMock } }
})

const createCompanyMock = vi.fn()
vi.mock('@/features/crm/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/crm/api')>()
  return { ...actual, crmApi: { ...actual.crmApi, createCompany: createCompanyMock } }
})

vi.mock('@/features/crm/hooks/useCrmStatus', () => ({ useCrmStatus: vi.fn() }))

const { useDataExit } = await import('@/lib/data-exit')
const { useCrmStatus } = await import('@/features/crm/hooks/useCrmStatus')
const { AccountDeliverables } = await import('@/features/documents/view/AccountDeliverables')

vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })

const noLinks: AccountLinks = { mergedInto: null, linked: [], detachRefusal: null, detachRefusalMessage: null }

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const stubAccount: Account = {
  id: 'acc-1',
  user_id: 'user-1',
  company_name: 'Alpha SAS',
  siren: '123456789',
  sector: 'Édition de logiciels',
  employees: null,
  revenue: null,
  headquarters: null,
  website: null,
  subsidiaries: [],
  it_challenges: [],
  recent_signals: [],
  priority_score: null,
  priority_justification: null,
  raw_analysis: null,
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-15T10:30:00Z',
  last_analyzed_at: '2026-09-10T08:00:00Z',
}

/**
 * #2125.12-21 / #2125.22 — la fiche d'un livrable dit ce qu'elle contient
 * AVANT tout téléchargement, et c'est LA SEULE porte de sortie du fichier.
 */
describe('#2125 — la fiche d’un livrable', () => {
  beforeEach(() => {
    downloadDocument.mockReset()
    accountLinksMock.mockReset().mockResolvedValue(noLinks)
    toastSuccess.mockReset()
    toastError.mockReset()
    createCompanyMock.mockReset()
    // #2125.10 — sans connecteur, c'est le repli PAR DÉFAUT de tous les tests
    // qui ne testent pas explicitement l'export CRM : no-op strict.
    vi.mocked(useCrmStatus).mockReturnValue({ data: { connected: false } } as unknown as ReturnType<
      typeof useCrmStatus
    >)
  })

  it('un clic sur le format ouvre sa fiche — aucun téléchargement immédiat', async () => {
    wrap(<AccountDeliverables account={stubAccount} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }))

    expect(downloadDocument).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Télécharger' })).toBeInTheDocument()
  })

  it('la fiche du dossier (PDF) affiche les neuf descripteurs, avec le contenu partagé du dossier', async () => {
    wrap(<AccountDeliverables account={stubAccount} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }))

    expect(screen.getByText('Contenu inclus')).toBeInTheDocument()
    expect(screen.getByText(/Identité, Lecture .+, Signaux récents, Interlocuteurs/)).toBeInTheDocument()
    expect(screen.getByText('Version')).toBeInTheDocument()
    expect(screen.getByText('Modèle de contenu v1')).toBeInTheDocument()
    expect(screen.getByText('Périmètre')).toBeInTheDocument()
    expect(screen.getByText(/Ce compte uniquement — Alpha SAS/)).toBeInTheDocument()
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getByText('Fraîcheur')).toBeInTheDocument()
    expect(screen.getByText('Données exclues')).toBeInTheDocument()
    expect(screen.getByText('Permissions')).toBeInTheDocument()
    expect(screen.getByText('Visible par toute l’équipe de l’espace')).toBeInTheDocument()
    expect(screen.getByText('Coût')).toBeInTheDocument()
    // #4463 — « Inclus dans ton abonnement », sans « aucun crédit débité ».
    expect(screen.getByText('Inclus dans ton abonnement')).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(screen.getByText('État')).toBeInTheDocument()
    expect(screen.getByText('Terminé')).toBeInTheDocument()
  })

  it('le classeur de contacts (xlsx) porte un contenu distinct du dossier', async () => {
    wrap(<AccountDeliverables account={stubAccount} />)
    await userEvent.click(screen.getByRole('button', { name: 'Contacts (Excel)' }))

    expect(screen.getByText('Nom, fonction, entité, email, téléphone, LinkedIn, statut')).toBeInTheDocument()
    expect(screen.getByText(/Les contacts de Alpha SAS uniquement/)).toBeInTheDocument()
  })

  it('un compte encore en analyse le dit dans l’état du livrable, sans inventer "Terminé"', async () => {
    wrap(<AccountDeliverables account={{ ...stubAccount, status: 'analyzing' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }))

    expect(screen.getByText('En cours')).toBeInTheDocument()
  })

  it('#2125.15 — un compte rattaché à un groupe le dit dans son périmètre, sans changer le contenu', async () => {
    accountLinksMock.mockResolvedValue({
      mergedInto: { id: 'group-1', company_name: 'Groupe Alpha' },
      linked: [],
      detachRefusal: null,
      detachRefusalMessage: null,
    } as unknown as AccountLinks)
    wrap(<AccountDeliverables account={stubAccount} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }))

    await waitFor(() =>
      expect(
        screen.getByText(/Ce compte uniquement — Alpha SAS ; les filiales liées n’y figurent pas/),
      ).toBeInTheDocument(),
    )
  })

  it('#2125.5 — « Partager dans l’équipe » copie le lien INTERNE du dossier, pas un lien public', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    wrap(<AccountDeliverables account={stubAccount} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }))
    await userEvent.click(screen.getByRole('button', { name: 'Partager dans l’équipe' }))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/accounts/acc-1`)
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('#2125.5 — un presse-papiers indisponible se dit, jamais un plantage silencieux', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    wrap(<AccountDeliverables account={stubAccount} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }))
    await userEvent.click(screen.getByRole('button', { name: 'Partager dans l’équipe' }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
  })

  it('#2125.10 — sans connecteur CRM réel, aucun bouton d’export CRM n’apparaît (no-op strict)', async () => {
    wrap(<AccountDeliverables account={stubAccount} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }))

    expect(screen.queryByRole('button', { name: 'Exporter vers ton CRM' })).not.toBeInTheDocument()
    expect(createCompanyMock).not.toHaveBeenCalled()
  })

  it('#2125.10 — un connecteur réel branché rend le bouton, qui exporte SANS nommer le fournisseur', async () => {
    vi.mocked(useCrmStatus).mockReturnValue({ data: { connected: true } } as unknown as ReturnType<typeof useCrmStatus>)
    createCompanyMock.mockResolvedValue({ id: 'crm-co-1', created: true })
    wrap(<AccountDeliverables account={stubAccount} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }))
    const exportButton = screen.getByRole('button', { name: 'Exporter vers ton CRM' })
    expect(exportButton.textContent).not.toMatch(/hubspot/i)
    await userEvent.click(exportButton)

    expect(createCompanyMock).toHaveBeenCalledWith({
      name: 'Alpha SAS',
      domain: undefined,
      industry: 'Édition de logiciels',
    })
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('le téléchargement part du bouton de la fiche, pas du clic sur le format', async () => {
    downloadDocument.mockResolvedValueOnce(undefined)
    wrap(<AccountDeliverables account={stubAccount} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF' }))
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger' }))

    expect(downloadDocument).toHaveBeenCalledWith('/documents/accounts/acc-1/dossier.pdf', 'dossier.pdf')
  })
})
