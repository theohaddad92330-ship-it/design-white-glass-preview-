import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TeamSoloState } from './TeamSoloState'

// Théo A today-equipe.A1 — un espace solo n'est plus renvoyé ailleurs : l'onglet
// Équipe reste visible et DIT pourquoi il est vide, avec le geste pour l'ouvrir.
describe('TeamSoloState', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('dit que l’espace n’a qu’un membre et mène à l’invitation', async () => {
    renderWithRouter(<TeamSoloState />, '/team')
    expect(await screen.findByRole('heading', { level: 1, name: 'Équipe.' })).toBeInTheDocument()
    expect(screen.getByText('Ton espace n’a qu’un membre.')).toBeInTheDocument()
    expect(screen.getByText(/Le pilotage collectif s’ouvre dès le deuxième membre/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inviter un collègue' })).toHaveAttribute('href', '/settings/team')
  })

  it('ne montre aucun chiffre d’équipe : rien à compter à un seul', async () => {
    renderWithRouter(<TeamSoloState />, '/team')
    await screen.findByText('Ton espace n’a qu’un membre.')
    expect(screen.queryByText(/Actions à faire/)).not.toBeInTheDocument()
  })
})
