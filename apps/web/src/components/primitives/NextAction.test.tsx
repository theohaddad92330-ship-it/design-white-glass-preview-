import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { NextAction } from './NextAction'

/**
 * LA PROCHAINE ACTION — un lien, partout, et le MÊME.
 *
 * La fiche de lecture du 26/08 note cette colonne comme le meilleur élément de
 * toutes les maquettes. Ce qui se teste ici, c'est ce qui la distingue d'un
 * libellé : elle MÈNE quelque part, elle se TABULE, et elle sait se taire.
 */
describe('NextAction — le rendu unique de la prochaine action', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('rend un LIEN vers l’écran qui porte le geste', async () => {
    renderWithRouter(<NextAction action={{ domain: 'need', action: 'type_skills', needId: 'need-1' }} />)
    const link = await screen.findByRole('link', { name: 'Typer les compétences' })
    expect(link).toHaveAttribute('href', '/projects/needs/need-1')
  })

  // #3559 (recette prod 03/10) — une colonne de tableau qui DOIT se lire en entier.
  it('`wrap` : le libellé passe à la ligne ; par défaut il garde l’ellipse (aucun autre écran ne bouge)', async () => {
    const action = { domain: 'active_mission', action: 'renew_now', missionId: 'm-1' } as const
    const { unmount } = renderWithRouter(<NextAction action={action} wrap />)
    const wrapped = await screen.findByRole('link', { name: 'Engager le renouvellement' })
    expect(wrapped.querySelector('.truncate')).toBeNull()
    expect(wrapped.querySelector('.whitespace-normal')).not.toBeNull()
    unmount()
    renderWithRouter(<NextAction action={action} />)
    const plain = await screen.findByRole('link', { name: 'Engager le renouvellement' })
    expect(plain.querySelector('.truncate')).not.toBeNull()
  })

  it('le libellé PROMET ce qui va se passer — il ne dit pas « voir »', async () => {
    renderWithRouter(<NextAction action={{ domain: 'active_mission', action: 'renew_now', missionId: 'm-1' }} />)
    const link = await screen.findByRole('link', { name: 'Engager le renouvellement' })
    expect(link).toHaveAttribute('href', '/missions/m-1')
  })

  it('ce qui se clique se TABULE — c’est un vrai `<a>`, jamais un div (GA-35)', async () => {
    renderWithRouter(<NextAction action={{ domain: 'need', action: 'run_matching', needId: 'need-1' }} />)
    const link = await screen.findByRole('link', { name: 'Lancer le matching' })
    expect(link.tagName).toBe('A')
  })

  it('« aucune » n’est pas une action — l’écran l’écrit, aucun lien ne s’ouvre', async () => {
    renderWithRouter(<NextAction action={{ domain: 'active_mission', action: 'none', missionId: 'm-1' }} />)
    expect(await screen.findByText('Rien à engager maintenant')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('rien à faire du tout : ni lien, ni phrase inventée', () => {
    const { container } = renderWithRouter(<NextAction action={null} />)
    expect(container.textContent).toBe('')
  })

  it('rien à faire, et l’écran a une phrase pour le dire : elle s’affiche, sans lien', async () => {
    renderWithRouter(<NextAction action={null} emptyLabel="Rien à faire ici" />)
    expect(await screen.findByText('Rien à faire ici')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('sur l’écran qui EST la destination, le libellé reste du texte', async () => {
    renderWithRouter(
      <NextAction
        action={{ domain: 'need', action: 'set_target_rate', needId: 'need-1', origin: '/projects/needs/$needId' }}
      />,
    )
    // Un lien vers la page où l'on est déjà promet un déplacement qui n'a pas
    // lieu — et fait douter de tous les autres liens de l'écran.
    //
    // #2175.37 — libellé aligné sur le vocabulaire du produit (« Qualifier le
    // budget », un des six exemples cités) plutôt que « Saisir le tarif cible ».
    expect(await screen.findByText('Qualifier le budget')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('#2175.37 — « Envoyer la shortlist » se lit désormais « Préparer le push », le mot déjà en usage pour un profil qui part chez le client', async () => {
    renderWithRouter(<NextAction action={{ domain: 'need', action: 'send_shortlist', needId: 'need-1' }} />)
    expect(await screen.findByText('Préparer le push')).toBeInTheDocument()
  })

  it('lit aussi le vocabulaire de la facturation, sans le recopier', async () => {
    renderWithRouter(<NextAction action={{ domain: 'invoice_blocker', action: 'missing_timesheet' }} />)
    const link = await screen.findByRole('link')
    expect(link).toHaveAttribute('href', '/missions/cra')
  })

  it('en anglais aussi — le lien n’est pas une chaîne française câblée', async () => {
    await i18n.changeLanguage('en')
    renderWithRouter(<NextAction action={{ domain: 'need', action: 'send_shortlist', needId: 'need-1' }} />)
    const link = await screen.findByRole('link')
    expect(link).toHaveAttribute('href', '/projects/needs/need-1')
    expect(link.textContent?.trim()).not.toBe('')
    // La clé brute ne doit JAMAIS s'afficher : ce serait la preuve d'une clé
    // absente du namespace anglais.
    expect(link.textContent).not.toContain('openNeeds.nextAction')
  })
})
