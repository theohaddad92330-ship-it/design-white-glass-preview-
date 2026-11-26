import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../api'

const mutate = vi.fn()
vi.mock('./mission-panel.api', () => ({ useUpdateMission: () => ({ mutate, isPending: false }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const { PlanningPeekDialog } = await import('./PlanningPeekDialog')

const TODAY = '2026-10-22'

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: 'm1',
    workspace_id: 'w',
    account_id: 'a1',
    opportunity_id: null,
    label: 'Audit sécurité applicative',
    status: 'active',
    started_on: '2026-09-01',
    ends_on: '2026-10-30',
    daily_rate: null,
    daily_cost: null,
    contract_kind: 'regie',
    role_title: 'Consultante sécurité applicative',
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: '2026-09-01T00:00:00.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    accountName: 'Thales',
    assignees: [{ id: 'c1', fullName: 'Inès Kaczmarek', photoUrl: null }],
    marginPercent: null,
    ...over,
  }
}

function open(over: Partial<MissionView> = {}) {
  const onClose = vi.fn()
  const onMore = vi.fn()
  render(<PlanningPeekDialog mission={mission(over)} today={TODAY} onClose={onClose} onMore={onMore} />)
  return { onClose, onMore }
}

afterEach(() => {
  cleanup()
  mutate.mockReset()
})

// Théo missions-planning — le coup d'œil : la personne, les dates, le cycle de vie, quatre gestes.
describe('PlanningPeekDialog', () => {
  it('nomme la mission, le compte, la personne et ses dates prévues', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Audit sécurité applicative' })
    expect(within(dialog).getByText('Thales')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Inès Kaczmarek' })).toHaveAttribute('href', '/consultants/c1')
    expect(within(dialog).getByText('1 sept. 2026')).toBeInTheDocument()
    expect(within(dialog).getByText('30 oct. 2026')).toBeInTheDocument()
  })

  it('écrit la frise du cycle de vie : Accord › Démarrage › Mission › Passation › Clôture', () => {
    open()
    const dialog = screen.getByRole('dialog')
    for (const stage of ['Accord', 'Démarrage', 'Mission', 'Passation', 'Clôture']) {
      expect(within(dialog).getByText(stage)).toBeInTheDocument()
    }
  })

  it('dit qu’une fin prévue n’est pas une disponibilité confirmée', () => {
    open()
    expect(screen.getByText(/disponible le 31 oct\. 2026, sous réserve de la suite/i)).toBeInTheDocument()
  })

  it('n’estime RIEN sans date de fin', () => {
    open({ ends_on: null })
    expect(screen.getByText(/aucune fin saisie : aucune disponibilité n’est supposée/i)).toBeInTheDocument()
  })

  it('mène au dossier, aux relevés et au marché de la personne — chaque geste a sa destination', () => {
    open()
    expect(screen.getByRole('link', { name: 'Préparer le point client' })).toHaveAttribute('href', '/missions/m1')
    expect(screen.getByRole('link', { name: 'Voir les relevés' })).toHaveAttribute('href', '/missions/cra')
    expect(screen.getByRole('link', { name: 'Ouvrir la mission' })).toHaveAttribute('href', '/missions/m1')
    expect(screen.getByRole('link', { name: /trouver des missions pour inès kaczmarek/i })).toHaveAttribute(
      'href',
      '/consultants/c1/reverse-market',
    )
  })

  it('« Plus de détails » ouvre le panneau complet, « Revenir au planning » referme', async () => {
    const { onClose, onMore } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Plus de détails' }))
    expect(onMore).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Revenir au planning' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  describe('« Modifier les dates » — un déplacement se valide', () => {
    it('n’écrit rien tant que les dates n’ont pas changé, puis écrit au « Valider »', async () => {
      open()
      await userEvent.click(screen.getByRole('button', { name: 'Modifier les dates' }))
      const dialog = screen.getByRole('dialog', { name: 'Déplacer la mission' })
      const confirm = within(dialog).getByRole('button', { name: 'Valider le déplacement' })
      expect(confirm).toBeDisabled()
      const end = within(dialog).getByLabelText('Fin')
      await userEvent.clear(end)
      await userEvent.type(end, '2026-11-06')
      expect(confirm).toBeEnabled()
      await userEvent.click(confirm)
      expect(mutate).toHaveBeenCalledWith({ startedOn: '2026-09-01', endsOn: '2026-11-06' }, expect.anything())
    })

    it('refuse une fin qui précède le début', async () => {
      open()
      await userEvent.click(screen.getByRole('button', { name: 'Modifier les dates' }))
      const dialog = screen.getByRole('dialog', { name: 'Déplacer la mission' })
      const end = within(dialog).getByLabelText('Fin')
      await userEvent.clear(end)
      await userEvent.type(end, '2026-08-01')
      expect(within(dialog).getByRole('alert')).toHaveTextContent('La fin précède le début.')
      expect(within(dialog).getByRole('button', { name: 'Valider le déplacement' })).toBeDisabled()
    })

    it('« Annuler » revient au coup d’œil sans rien écrire', async () => {
      open()
      await userEvent.click(screen.getByRole('button', { name: 'Modifier les dates' }))
      await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      expect(mutate).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: 'Audit sécurité applicative' })).toBeInTheDocument()
    })
  })
})
