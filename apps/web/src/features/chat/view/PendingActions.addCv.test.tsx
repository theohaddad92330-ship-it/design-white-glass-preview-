import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render as rtlRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import type { PendingChatAction } from '@bellum/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PendingActions } from './PendingActions'

/**
 * #AM.58 — la carte « importer un CV » de Laura (`open_screen` → `/consultants?importCv=true`) porte le geste
 * « Ajouter un CV » ; les autres cartes d'ouverture d'écran n'en ont pas.
 */
const permissions = vi.hoisted(() => ({ current: { status: 'known', permissions: ['records:write'] } as unknown }))
const navigate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/permissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/permissions')>()),
  useUserPermissions: () => permissions.current,
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/features/consultants/view/CvDropZone', () => ({ CvDropZone: () => <p>zone-de-depot</p> }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [], isLoading: false }),
}))

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const IMPORT_CV: PendingChatAction = {
  action: 'open_screen',
  route: '/consultants?importCv=true',
  label: 'l’import de CV',
  highlight: 'Lecture automatique, fiche à valider',
  cost_credits: 0,
}
const OTHER_SCREEN: PendingChatAction = { ...IMPORT_CV, route: '/accounts/partners', label: 'tes partenaires' }

describe('PendingActions — Ajouter un CV depuis le fil (#AM.58)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    permissions.current = { status: 'known', permissions: ['records:write'] }
  })

  it('la carte d’import de CV ouvre le dépôt en surimpression, sans navigation', async () => {
    render(<PendingActions actions={[IMPORT_CV]} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un CV' }))
    expect(await screen.findByText('zone-de-depot')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('une autre ouverture d’écran n’a pas ce bouton', async () => {
    render(<PendingActions actions={[OTHER_SCREEN]} />)
    expect(await screen.findByText('Ouvrir tes partenaires')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter un CV' })).not.toBeInTheDocument()
  })

  it('droits : sans `records:write`, la carte garde son renvoi vers le vivier et n’offre pas le dépôt', async () => {
    permissions.current = { status: 'known', permissions: ['data:export'] }
    render(<PendingActions actions={[IMPORT_CV]} />)
    expect(await screen.findByRole('button', { name: /Ouvrir l’écran/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter un CV' })).not.toBeInTheDocument()
  })
})
