import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const centerProps = vi.fn()
vi.mock('@/features/action-os/view/ActionCenter', () => ({
  ActionCenter: (props: Record<string, unknown>) => {
    centerProps(props)
    return <div>Vue d’exécution</div>
  },
}))
vi.mock('@/features/action-history/view/ActionHistoryJournal', () => ({
  ActionHistoryJournal: () => <div>Journal du jour</div>,
}))

import { HistoryDrawer } from './HistoryDrawer'

describe('Tiroir « Historique » (L-A)', () => {
  afterEach(() => {
    cleanup()
    centerProps.mockClear()
  })

  it('ouvre sur le journal d’activité et propose les vues d’exécution en onglets internes', async () => {
    render(<HistoryDrawer open onOpenChange={() => undefined} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Journal du jour')).toBeInTheDocument()
    for (const label of [
      'Journal d’activité',
      'En cours',
      'Terminées',
      'À reprendre',
      'Planifiées',
      'Automatisations',
      'Reportées',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  // #18 — à 1512 px « Reportées » était coupé : la rangée passe à la ligne et ne déborde jamais.
  it('la rangée d’onglets passe à la ligne : jamais coupée', () => {
    render(<HistoryDrawer open onOpenChange={() => undefined} />)
    const row = screen.getByRole('group', { name: 'Historique' })
    expect(row.className).toContain('flex-wrap')
    expect(row.className).toContain('max-w-full')
    expect(row.className).toContain('min-w-0')
    expect(screen.getByRole('button', { name: 'Reportées' }).className).toContain('whitespace-normal')
  })

  it('un onglet d’exécution rend le Centre d’actions en mode tiroir, sur la vue choisie', async () => {
    const user = userEvent.setup()
    render(<HistoryDrawer open onOpenChange={() => undefined} />)
    await user.click(screen.getByRole('button', { name: 'À reprendre' }))
    expect(screen.getByText('Vue d’exécution')).toBeInTheDocument()
    expect(screen.queryByText('Journal du jour')).not.toBeInTheDocument()
    expect(centerProps).toHaveBeenLastCalledWith({ historyTab: 'failed' })
    await user.click(screen.getByRole('button', { name: 'Automatisations' }))
    expect(centerProps).toHaveBeenLastCalledWith({ historyTab: 'workflows' })
  })

  it('s’ouvre directement sur la vue demandée par un lien', () => {
    render(<HistoryDrawer open onOpenChange={() => undefined} initialTab="scheduled" />)
    expect(centerProps).toHaveBeenLastCalledWith({ historyTab: 'scheduled' })
  })

  it('fermé, il ne rend rien', () => {
    render(<HistoryDrawer open={false} onOpenChange={() => undefined} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
