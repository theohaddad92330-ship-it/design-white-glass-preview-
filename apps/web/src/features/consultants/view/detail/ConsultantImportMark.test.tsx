import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { consultantsApi } from '../../api'
import { ConsultantImportMark } from './ConsultantImportMark'

// #4051 — « Importé le <date> depuis <fichier> » sur la fiche consultant.
vi.mock('../../api', () => ({ consultantsApi: { importMark: vi.fn() } }))

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

function renderMark() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ConsultantImportMark consultantId="c1" />
    </QueryClientProvider>,
  )
}

describe('ConsultantImportMark (#4051)', () => {
  it('une fiche importée depuis un fichier dit quand et depuis quel fichier', async () => {
    vi.mocked(consultantsApi.importMark).mockResolvedValue({
      importedFrom: { importedAt: '2026-10-14T08:00:00.000Z', sourceKind: 'file', sourceLabel: 'vivier-2026.zip' },
    })
    renderMark()
    expect(await screen.findByTestId('import-mark-line')).toHaveTextContent(/Importé le .* depuis vivier-2026\.zip/)
  })

  it('⚠️ SAIT DIRE NON — une fiche jamais importée n’affiche aucune origine', async () => {
    vi.mocked(consultantsApi.importMark).mockResolvedValue({ importedFrom: null })
    renderMark()
    await vi.waitFor(() => expect(consultantsApi.importMark).toHaveBeenCalled())
    expect(screen.queryByTestId('import-mark-line')).not.toBeInTheDocument()
  })
})
