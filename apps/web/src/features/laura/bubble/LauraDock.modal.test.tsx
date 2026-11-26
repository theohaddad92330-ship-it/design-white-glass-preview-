import { fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AlertDialog, AlertDialogContent, AlertDialogTitle, Dialog, DialogContent, DialogTitle } from '@bellum/ui'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { LauraDock } from './LauraDock'

vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: vi.fn(() => ({ known: true, allowed: true })),
}))

/**
 * #4623 — le dock de Laura (`z-widget`, 80) recouvrait « Appliquer et explorer » dans le dialogue « Cadrer la
 * recherche » de `/discover` (`z-overlay`, 60) : le clic réel n'atteignait pas le bouton. Le dock s'efface tant
 * qu'un dialogue est ouvert, et revient à sa fermeture.
 */
function Harness({ alert = false }: { alert?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        ouvrir le dialogue
      </button>
      {alert ? (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>Une alerte</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent closeLabel="Fermer">
            <DialogTitle>Cadrer la recherche</DialogTitle>
          </DialogContent>
        </Dialog>
      )}
      <LauraDock />
    </>
  )
}

/** Le rond de Laura : le seul bouton `z-widget` de la page de test. */
async function findDock(): Promise<HTMLElement> {
  await screen.findAllByRole('button', { hidden: true })
  const dock = screen.getAllByRole('button', { hidden: true }).find(b => b.className.includes('z-widget'))
  if (!dock) throw new Error('le dock de Laura n’est pas rendu')
  return dock
}

describe('#4623 — le dock de Laura s’efface devant un dialogue ouvert', () => {
  it('visible au repos, caché pendant un Dialog ouvert, de retour à la fermeture', async () => {
    renderWithRouter(<Harness />)
    const bubble = await findDock()
    expect(bubble.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)

    fireEvent.click(screen.getByRole('button', { name: 'ouvrir le dialogue' }))
    expect(await screen.findByText('Cadrer la recherche')).toBeInTheDocument()
    expect(bubble.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    await vi.waitFor(() => expect(screen.queryByText('Cadrer la recherche')).not.toBeInTheDocument())
    expect(bubble.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })

  it('même chose pour une AlertDialog', async () => {
    renderWithRouter(<Harness alert />)
    const bubble = await findDock()
    expect(bubble.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)
    fireEvent.click(screen.getByRole('button', { name: 'ouvrir le dialogue' }))
    expect(await screen.findByText('Une alerte')).toBeInTheDocument()
    expect(bubble.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })

  it('un Dialog FERMÉ (monté mais non ouvert) ne cache pas le dock', async () => {
    renderWithRouter(<Harness />)
    const bubble = await findDock()
    expect(bubble.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })
})
