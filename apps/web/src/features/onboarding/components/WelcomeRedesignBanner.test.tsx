import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { WelcomeRedesignBanner } = await import('./WelcomeRedesignBanner')

function renderBanner() {
  return render(
    <I18nextProvider i18n={i18n}>
      <WelcomeRedesignBanner />
    </I18nextProvider>,
  )
}

beforeEach(() => {
  apiFetch.mockReset()
})

/**
 * #2897 (#2091.36, #2091.37) — « BellumAI a été entièrement repensé », pour
 * un compte dont l'onboarding précède la refonte.
 */
describe('WelcomeRedesignBanner (#2897)', () => {
  it('ne rend rien tant que le serveur ne dit pas visible: true', async () => {
    apiFetch.mockResolvedValueOnce({ visible: false })
    renderBanner()
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith({ path: '/onboarding/redesign-banner' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('affiche le texte exact de l’épopée, sans le déformer', async () => {
    apiFetch.mockResolvedValueOnce({ visible: true })
    renderBanner()
    // {{brand}} — jamais le nom en dur (brand-name-is-not-hardcoded.test.ts).
    expect(await screen.findByText(/a été entièrement repensé/)).toBeInTheDocument()
  })

  it('fermer masque le bandeau ET mémorise la fermeture côté serveur', async () => {
    apiFetch.mockResolvedValueOnce({ visible: true })
    apiFetch.mockResolvedValueOnce({ visible: false })
    renderBanner()
    const closeButton = await screen.findByRole('button', { name: /fermer/i })

    await userEvent.click(closeButton)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({ path: '/onboarding/redesign-banner/dismiss', method: 'POST' }),
    )
  })

  it('une lecture en échec ne casse rien — rien ne s’affiche', async () => {
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    renderBanner()
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
