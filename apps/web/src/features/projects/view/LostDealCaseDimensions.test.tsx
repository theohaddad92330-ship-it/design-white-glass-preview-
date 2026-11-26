import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** #3246 — les deux choix fermés d'une perte déjà clôturée. Le hook réseau est MOQUÉ. */
const read = vi.fn()
const save = vi.fn()
vi.mock('../hooks/useProjectCaseDimensions', () => ({
  useProjectCaseDimensions: () => read(),
  useSaveProjectCaseDimensions: () => ({ mutate: save, isPending: false, isError: false }),
}))

const { LostDealCaseDimensions } = await import('./LostDealCaseDimensions')

beforeEach(() => {
  save.mockReset()
  read.mockReset()
})

describe('LostDealCaseDimensions', () => {
  it('montre les choix déjà saisis, nommés', () => {
    read.mockReturnValue({ data: { strategy: 'via_partenaire', buying_model: null }, isLoading: false, isError: false })
    render(<LostDealCaseDimensions projectId="p-1" />)
    expect(screen.getByText('Via un partenaire')).toBeTruthy()
  })

  it('un choix enregistre SEUL le champ touché', async () => {
    read.mockReturnValue({ data: { strategy: null, buying_model: null }, isLoading: false, isError: false })
    render(<LostDealCaseDimensions projectId="p-1" />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Modèle d’achat' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Appel d’offres' }))
    expect(save).toHaveBeenCalledWith({ id: 'p-1', patch: { buying_model: 'appel_offres' } })
  })

  it('revenir à « Non renseigné » efface (null), jamais une chaîne vide', async () => {
    read.mockReturnValue({ data: { strategy: 'via_partenaire', buying_model: null }, isLoading: false, isError: false })
    render(<LostDealCaseDimensions projectId="p-1" />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Stratégie d’approche' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Non renseigné' }))
    expect(save).toHaveBeenCalledWith({ id: 'p-1', patch: { strategy: null } })
  })

  it('#3246 (lot cloud 14/10) — l’organisation de la décision s’enregistre comme les deux autres', async () => {
    read.mockReturnValue({
      data: { strategy: null, buying_model: null, organisation: null },
      isLoading: false,
      isError: false,
    })
    render(<LostDealCaseDimensions projectId="p-1" />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Cercle de décision' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Comité élargi' }))
    expect(save).toHaveBeenCalledWith({ id: 'p-1', patch: { organisation: 'comite_elargi' } })
  })

  it('sur une lecture en erreur, ne montre aucun formulaire (pas de valeurs devinées) mais DIT pourquoi (R17 15/10)', () => {
    read.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<LostDealCaseDimensions projectId="p-1" />)
    expect(screen.queryByRole('combobox', { name: 'Modèle d’achat' })).toBeNull()
    expect(screen.getByText('Pour comparer cette perte à d’autres cas')).toBeTruthy()
    expect(screen.getByTestId('case-dimensions-unavailable')).toBeTruthy()
  })
})
