import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const content = vi.fn()
const save = vi.fn()
const reset = vi.fn()
vi.mock('../api', () => ({
  useRoutineContent: () => content(),
  useSaveRoutineContent: () => ({ mutate: save, isPending: false }),
  useResetRoutineContent: () => ({ mutate: reset, isPending: false }),
}))

const { RoutineContentEditor } = await import('./RoutineContentEditor')

beforeEach(() => {
  save.mockReset()
  reset.mockReset()
})

/**
 * #2843.30 — le CONTENU exact produit par la routine se règle sur sa fiche, pour
 * l'espace, et revient au défaut d'un geste.
 */
describe('RoutineContentEditor — le contenu de la routine (#2843.30)', () => {
  it('sans gabarit, dit que le texte par défaut s’applique et ne propose pas de retour au défaut', () => {
    content.mockReturnValue({ data: { key: 'no_reply_follow_up', template: null }, isLoading: false, isError: false })
    render(<RoutineContentEditor routineKey="no_reply_follow_up" />)
    expect(screen.getByText(/texte par défaut de la routine/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /revenir au défaut/i })).toBeNull()
  })

  it('enregistre le gabarit saisi pour l’espace', async () => {
    content.mockReturnValue({ data: { key: 'no_reply_follow_up', template: null }, isLoading: false, isError: false })
    render(<RoutineContentEditor routineKey="no_reply_follow_up" />)
    const u = userEvent.setup()
    await u.type(screen.getByRole('textbox', { name: /contenu de la notification/i }), 'Cette semaine : ')
    await u.click(screen.getByRole('button', { name: /enregistrer pour l’espace/i }))
    expect(save).toHaveBeenCalledWith({ key: 'no_reply_follow_up', template: 'Cette semaine :' })
  })

  it('un gabarit posé se lit, et revient au défaut d’un geste', async () => {
    content.mockReturnValue({
      data: { key: 'no_reply_follow_up', template: 'Cette semaine : {{resultat}}' },
      isLoading: false,
      isError: false,
    })
    render(<RoutineContentEditor routineKey="no_reply_follow_up" />)
    expect(screen.getByRole('textbox', { name: /contenu de la notification/i })).toHaveValue(
      'Cette semaine : {{resultat}}',
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /revenir au défaut/i }))
    expect(reset).toHaveBeenCalledWith('no_reply_follow_up')
  })

  it('une lecture en échec le dit, sans champ trompeur', () => {
    content.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<RoutineContentEditor routineKey="no_reply_follow_up" />)
    expect(screen.getByText(/contenu illisible/i)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
