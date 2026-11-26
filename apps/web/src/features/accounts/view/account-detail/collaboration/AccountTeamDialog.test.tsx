import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * #4507 (régression corrigée, Louis 24/10) — la fenêtre « Équipe du compte » : tout membre de l'espace VOIT le
 * responsable et les co-équipiers ; seul `can_edit` voit et utilise le sélecteur d'ajout et le retrait.
 */
const team = vi.fn()
const add = vi.fn()
const remove = vi.fn()

vi.mock('@/features/team-guardrails/hooks', () => ({
  useAccountTeam: () => team(),
  useAccountTeamMutations: () => ({
    add: { mutate: add, isPending: false },
    remove: { mutate: remove, isPending: false },
  }),
  // #4996 L6 — la carte lit aussi les fiches suivies et propose la répartition (leurs propres tests).
  useGroupEntityFiches: () => ({ data: [] }),
  useAccountTeamScopeMutations: () => ({
    add: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
  }),
  useDistributePreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDistributeApply: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/adv/api', () => ({ useAccountEntities: () => ({ data: { items: [] } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [
      { userId: 'u-me', fullName: 'Moi', email: 'moi@esn.fr' },
      { userId: 'u-lea', fullName: 'Léa Martin', email: 'lea@esn.fr' },
      { userId: 'u-sam', fullName: 'Sam Roux', email: 'sam@esn.fr' },
    ],
  }),
}))

const { AccountTeamDialog } = await import('./AccountTeamDialog')

const TEAM = {
  responsible: { user_id: 'u-me', name: 'Moi' },
  members: [{ user_id: 'u-lea', name: 'Léa Martin' }],
}

function renderDialog() {
  render(<AccountTeamDialog accountId="acc-1" companyName="Airbus" open onOpenChange={() => {}} />)
  return screen.getByRole('dialog')
}

afterEach(() => {
  cleanup()
  team.mockReset()
  add.mockReset()
  remove.mockReset()
})

describe('AccountTeamDialog — lisible par tout membre, modifiable sur `can_edit` seulement', () => {
  it('REFUS — sans `can_edit`, les noms sont lus mais ni le sélecteur d’ajout ni le bouton « Retirer » n’existent', () => {
    team.mockReturnValue({ data: { ...TEAM, can_edit: false } })
    const dialog = renderDialog()
    expect(within(dialog).getByText('Responsable : Moi')).toBeInTheDocument()
    expect(within(dialog).getByText('Léa Martin')).toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    expect(within(dialog).queryByLabelText('Co-équipier à ajouter')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /Retirer/ })).toBeNull()
  })

  it('avec `can_edit`, le sélecteur d’ajout ET le retrait de chaque co-équipier sont proposés', () => {
    team.mockReturnValue({ data: { ...TEAM, can_edit: true } })
    const dialog = renderDialog()
    expect(within(dialog).getByLabelText('Co-équipier à ajouter')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Retirer Léa Martin de l’équipe du compte' })).toBeInTheDocument()
  })

  it('sans `can_edit` et sans équipe, la fenêtre le DIT au lieu de rester vide', () => {
    team.mockReturnValue({ data: { responsible: null, members: [], can_edit: false } })
    const dialog = renderDialog()
    expect(within(dialog).getByText('Aucun co-équipier pour l’instant.')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Co-équipier à ajouter')).toBeNull()
  })

  it('le titre reste « Équipe du compte » et nomme le compte', () => {
    team.mockReturnValue({ data: { ...TEAM, can_edit: false } })
    const dialog = renderDialog()
    expect(within(dialog).getAllByText('Équipe du compte').length).toBeGreaterThan(0)
    expect(within(dialog).getByText('Airbus')).toBeInTheDocument()
  })
})
