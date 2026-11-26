import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DryRunReport } from '@bellum/contracts'

/**
 * #2159.35 — « CE N'EST PAS LA MÊME PERSONNE », depuis l'aperçu d'import.
 *
 * Un CONFLIT (`overwrites: true`) sur un contact déjà en base peut venir d'un
 * e-mail générique partagé (accueil@, secretariat@) qui désigne quelqu'un
 * d'autre. Ce fichier prouve que le geste :
 *  - n'apparaît QUE sur un import de CONTACTS (jamais sur un import de comptes,
 *    où la même clé `email` n'a pas ce sens) ;
 *  - n'apparaît QUE sur un CONFLIT contre une fiche EXISTANTE (`existingId`),
 *    jamais sur un doublon intra-fichier ;
 *  - poste la correction sur la BONNE fiche, sans rien composer côté client.
 */

const dryRun = vi.fn()
const create = vi.fn()
const useImportSources = vi.fn()
const mockApiFetch = vi.fn()

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    Link: forwardRef<
      HTMLAnchorElement,
      { children?: React.ReactNode; to: string; search?: Record<string, unknown>; className?: string }
    >(({ children, to, search, ...rest }, ref) => (
      <a
        {...rest}
        ref={ref}
        href={search ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}` : to}
      >
        {children}
      </a>
    )),
  }
})

vi.mock('../api', () => ({
  useImportSources: () => useImportSources(),
  useImportSessions: () => ({ data: [], refetch: () => undefined }),
  importApi: {
    create: (source: string) => create(source),
    dryRun: (id: string, content: string, mapping?: unknown) => dryRun(id, content, mapping),
    apply: vi.fn(),
    rollback: vi.fn(),
  },
}))

vi.mock('../lib/decode-file', () => ({
  decodeFile: () => Promise.resolve({ text: 'Nom;E-mail\nJean Dupont;accueil@acme.fr', encoding: 'utf-8' }),
}))

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

const { ImportWizard } = await import('./ImportWizard')

const CONTACT_SOURCE = {
  key: 'contacts_only',
  objects: ['contact'],
  format: 'csv',
  readable: true,
  tier: 'mvp',
  imports: ['contacts'],
  skips: [],
  howTo: 'Une ligne par contact.',
  required: ['full_name'],
  fields: ['full_name', 'email'],
}

const ACCOUNT_SOURCE = {
  key: 'accounts_only',
  objects: ['account'],
  format: 'csv',
  readable: true,
  tier: 'mvp',
  imports: ['comptes'],
  skips: [],
  howTo: 'Une ligne par société.',
  required: ['company'],
  fields: ['company', 'siren'],
}

const BASE_REPORT: DryRunReport = {
  rowsRead: 1,
  creations: 0,
  updates: 1,
  duplicates: [],
  skipped: [],
  overwrittenFields: 0,
  withoutLegalBasis: 0,
  missingRequiredColumns: [],
  mappedColumns: ['Nom', 'E-mail'],
  ignoredColumns: [],
  truncated: false,
  errors: [],
  sensitiveColumns: [],
  possibleDuplicates: [],
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ImportWizard />
    </QueryClientProvider>,
  )
}

async function reachReport() {
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /choisir cette source/i }))
  await waitFor(() => expect(create).toHaveBeenCalled())

  const input = document.querySelector('input[type="file"]')
  fireEvent.change(input as HTMLInputElement, {
    target: { files: [new File(['x'], 'contacts.csv', { type: 'text/csv' })] },
  })

  await waitFor(() => expect(screen.getByRole('button', { name: /simuler/i })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /simuler/i }))
  await waitFor(() => expect(dryRun).toHaveBeenCalled())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('#2159.35 — le geste « ce n’est pas la même personne » sur un CONFLIT de contact', () => {
  it('apparaît sur un CONFLIT contre une fiche existante, sur un import de contacts', async () => {
    useImportSources.mockReturnValue({ data: [CONTACT_SOURCE], isLoading: false, isError: false })
    create.mockResolvedValue({ id: 'sess-1', source: 'contacts_only', object_type: 'contact', state: 'draft' })
    dryRun.mockResolvedValue({
      report: {
        ...BASE_REPORT,
        duplicates: [{ row: 1, existingId: 'contact-1', matchedOn: ['email'], confidence: 0.9, overwrites: true }],
      },
      proposedMapping: { columns: { Nom: 'full_name', 'E-mail': 'email' }, ignored: [], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()

    const button = await screen.findByTestId('import-report-reject-match')
    mockApiFetch.mockResolvedValue({
      version: 1,
      decision: 'rejected',
      dedup_key: 'email:accueil@acme.fr',
      note: null,
      decided_at: '2026-09-28T10:00:00.000Z',
    })
    fireEvent.click(button)

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith({
        path: '/contacts/contact-1/resolution-corrections',
        method: 'POST',
        body: { decision: 'rejected' },
      }),
    )
    await screen.findByTestId('import-report-reject-match-done')
  })

  it('n’apparaît PAS sur un import de COMPTES, même en conflit', async () => {
    useImportSources.mockReturnValue({ data: [ACCOUNT_SOURCE], isLoading: false, isError: false })
    create.mockResolvedValue({ id: 'sess-1', source: 'accounts_only', object_type: 'account', state: 'draft' })
    dryRun.mockResolvedValue({
      report: {
        ...BASE_REPORT,
        duplicates: [{ row: 1, existingId: 'account-1', matchedOn: ['siren'], confidence: 1, overwrites: true }],
      },
      proposedMapping: { columns: { Nom: 'company' }, ignored: ['E-mail'], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()

    await screen.findByTestId('import-report-duplicates')
    expect(screen.queryByTestId('import-report-reject-match')).toBeNull()
  })

  it('n’apparaît PAS sur un doublon intra-fichier (existingId null), même sur un import de contacts', async () => {
    useImportSources.mockReturnValue({ data: [CONTACT_SOURCE], isLoading: false, isError: false })
    create.mockResolvedValue({ id: 'sess-1', source: 'contacts_only', object_type: 'contact', state: 'draft' })
    dryRun.mockResolvedValue({
      report: {
        ...BASE_REPORT,
        duplicates: [{ row: 1, existingId: null, matchedOn: ['email'], confidence: 0.9, overwrites: false }],
      },
      proposedMapping: { columns: { Nom: 'full_name', 'E-mail': 'email' }, ignored: [], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()

    await screen.findByTestId('import-report-duplicates')
    expect(screen.queryByTestId('import-report-reject-match')).toBeNull()
  })
})
