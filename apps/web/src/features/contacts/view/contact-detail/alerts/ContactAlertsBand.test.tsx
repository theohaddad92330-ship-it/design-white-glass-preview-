import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { ContactAlertsBand } from './ContactAlertsBand'
import { ContactAlertSlot } from './ContactAlertSlot'
import { readAlertMemory, writeAlertMemory } from './contactAlertMemory'

/**
 * #4596 — le bandeau « Avant d'agir » : replié par défaut, mais le pli DIT ce qu'il cache ; une carte neuve l'ouvre ;
 * « Ignorer » range une carte (réversible, par carte, jamais « tout ») ; « Revérifier » dit quand.
 */
const USER = '11111111-1111-4111-8111-111111111111'
const CONTACT = 'contact-1'

function Cards({ recheck }: { recheck?: () => Promise<unknown> }) {
  return (
    <ContactAlertsBand contactId={CONTACT}>
      <ContactAlertSlot
        id="a"
        title="Carte A"
        signature="sa"
        onRecheck={recheck}
        gestures={<button type="button">Geste A</button>}
      >
        <p>Corps A</p>
      </ContactAlertSlot>
      <ContactAlertSlot id="b" title="Carte B" signature="sb">
        <p>Corps B</p>
      </ContactAlertSlot>
    </ContactAlertsBand>
  )
}

const fold = () => screen.getByRole('button', { name: /à vérifier avant d’agir|rangé/i })

describe('ContactAlertsBand (#4596)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    window.localStorage.clear()
    useCurrentUserStore.setState({ currentUser: { id: USER, email: 'a@b.fr', created_at: '2026-01-01', roles: [] } })
  })

  it('aucune carte : ni bandeau ni pli', () => {
    render(<ContactAlertsBand contactId={CONTACT}>{null}</ContactAlertsBand>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('region', { hidden: true }).className).toContain('hidden')
  })

  it('cartes jamais vues : le pli est OUVERT et annonce le nombre', async () => {
    render(<Cards />)
    await waitFor(() => expect(fold()).toHaveAttribute('aria-expanded', 'true'))
    expect(fold()).toHaveTextContent('2 points à vérifier avant d’agir')
    expect(screen.getByText('Corps A')).toBeVisible()
  })

  it('cartes déjà lues : le pli reste FERMÉ mais DIT ce qu’il cache', async () => {
    writeAlertMemory(USER, CONTACT, { a: { seen: 'sa' }, b: { seen: 'sb' } })
    render(<Cards />)
    await waitFor(() => expect(fold()).toHaveTextContent('2 points à vérifier avant d’agir'))
    expect(fold()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Corps A')).not.toBeVisible()
  })

  it('une carte dont le contenu a changé rouvre le pli', async () => {
    writeAlertMemory(USER, CONTACT, { a: { seen: 'ancienne' }, b: { seen: 'sb' } })
    render(<Cards />)
    await waitFor(() => expect(fold()).toHaveAttribute('aria-expanded', 'true'))
  })

  it('une carte ignorée ou lue laisse le pli fermé ; le replier à la main n’est pas défait', async () => {
    writeAlertMemory(USER, CONTACT, {
      a: { ignoredAt: '2026-10-25T08:00:00.000Z', ignoredSignature: 'sa' },
      b: { seen: 'sb' },
    })
    render(<Cards />)
    await waitFor(() => expect(fold()).toHaveTextContent('1 point à vérifier avant d’agir'))
    expect(fold()).toHaveAttribute('aria-expanded', 'false')
    expect(fold()).toHaveTextContent('1 ignorée')
  })

  it('« Ignorer » range UNE carte, la marque « ignorée le … », ne l’efface pas, et se rétablit', async () => {
    render(<Cards />)
    await waitFor(() => expect(fold()).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.queryByRole('button', { name: /tout ignorer/i })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Ignorer' })[0])
    expect(screen.queryByText('Corps A')).toBeNull()
    expect(screen.getByText('Carte A')).toBeInTheDocument()
    expect(screen.getByText(/Ignorée le/)).toBeInTheDocument()
    expect(screen.getByText('Corps B')).toBeInTheDocument()
    expect(fold()).toHaveTextContent('1 point à vérifier avant d’agir')
    expect(readAlertMemory(USER, CONTACT).a?.ignoredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    fireEvent.click(screen.getByRole('button', { name: 'Rétablir' }))
    expect(screen.getByText('Corps A')).toBeInTheDocument()
    expect(readAlertMemory(USER, CONTACT).a?.ignoredAt).toBeUndefined()
  })

  it('le souvenir est PAR PERSONNE : une autre personne revoit la carte neuve', async () => {
    writeAlertMemory('autre-personne', CONTACT, { a: { seen: 'sa' }, b: { seen: 'sb' } })
    render(<Cards />)
    await waitFor(() => expect(fold()).toHaveAttribute('aria-expanded', 'true'))
  })

  it('« Revérifier » relance la vérification de la carte et dit quand elle a été refaite', async () => {
    const recheck = vi.fn().mockResolvedValue(undefined)
    render(<Cards recheck={recheck} />)
    await waitFor(() => expect(fold()).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.queryByText(/Revérifié le/)).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revérifier' }))
    })
    expect(recheck).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Revérifié le/)).toBeInTheDocument()
    expect(readAlertMemory(USER, CONTACT).a?.recheckedAt).toBeTruthy()
  })

  it('une vérification qui échoue ne prétend pas avoir été refaite', async () => {
    const recheck = vi.fn().mockRejectedValue(new Error('réseau'))
    render(<Cards recheck={recheck} />)
    await waitFor(() => expect(fold()).toHaveAttribute('aria-expanded', 'true'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revérifier' }))
    })
    expect(screen.queryByText(/Revérifié le/)).toBeNull()
  })

  it('le geste propre à la carte est rendu avec elle ; hors bandeau, la carte reste telle quelle', () => {
    render(
      <ContactAlertSlot id="x" title="X" signature="s">
        <p>Corps X</p>
      </ContactAlertSlot>,
    )
    expect(screen.getByText('Corps X')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ignorer' })).toBeNull()
  })

  it('rien ne bloque : aucun bouton du bandeau n’est désactivé', async () => {
    render(<Cards recheck={vi.fn().mockResolvedValue(undefined)} />)
    await waitFor(() => expect(fold()).toHaveAttribute('aria-expanded', 'true'))
    for (const button of screen.getAllByRole('button')) expect(button).not.toBeDisabled()
  })
})
