import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { ConnectorTile as Model } from '../lib/connector-tiles'
import { ConnectorTile } from './ConnectorTile'

const tile = (over: Partial<Model>): Model => ({
  id: 'hubspot',
  connector: 'hubspot',
  family: 'crm',
  status: 'available',
  action: 'journey',
  name: 'HubSpot',
  ...over,
})

describe('#4510 — la carte de la grille = maquette V22 (logo, nom, apport, phrase, état, « Voir le parcours »)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('dit l’outil, ce qu’il apporte, sa phrase, son état — et un seul geste : « Voir le parcours »', () => {
    render(<ConnectorTile tile={tile({})} onOpen={() => undefined} />)
    const card = screen.getByTestId('connector-tile-hubspot')
    expect(within(card).getByRole('heading', { level: 3, name: 'HubSpot' })).toBeInTheDocument()
    expect(within(card).getByText('Comptes, contacts, affaires')).toBeInTheDocument()
    expect(within(card).getByText(/Lire les dossiers autorisés/)).toBeInTheDocument()
    expect(within(card).getByText('Non branché')).toBeInTheDocument()
    expect(
      within(card)
        .getAllByRole('button')
        .map(b => b.getAttribute('aria-label')),
    ).toEqual(['Voir le parcours : HubSpot'])
  })

  it('carte COURTE (~250 px) : trois rangées — en-tête, phrase, pied — et rien du détail d’avant', () => {
    render(<ConnectorTile tile={tile({ status: 'connected', action: 'manage' })} onOpen={() => undefined} />)
    const card = screen.getByTestId('connector-tile-hubspot')
    expect(card.children).toHaveLength(3)
    // Le détail vit dans le tiroir : ni droits, ni capacités, ni Déconnecter sur la carte.
    expect(within(card).queryByRole('button', { name: /Déconnecter/ })).not.toBeInTheDocument()
    expect(within(card).queryByText(/autorise|Ce qui est lu|sandbox/i)).not.toBeInTheDocument()
    // La phrase est bornée à deux lignes : la hauteur ne dépend pas de la longueur du texte.
    expect(within(card).getByText(/Lire les dossiers autorisés/).className).toContain('line-clamp-2')
  })

  it('les trois états du contrat : Branché / À reconnecter / Non branché', () => {
    const { rerender } = render(
      <ConnectorTile tile={tile({ status: 'connected', action: 'manage' })} onOpen={() => undefined} />,
    )
    expect(screen.getByText('Branché')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voir le parcours : HubSpot' })).toBeInTheDocument()
    rerender(<ConnectorTile tile={tile({ status: 'action_required', action: 'repair' })} onOpen={() => undefined} />)
    expect(screen.getByText('À reconnecter')).toBeInTheDocument()
  })

  it('autorisation expirée : « Reconnecter » reste SUR la carte, à côté de « Voir le parcours »', async () => {
    const onOpen = vi.fn()
    const model = tile({ status: 'action_required', action: 'repair' })
    render(<ConnectorTile tile={model} onOpen={onOpen} />)
    const reconnect = screen.getByRole('button', { name: 'Reconnecter : HubSpot' })
    expect(screen.getByRole('button', { name: 'Voir le parcours : HubSpot' })).toBeInTheDocument()
    await userEvent.setup({ pointerEventsCheck: 0 }).click(reconnect)
    expect(onOpen).toHaveBeenCalledWith(model)
  })

  it('« Reconnecter » n’apparaît QUE sur une autorisation expirée', () => {
    render(<ConnectorTile tile={tile({ status: 'connected', action: 'manage' })} onOpen={() => undefined} />)
    expect(screen.queryByRole('button', { name: /Reconnecter/ })).not.toBeInTheDocument()
  })

  it('« Voir le parcours » ouvre le tiroir de CETTE tuile', async () => {
    const onOpen = vi.fn()
    const model = tile({})
    render(<ConnectorTile tile={model} onOpen={onOpen} />)
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith(model)
  })

  it('Collective.work : « périmètre à contractualiser », jamais un « Connecter »', () => {
    render(
      <ConnectorTile
        tile={tile({ id: 'collective_work', connector: 'webhook', status: 'contractual', name: 'Collective.work' })}
        onOpen={() => undefined}
      />,
    )
    expect(screen.getAllByText('Périmètre à contractualiser').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Connecter/ })).not.toBeInTheDocument()
  })
})
