import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DryRunReport } from '@bellum/contracts'

/**
 * #4051 (recette prod 14/10) — l'assistant de reprise (/settings/import) n'avait PAS le bilan par famille
 * de l'import universel (/contacts › Importer) : « Comptes : N créés … », la ligne « à rapprocher » et
 * « Télécharger le rapport ». UN seul bilan pour les deux chemins — le même composant.
 */

const dryRun = vi.fn()
const create = vi.fn()
const applyMock = vi.fn()
const useImportSources = vi.fn()

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    // ⚠️ L'entête porte un lien vers les intégrations et le lien contextuel du
    // copilote : le faux recopie le `search` dans le `href` et transmet la ref,
    // comme le vrai `Link`.
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
    apply: (id: string, content: string, available: string[], resumeFrom?: number) =>
      applyMock(id, content, available, resumeFrom),
    rollback: vi.fn(),
  },
}))

vi.mock('../lib/decode-file', () => ({
  decodeFile: () => Promise.resolve({ text: 'Societe;Siren\nAcme;552100554', encoding: 'utf-8' }),
}))

const { toast } = await import('sonner')
const downloadCSV = vi.fn()
vi.doMock('@/lib/export-csv', () => ({ downloadCSV: (...a: unknown[]) => downloadCSV(...a) }))
const { ImportWizard } = await import('./ImportWizard')

const SOURCE = {
  key: 'accounts_only',
  objects: ['account'],
  format: 'csv',
  readable: true,
  tier: 'mvp',
  imports: ['comptes'],
  skips: [],
  howTo: 'Une ligne par société.',
  required: ['company'],
  fields: ['company', 'siren', 'domain'],
}

const BASE_REPORT: DryRunReport = {
  rowsRead: 10,
  creations: 10,
  updates: 0,
  duplicates: [],
  skipped: [],
  overwrittenFields: 0,
  withoutLegalBasis: 0,
  missingRequiredColumns: [],
  mappedColumns: ['Societe', 'Siren'],
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

/** Choisir la source, déposer le fichier, simuler — jusqu'au rapport de dry-run. */
async function reachReport() {
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /choisir cette source/i }))
  await waitFor(() => expect(create).toHaveBeenCalled())

  const input = document.querySelector('input[type="file"]')
  fireEvent.change(input as HTMLInputElement, {
    target: { files: [new File(['x'], 'comptes.csv', { type: 'text/csv' })] },
  })

  await waitFor(() => expect(screen.getByRole('button', { name: /simuler/i })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /simuler/i }))
  await waitFor(() => expect(dryRun).toHaveBeenCalled())
}

beforeEach(() => {
  vi.clearAllMocks()
  useImportSources.mockReturnValue({ data: [SOURCE], isLoading: false, isError: false })
  create.mockResolvedValue({ id: 'sess-1', source: 'accounts_only', object_type: 'account', state: 'draft' })
  dryRun.mockResolvedValue({
    report: BASE_REPORT,
    proposedMapping: { columns: { Societe: 'company', Siren: 'siren' }, ignored: [], disabledRules: [] },
    delimiter: ';',
  })
})

const WRITTEN_REPORT: DryRunReport = {
  ...BASE_REPORT,
  rowsRead: 3,
  creations: 1,
  skipped: [
    { row: 2, reason: 'company_to_validate', field: 'company' },
    { row: 3, reason: 'invalid_email', field: 'email' },
  ],
}

describe('#4051 — le bilan par famille de l’assistant de reprise', () => {
  async function writeOnce() {
    await reachReport()
    applyMock.mockResolvedValue({
      created: 1,
      updated: 0,
      skippedUnknownCompany: 0,
      written: true,
      reason: null,
      resumedFromRow: 0,
      stopped: null,
      report: WRITTEN_REPORT,
    })
    fireEvent.click(screen.getByRole('button', { name: /^importer$/i }))
    await waitFor(() => expect(applyMock).toHaveBeenCalled())
  }

  it('dit « Comptes : 1 compte créé », la ligne « à rapprocher » et la raison — le composant de l’import universel', async () => {
    await writeOnce()
    const bilan = await screen.findByTestId('import-family-report')
    expect(bilan.textContent).toMatch(/Comptes/)
    expect(bilan.textContent).toMatch(/1 compte créé/)
    expect(bilan.textContent).toMatch(/1 compte à rapprocher/)
    expect(bilan.textContent).toMatch(/1 ligne écartée/)
    // Une absence ne fait AUCUNE ligne : pas de « 0 doublon », pas de « 0 reconnu ».
    expect(bilan.textContent).not.toMatch(/\b0 /)
    // La raison de la ligne « à valider » est nommée au rapport.
    expect((await screen.findByTestId('import-report-skipped-details')).textContent).toMatch(/société à valider/)
  })

  it('« Télécharger le rapport » sort les lignes écartées, avec leur raison', async () => {
    await writeOnce()
    fireEvent.click(await screen.findByRole('button', { name: /télécharger le rapport/i }))
    await waitFor(() => expect(downloadCSV).toHaveBeenCalled())
    const [csv, filename] = downloadCSV.mock.calls[0] as [string, string]
    expect(filename).toBe('rapport-import.csv')
    expect(csv).toMatch(/société à valider/)
    expect(csv).toMatch(/adresse invalide/)
  })

  it('avant toute écriture, aucun bilan : la simulation ne dit pas « créés »', async () => {
    await reachReport()
    expect(screen.queryByTestId('import-family-report')).toBeNull()
  })
})
