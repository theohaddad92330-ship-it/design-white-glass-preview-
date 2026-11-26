import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EsnTargetPersonasImportReport } from '@bellum/contracts'
import { TargetPersonasSection } from '@/features/profile/components/TargetPersonasSection'
import { useEsnProfileWorkspaceMeta } from '@/features/profile/hooks/useEsnProfileWorkspaceMeta'
import { useImportTargetPersonas, useTargetPersonas } from '@/features/profile/hooks/useTargetPersonas'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('@/features/universal-import/view/ImportedFromFileNote', () => ({ ImportedFromFileNote: () => null }))
vi.mock('@/features/profile/hooks/useEsnProfileWorkspaceMeta', () => ({ useEsnProfileWorkspaceMeta: vi.fn() }))
vi.mock('@/features/profile/hooks/useTargetPersonas', () => ({
  useTargetPersonas: vi.fn(),
  useImportTargetPersonas: vi.fn(),
}))

function setup(opts: { count?: number; canEdit?: boolean; report?: EsnTargetPersonasImportReport } = {}) {
  const mutateAsync = vi
    .fn()
    .mockResolvedValue(opts.report ?? { imported: 2, rejected: [], fed_to_personas: 1, missing_columns: [] })
  vi.mocked(useEsnProfileWorkspaceMeta).mockReturnValue({
    data: { shared: true, canEditCompany: opts.canEdit ?? true, role: 'owner' },
  } as unknown as ReturnType<typeof useEsnProfileWorkspaceMeta>)
  vi.mocked(useTargetPersonas).mockReturnValue({
    data: {
      personas: Array.from({ length: opts.count ?? 0 }, (_, i) => ({
        id: `p${i}`,
        category: null,
        title: `Poste ${i}`,
        decision_level: 1 as const,
      })),
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useTargetPersonas>)
  vi.mocked(useImportTargetPersonas).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
    typeof useImportTargetPersonas
  >)
  return { mutateAsync }
}

describe('TargetPersonasSection (#3754.1)', () => {
  it('sans poste importé, DIT que l’ordre ne change pas', async () => {
    setup({ count: 0 })
    renderWithRouter(<TargetPersonasSection />)
    expect(await screen.findByText(/l'ordre des contacts ne change pas/i)).toBeInTheDocument()
  })

  it('compte les postes enregistrés', async () => {
    setup({ count: 345 })
    renderWithRouter(<TargetPersonasSection />)
    expect(await screen.findByText(/345 postes cibles enregistrés/i)).toBeInTheDocument()
  })

  it('envoie le csv lu tel quel et nomme les lignes ignorées', async () => {
    const { mutateAsync } = setup({
      report: {
        imported: 344,
        rejected: [{ line: 12, reason: 'level_missing' }],
        fed_to_personas: 0,
        missing_columns: [],
      },
    })
    renderWithRouter(<TargetPersonasSection />)
    const input = (await screen.findByLabelText('Importer un csv', { selector: 'input' })) as HTMLInputElement
    const file = new File(['Intitulé;Niveau\nCTO;1\n'], 'cibles.csv', { type: 'text/csv' })
    await userEvent.upload(input, file)
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ format: 'csv', content: 'Intitulé;Niveau\nCTO;1\n' }),
    )
    expect(await screen.findByText('ligne 12 : niveau absent')).toBeInTheDocument()
  })

  it('un membre sans droit de gestion ne peut pas importer', async () => {
    setup({ canEdit: false })
    renderWithRouter(<TargetPersonasSection />)
    expect(await screen.findByRole('button', { name: 'Importer un csv' })).toBeDisabled()
  })
})
