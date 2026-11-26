import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ExportSheetButton } from './ExportSheetButton'

/**
 * G.5 (recette R3, 19/10) — le 1er clic créait la feuille (201) sans que
 * l'utilisateur le voie ; il recliquait et créait un doublon. Le bouton doit
 * (1) se désactiver pendant l'appel, (2) dire « créée » sur l'écran même, et
 * (3) ne pas renvoyer un second export tant que la liste exportée n'a pas changé.
 */

const exportSheet = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())

vi.mock('@/features/google/api', () => ({ googleApi: { exportSheet, connectUrl: vi.fn() } }))
vi.mock('@/features/google/hooks/useGoogleStatus', () => ({
  useGoogleStatus: () => ({ data: { configured: true, connected: true, capabilities: { sheets: true } } }),
}))
vi.mock('@/lib/data-exit', () => ({
  useDataExit: () => ({ allowed: true, grant: null }),
  workspaceRuleRefusalText: () => null,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: toastSuccess } }))

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  exportSheet.mockReset()
  toastSuccess.mockReset()
})

const CONTACTS = [{ full_name: 'Claire Meunier', email: 'claire@acme.example' }]

function renderButton(contacts = CONTACTS) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ExportSheetButton contacts={contacts} title="Contacts" />
    </QueryClientProvider>,
  )
}

describe('ExportSheetButton — G.5', () => {
  it('désactive le bouton pendant l’appel : pas de second clic possible', async () => {
    exportSheet.mockReturnValue(new Promise(() => undefined))
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Exporter vers un tableur' }))
    await waitFor(() => expect(screen.getByRole('button')).toBeDisabled())
    fireEvent.click(screen.getByRole('button'))
    expect(exportSheet).toHaveBeenCalledTimes(1)
  })

  it('après le 1er succès : toast ET confirmation sur l’écran ; un 2e clic ne crée pas de doublon', async () => {
    exportSheet.mockResolvedValue({ spreadsheetId: 's1', spreadsheetUrl: 'https://sheet.example/s1' })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Exporter vers un tableur' }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1))
    const created = await screen.findByRole('button', { name: /Feuille de calcul créée/ })
    fireEvent.click(created)
    expect(exportSheet).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('https://sheet.example/s1', '_blank')
    open.mockRestore()
  })

  it('…et sait dire non : une autre liste exportée redonne le bouton d’export', async () => {
    exportSheet.mockResolvedValue({ spreadsheetId: 's1', spreadsheetUrl: null })
    const view = renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Exporter vers un tableur' }))
    await screen.findByText(/Feuille de calcul créée/)
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ExportSheetButton
          contacts={[...CONTACTS, { full_name: 'Paul Durand', email: 'paul@acme.example' }]}
          title="Contacts"
        />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Exporter vers un tableur' })).toBeEnabled()
  })
})
