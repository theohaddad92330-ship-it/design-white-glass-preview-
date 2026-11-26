import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import type { DataExitGrant } from '@/lib/data-exit'

const downloadDocument = vi.fn()
vi.mock('@/features/documents/api', () => ({ downloadDocument: (...a: unknown[]) => downloadDocument(...a) }))

const accountLinksMock = vi.fn()
vi.mock('@/features/accounts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/accounts/api')>()
  return { ...actual, accountsApi: { ...actual.accountsApi, accountLinks: accountLinksMock } }
})

// #2125.10 — sans connecteur CRM, no-op strict : ce fichier ne teste pas
// l'export CRM (voir AccountDeliverables.test.tsx), donc toujours déconnecté.
vi.mock('@/features/crm/hooks/useCrmStatus', () => ({
  useCrmStatus: vi.fn().mockReturnValue({ data: { connected: false } }),
}))

const { useDataExit } = await import('@/lib/data-exit')
const { downloadCSV } = await import('@/lib/export-csv')
const { ApiError } = await import('@/lib/api')
const { AccountDeliverables } = await import('@/features/documents/view/AccountDeliverables')
const { FileExportCard } = await import('@/features/chat/view/reply-blocks/FileExportCard')

/**
 * #2081.14 — DÉCISION Louis 19/09/2026 : le bouton d'export est MASQUÉ quand la
 * règle d'espace « qui peut exporter » le refuse, et un refus se dit par sa
 * phrase (« Réservé par la règle d'espace : … »), jamais par une erreur
 * générique. Deux surfaces, les deux chemins : un téléchargement servi par
 * l'API (les livrables d'un compte) et un CSV construit dans le navigateur (la
 * carte fichier du chat).
 *
 * AJUSTEMENT #2081.14 — DÉCISION Louis 19/09/2026 : le dossier de compte
 * (Word, PDF, et depuis « Libérer le deck », la présentation pptx) est un
 * LIVRABLE COMMERCIAL, pas un export de données — ses boutons restent
 * visibles même sous la règle. Le classeur de contacts (xlsx) reste une
 * sortie de données, et reste masqué.
 */
const refused = () => vi.mocked(useDataExit).mockReturnValue({ allowed: false, grant: null })
const allowed = () => vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })

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
}

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const fileBlock = {
  type: 'file_export' as const,
  title: 'Contacts à exporter',
  filename: 'contacts-alpha.csv',
  columns: ['Nom', 'Email'],
  rows: [{ cells: ['Camille Martin', 'camille.martin@alpha.example'] }],
}

describe('#2081.14 — la règle d’espace masque les boutons d’export', () => {
  beforeEach(() => {
    downloadDocument.mockReset()
    vi.mocked(downloadCSV).mockClear()
    accountLinksMock.mockReset().mockResolvedValue({
      mergedInto: null,
      linked: [],
      detachRefusal: null,
      detachRefusalMessage: null,
    })
  })

  it('livrables du compte sous la règle — le dossier (Word, PDF, Présentation) reste permis, les contacts restent refusés', () => {
    refused()
    wrap(<AccountDeliverables account={stubAccount} />)
    expect(screen.getByRole('button', { name: 'Word' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Présentation' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contacts (Excel)' })).not.toBeInTheDocument()
  })

  it('livrables du compte — ouverts sans règle ; un refus de l’API se dit par sa phrase', async () => {
    allowed()
    downloadDocument.mockRejectedValueOnce(
      new ApiError('Forbidden', 403, 'workspace_rule_refused', { rule: 'exportPolicy' }),
    )
    wrap(<AccountDeliverables account={stubAccount} />)
    // #2125.22 — un clic sur le format ouvre la fiche du livrable ; le
    // téléchargement part de LÀ, jamais du clic sur le format lui-même.
    await userEvent.click(screen.getByRole('button', { name: 'Contacts (Excel)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger' }))

    await waitFor(() => expect(screen.getByText(/^Réservé par la règle d’espace : /)).toBeInTheDocument())
  })

  it('NON : carte fichier du chat — pas de bouton, la carte dit la règle, rien ne sort', () => {
    refused()
    render(<FileExportCard block={fileBlock} />)
    expect(screen.queryByRole('button', { name: /Télécharger/ })).not.toBeInTheDocument()
    expect(screen.getByText(/^Réservé par la règle d’espace : /)).toBeInTheDocument()
    expect(downloadCSV).not.toHaveBeenCalled()
  })

  it('carte fichier du chat — sans règle, le fichier part avec la preuve de la règle', async () => {
    allowed()
    render(<FileExportCard block={fileBlock} />)
    await userEvent.click(screen.getByRole('button', { name: /Télécharger/ }))
    expect(downloadCSV).toHaveBeenCalledWith(expect.any(String), 'contacts-alpha.csv', expect.anything())
  })
})
