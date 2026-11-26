import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { ApiKeySummary } from '@/features/api-keys/api'

const fixtures = vi.hoisted(() => ({ create: vi.fn(), keys: [] as unknown[] }))

vi.mock('@/features/api-keys/api', () => ({ apiKeysApi: { create: fixtures.create, revoke: vi.fn() } }))
vi.mock('@/features/api-keys/hooks/useApiKeys', () => ({
  API_KEYS_KEY: ['api-keys'],
  useApiKeys: () => ({ data: fixtures.keys, isLoading: false }),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({ locked: false, dimClassName: '', guard: (fn: () => void) => fn, dialog: null }),
}))
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const { ApiKeysCard } = await import('./ApiKeysCard')
const user = () => userEvent.setup({ pointerEventsCheck: 0 })

const SECRET = 'blm_live_SECRET_VALUE_1234567890'
const created: ApiKeySummary & { key: string } = {
  id: 'k1',
  name: 'Reporting mensuel',
  prefix: 'blm_live_abcd',
  scopes: ['read:accounts'],
  last_used_at: null,
  revoked_at: null,
  created_at: '2026-10-22T08:00:00.000Z',
  key: SECRET,
}

describe('Théo D settings-outils.A2 — la clé d’API n’est jamais réaffichée', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    fixtures.create.mockReset().mockResolvedValue(created)
    fixtures.keys = []
  })

  // `userEvent.setup()` installe SON presse-papiers : le nôtre se pose APRÈS, juste avant le clic.
  async function createKey(clipboard: { writeText: () => Promise<void> }) {
    render(<ApiKeysCard />)
    const u = user()
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
    await u.type(screen.getByPlaceholderText(/Nom de la clé/), 'Reporting mensuel')
    await u.click(screen.getByRole('button', { name: 'Créer une clé' }))
  }

  it('à la création la clé part dans le presse-papiers et le panneau le CONFIRME sans la montrer', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    await createKey({ writeText })
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET))
    expect(await screen.findByText(/copiée dans ton presse-papiers/)).toBeInTheDocument()
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument()
  })

  it('⚠️ SAIT DIRE NON — si la copie est refusée, la clé s’affiche UNE fois (sinon elle serait perdue)', async () => {
    await createKey({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    expect(await screen.findByText(SECRET)).toBeInTheDocument()
  })

  it('la liste ne montre ni préfixe ni fin de clé', () => {
    fixtures.keys = [created]
    render(<ApiKeysCard />)
    expect(screen.getByText('Reporting mensuel')).toBeInTheDocument()
    expect(screen.queryByText(/blm_live_abcd/)).not.toBeInTheDocument()
  })
})
