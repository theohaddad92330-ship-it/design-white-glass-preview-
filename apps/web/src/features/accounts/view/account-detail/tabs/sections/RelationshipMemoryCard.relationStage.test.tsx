import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accountsApi } from '@/features/accounts/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { RelationshipMemoryCard } from './RelationshipMemoryCard'

vi.mock('@/features/contacts/api', () => ({
  contactKeys: { byAccount: (accountId: string) => ['contacts', 'account', accountId] as const },
  contactsApi: { listByAccount: () => Promise.resolve([]) },
}))

vi.mock('@/features/accounts/api', () => ({
  accountsApi: { setRelationshipMemory: vi.fn().mockResolvedValue({}) },
}))

beforeEach(() => {
  cleanup()
  vi.mocked(accountsApi.setRelationshipMemory).mockClear()
})

/**
 * #3246.relation (décision Louis 16/10/2026) — le STADE de relation se choisit
 * dans la liste fermée des 10 stades, à côté du texte libre qui reste. Le
 * texte n'est jamais lu pour remplir le stade.
 */
describe('RelationshipMemoryCard — stade de relation (liste fermée)', () => {
  it('propose les 10 stades et un choix vide, et envoie le code choisi', async () => {
    renderWithRouter(<RelationshipMemoryCard accountId="a-1" memory={{ relation: 'Référencés depuis 2023' }} />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Stade de la relation' }))
    // 10 stades + « Non renseigné »
    expect(await screen.findAllByRole('option')).toHaveLength(11)
    await userEvent.click(screen.getByRole('option', { name: 'Ancien client' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(accountsApi.setRelationshipMemory).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ relation: 'Référencés depuis 2023', relationStage: 'ancien_client' }),
    )
  })

  it('SAIT DIRE NON — un texte libre « ancien client » ne pré-remplit jamais le stade', async () => {
    renderWithRouter(<RelationshipMemoryCard accountId="a-1" memory={{ relation: 'ancien client' }} />)
    const select = await screen.findByRole('combobox', { name: 'Stade de la relation' })
    expect(select.textContent).not.toMatch(/ancien client/i)
  })

  it('revenir au choix vide EFFACE le stade (null), jamais une valeur devinée', async () => {
    renderWithRouter(<RelationshipMemoryCard accountId="a-1" memory={{ relationStage: 'connu' }} />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Stade de la relation' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Non renseigné' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(accountsApi.setRelationshipMemory).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ relationStage: null }),
    )
  })
})
