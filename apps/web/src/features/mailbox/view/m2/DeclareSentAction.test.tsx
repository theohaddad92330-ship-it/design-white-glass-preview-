import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

const mutate = vi.fn()
let cadence: unknown = undefined

vi.mock('@/features/contacts/hooks/useDeclareSent', () => ({
  useDeclareSent: () => {
    const [isSuccess, setSuccess] = useState(false)
    return {
      mutate: (vars: unknown, options?: { onSuccess?: () => void }) => {
        mutate(vars)
        setSuccess(true)
        options?.onSuccess?.()
      },
      isPending: false,
      isSuccess,
    }
  },
}))
vi.mock('@/features/contacts/hooks/useContactCadence', () => ({
  useContactCadence: () => ({ data: cadence }),
}))

const { DeclareSentAction } = await import('./DeclareSentAction')

const step = (key: string, offset_days: number, due_date: string) => ({
  key,
  label: key,
  offset_days,
  due_date,
  done: false,
  item_id: null,
  body: null,
})

beforeEach(() => {
  mutate.mockClear()
  cadence = undefined
})

describe('DeclareSentAction — #4418.1 « Marquer envoyé » planifie J+3 / J+6 / J+9 et l’écran le dit', () => {
  it('le geste est atteignable et déclare l’envoi sur le canal du message', async () => {
    render(<DeclareSentAction contactId="c1" channel="email" />)
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'Marquer envoyé' }))
    expect(mutate).toHaveBeenCalledWith({ channel: 'email', sentOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
  })

  it('après le geste, dit les trois échéances DATÉES, lues sur le calendrier du serveur', async () => {
    cadence = {
      scheduled: true,
      steps: [
        { ...step('initial', 0, '2026-10-25'), done: true },
        step('relance', 3, '2026-10-28'),
        step('preuve_sociale', 6, '2026-10-31'),
        step('close_loop', 9, '2026-11-03'),
      ],
    }
    render(<DeclareSentAction contactId="c1" channel="email" />)
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'Marquer envoyé' }))
    const line = screen.getByTestId('declared-cadence')
    expect(line).toHaveTextContent('J+3')
    expect(line).toHaveTextContent('J+6')
    expect(line).toHaveTextContent('J+9')
    expect(line).toHaveTextContent('28/10/2026')
    expect(line).toHaveTextContent('03/11/2026')
  })

  it('« Fait » ne porte jamais preuve d’envoi : la phrase le dit, jamais « envoyé par Bellum »', async () => {
    cadence = { scheduled: true, steps: [step('relance', 3, '2026-10-28')] }
    render(<DeclareSentAction contactId="c1" channel="email" />)
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'Marquer envoyé' }))
    expect(screen.getByTestId('declared-note')).toHaveTextContent(/déclaré par toi/i)
    expect(screen.getByTestId('declared-note')).toHaveTextContent(/ne peut pas le vérifier/i)
  })

  it('si le calendrier n’est pas planifié, l’écran ne promet pas de relances', async () => {
    cadence = { scheduled: false, steps: [step('relance', 3, '2026-10-28')] }
    render(<DeclareSentAction contactId="c1" channel="email" />)
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'Marquer envoyé' }))
    expect(screen.queryByTestId('declared-cadence')).not.toBeInTheDocument()
    expect(screen.getByTestId('declared-note')).toHaveTextContent(/aucune relance n’a pu être planifiée/i)
  })

  // #4418 — un envoi déclaré n'a pas d'horodatage prouvé : la cadence part du jour que le commercial indique.
  it('la cadence part de la date DÉCLARÉE : le jour choisi est envoyé, et l’écran dit qu’il est déclaratif', async () => {
    cadence = { scheduled: true, steps: [step('relance', 3, '2026-10-13')] }
    render(<DeclareSentAction contactId="c1" channel="email" />)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    fireEvent.change(screen.getByLabelText('Envoyé le'), { target: { value: '2026-10-10' } })
    await user.click(screen.getByRole('button', { name: 'Marquer envoyé' }))
    expect(mutate).toHaveBeenCalledWith({ channel: 'email', sentOn: '2026-10-10' })
    expect(screen.getByTestId('declared-note')).toHaveTextContent(/10\/10\/2026/)
    expect(screen.getByTestId('declared-note')).toHaveTextContent(/date que tu as indiquée/i)
  })

  it('le champ date ne propose jamais un jour futur', () => {
    render(<DeclareSentAction contactId="c1" channel="email" />)
    expect(screen.getByLabelText('Envoyé le')).toHaveAttribute('max', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })
})
