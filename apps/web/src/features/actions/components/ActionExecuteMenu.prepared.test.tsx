import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionExecuteMenu } from './ActionExecuteMenu'

/**
 * #2123.37 — une action du plan peut être marquée « Préparée ».
 *
 * Le statut existait au copilote et nulle part au plan : le commercial qui a
 * écrit son message sans l'envoyer n'avait que « à faire » ou « fait », deux
 * mensonges. Le geste vit dans le même menu que « Marquer fait ».
 */
describe('ActionExecuteMenu — Marquer préparée (#2123.37)', () => {
  it('propose le geste quand le tableau le branche, et l’appelle', async () => {
    const onMarkPrepared = vi.fn()
    const user = userEvent.setup()
    render(<ActionExecuteMenu status="todo" onMarkDone={vi.fn()} onMarkPrepared={onMarkPrepared} />)

    await user.click(screen.getByRole('button', { name: 'Actions exécutables' }))
    await user.click(await screen.findByRole('menuitem', { name: /Marquer préparée/ }))

    expect(onMarkPrepared).toHaveBeenCalledTimes(1)
  })

  it('ne l’invente pas là où rien ne le branche — il sait dire NON', async () => {
    const user = userEvent.setup()
    render(<ActionExecuteMenu status="todo" onMarkDone={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Actions exécutables' }))
    await screen.findByRole('menuitem', { name: /Marquer fait/ })

    expect(screen.queryByRole('menuitem', { name: /Marquer préparée/ })).toBeNull()
  })
})
