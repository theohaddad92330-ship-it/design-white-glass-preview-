import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #3386 (recette prod 02/10, démo 04/10) — le rôle métier n'était réglable nulle part dans /settings.
 * Le rôle métier (`user_role`) existe côté données (`esn_profiles`) ; il se règle
 * dans Réglages › Profil › Identité (un seul endroit), par la MÊME sauvegarde que le profil.
 */

const getMineMock = vi.fn()
const updateMineMock = vi.fn()
vi.mock('@/features/profile/api', () => ({
  esnProfileKeys: { mine: ['esn-profile', 'mine'] },
  esnProfileApi: { getMine: () => getMineMock(), updateMine: (answers: unknown) => updateMineMock(answers) },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'me' }, loading: false }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { BusinessRoleField } = await import('./BusinessRoleField')

function renderSelect() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BusinessRoleField />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getMineMock.mockReset()
  updateMineMock.mockReset()
})

describe('BusinessRoleField', () => {
  it('montre le rôle métier déclaré', async () => {
    getMineMock.mockResolvedValue({ user_role: 'Business Manager' })
    renderSelect()
    expect(await screen.findByRole('combobox', { name: 'Rôle métier' })).toHaveTextContent('Business Manager')
  })

  it('un rôle non renseigné le dit, sans en inventer un', async () => {
    getMineMock.mockResolvedValue({})
    renderSelect()
    expect(await screen.findByRole('combobox', { name: 'Rôle métier' })).toHaveTextContent('Non renseigné')
  })

  it('choisir « Directeur d’agence » enregistre user_role par la sauvegarde du profil', async () => {
    getMineMock.mockResolvedValue({ user_role: 'Business Manager' })
    updateMineMock.mockResolvedValue({ user_role: "Directeur d'agence" })
    renderSelect()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Rôle métier' }))
    await userEvent.click(await screen.findByRole('option', { name: "Directeur d'agence" }))
    expect(updateMineMock).toHaveBeenCalledWith({ user_role: "Directeur d'agence" })
  })
})
