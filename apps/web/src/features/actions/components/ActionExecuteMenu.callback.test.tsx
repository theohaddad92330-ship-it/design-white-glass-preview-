import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionExecuteMenu } from './ActionExecuteMenu'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

async function chooseCallback(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole('button', { name: 'Actions exécutables' }))
  await u.click(await screen.findByText('Marquer fait'))
  await screen.findByText('Positif')
  fireEvent.click(screen.getByRole('menuitem', { name: 'À rappeler' }))
}

/**
 * #3416.2b — l'issue « À rappeler » demande une date FACULTATIVE : avec date la
 * tâche datée naît côté serveur, sans date rien. Le sélecteur ne complète plus
 * l'action avant d'avoir posé la question.
 */
describe('ActionExecuteMenu — date de rappel (#3416.2b)', () => {
  it('« À rappeler » ouvre un champ date accessible, et envoie la date choisie', async () => {
    const onMarkDone = vi.fn()
    const u = user()
    render(<ActionExecuteMenu status="todo" onMarkDone={onMarkDone} targetKind="contact" />)

    await chooseCallback(u)
    expect(onMarkDone).not.toHaveBeenCalled()

    const input = await screen.findByLabelText('Date du rappel (facultative)')
    expect(input).toHaveAttribute('type', 'date')
    expect(input.className).toMatch(/min-h-11/)
    fireEvent.change(input, { target: { value: '2026-10-20' } })
    await u.click(screen.getByRole('button', { name: 'Marquer fait' }))

    expect(onMarkDone).toHaveBeenCalledTimes(1)
    expect(onMarkDone).toHaveBeenCalledWith('callback_scheduled', { callbackDate: '2026-10-20' })
  })

  it('sans date : l’issue part seule, aucune date inventée', async () => {
    const onMarkDone = vi.fn()
    const u = user()
    render(<ActionExecuteMenu status="todo" onMarkDone={onMarkDone} targetKind="contact" />)

    await chooseCallback(u)
    await screen.findByLabelText('Date du rappel (facultative)')
    await u.click(screen.getByRole('button', { name: 'Marquer fait' }))

    expect(onMarkDone).toHaveBeenCalledWith('callback_scheduled')
  })

  it('les autres issues ne demandent aucune date — il sait dire NON', async () => {
    const onMarkDone = vi.fn()
    const u = user()
    render(<ActionExecuteMenu status="todo" onMarkDone={onMarkDone} targetKind="contact" />)

    await u.click(screen.getByRole('button', { name: 'Actions exécutables' }))
    await u.click(await screen.findByText('Marquer fait'))
    await screen.findByText('Positif')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Positif' }))

    expect(onMarkDone).toHaveBeenCalledWith('positive')
    expect(screen.queryByLabelText('Date du rappel (facultative)')).toBeNull()
  })
})
