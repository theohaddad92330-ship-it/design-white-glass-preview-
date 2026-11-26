import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplanDialog } from './ReplanDialog'
import type { AttackAngle } from './planViewData'

const toastWarning = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: (...a: unknown[]) => toastError(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
  },
}))

const isDemo = vi.fn(() => false)
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => isDemo() }))

const replan = vi.fn().mockResolvedValue({ replanned: true })
vi.mock('@/features/accounts/api', () => ({
  accountsApi: { replan: (...args: unknown[]) => replan(...args) },
  accountKeys: { detail: (id: string) => ['account', id] },
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  replan.mockClear()
  isDemo.mockReturnValue(false)
  toastWarning.mockClear()
  toastError.mockClear()
})

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const angles = [{ title: 'Cybersécurité' }, { title: 'Cloud & DevOps' }] as unknown as AttackAngle[]
const user = () => userEvent.setup({ pointerEventsCheck: 0 })

describe('ReplanDialog', () => {
  it('does not re-plan on open', () => {
    wrap(<ReplanDialog open onOpenChange={vi.fn()} accountId="a1" angles={angles} />)
    expect(replan).not.toHaveBeenCalled()
  })

  it('re-plans with an empty strategy when nothing is chosen', async () => {
    const u = user()
    wrap(<ReplanDialog open onOpenChange={vi.fn()} accountId="a1" angles={angles} />)

    await u.click(screen.getByRole('button', { name: 'Re-planifier' }))

    expect(replan).toHaveBeenCalledTimes(1)
    expect(replan).toHaveBeenCalledWith('a1', {})
  })

  it('re-plans around the selected angle', async () => {
    const u = user()
    wrap(<ReplanDialog open onOpenChange={vi.fn()} accountId="a1" angles={angles} />)

    await u.click(screen.getByRole('button', { name: 'Cybersécurité' }))
    await u.click(screen.getByRole('button', { name: 'Re-planifier' }))

    expect(replan).toHaveBeenCalledWith('a1', { angle: 'Cybersécurité' })
  })

  it('re-plans with the typed form constraints (#2947, #2204.15)', async () => {
    const u = user()
    wrap(<ReplanDialog open onOpenChange={vi.fn()} accountId="a1" angles={angles} />)

    await u.type(screen.getByLabelText('Contraintes de forme (optionnel)'), 'Moins de 400 signes')
    await u.click(screen.getByRole('button', { name: 'Re-planifier' }))

    expect(replan).toHaveBeenCalledWith('a1', { constraints: 'Moins de 400 signes' })
  })

  it('re-plans around the chosen message objective (#2947, #2204.11)', async () => {
    const u = user()
    wrap(<ReplanDialog open onOpenChange={vi.fn()} accountId="a1" angles={angles} />)

    await u.click(screen.getByRole('combobox', { name: 'Objectif des messages (optionnel)' }))
    await u.click(await screen.findByRole('option', { name: 'Explorer un partenariat' }))
    await u.click(screen.getByRole('button', { name: 'Re-planifier' }))

    expect(replan).toHaveBeenCalledWith('a1', { objective: 'partenariat' })
  })

  it('sans objectif choisi, aucun objectif ne part (#2204.11)', async () => {
    const u = user()
    wrap(<ReplanDialog open onOpenChange={vi.fn()} accountId="a1" angles={angles} />)

    expect(screen.getByRole('combobox', { name: 'Objectif des messages (optionnel)' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Re-planifier' }))
    expect(replan).toHaveBeenCalledWith('a1', {})
  })

  it('un champ contraintes blanc ne se transmet pas', async () => {
    const u = user()
    wrap(<ReplanDialog open onOpenChange={vi.fn()} accountId="a1" angles={angles} />)

    await u.type(screen.getByLabelText('Contraintes de forme (optionnel)'), '   ')
    await u.click(screen.getByRole('button', { name: 'Re-planifier' }))

    expect(replan).toHaveBeenCalledWith('a1', {})
  })
  /**
   * #1092 — « HTTP erreur en notification ». Mesuré en production : un 502
   * `ROUTER_EXTERNAL_TARGET_ERROR` à 120 176 ms, c'est-à-dire la coupure de la
   * passerelle qui sert la SPA, pendant que l'API s'accorde 300 s pour la phase
   * plan. Le calcul continue côté serveur et persiste son plan quand il aboutit.
   *
   * C'est donc un `unknown`, pas un échec : la requête est PARTIE, on n'a pas eu
   * la réponse. Annoncer « échec » pousserait au pire geste — relancer, qui
   * repaie un calcul peut-être déjà fait.
   */
  it('une coupure de passerelle ne s’annonce pas comme un échec', async () => {
    replan.mockRejectedValueOnce(new Error('An error occurred with this application.', { cause: 502 }))
    wrap(<ReplanDialog open onOpenChange={vi.fn()} accountId="a1" angles={angles} />)

    await user().click(screen.getByRole('button', { name: /re-planifier/i }))

    await vi.waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(toastError).not.toHaveBeenCalled()
    // Le message brut de la passerelle ne remonte JAMAIS à l'utilisateur.
    const [titre] = toastWarning.mock.calls[0] as [string]
    expect(titre).not.toMatch(/ROUTER_EXTERNAL_TARGET_ERROR|An error occurred/)
  })

  it('un 504 est traité comme le 502 — même ignorance, même geste', async () => {
    replan.mockRejectedValueOnce(new Error('Gateway Timeout', { cause: 504 }))
    wrap(<ReplanDialog open onOpenChange={vi.fn()} accountId="a1" angles={angles} />)

    await user().click(screen.getByRole('button', { name: /re-planifier/i }))

    await vi.waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(toastError).not.toHaveBeenCalled()
  })

  // #3278.8 (18/10) — en démo le serveur refuse (dossiers figés, 409) : le clic ne reste jamais muet, et le
  // message dit POURQUOI (pas « termine d'abord l'analyse », faux sur un dossier de démo complet).
  it('en démo, le refus se dit explicitement et ferme la fenêtre', async () => {
    isDemo.mockReturnValue(true)
    replan.mockRejectedValueOnce(new Error('Espace de démonstration', { cause: 409 }))
    const onOpenChange = vi.fn()
    wrap(<ReplanDialog open onOpenChange={onOpenChange} accountId="a1" angles={angles} />)

    await user().click(screen.getByRole('button', { name: /re-planifier/i }))

    await vi.waitFor(() => expect(toastWarning).toHaveBeenCalled())
    const [titre] = toastWarning.mock.calls[0] as [string]
    expect(titre).toMatch(/démonstration/i)
    expect(toastError).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
