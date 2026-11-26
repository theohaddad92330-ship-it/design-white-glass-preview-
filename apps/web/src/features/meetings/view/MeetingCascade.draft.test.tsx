import type { MeetingCascade as Cascade } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { MeetingCascade } from './MeetingCascade'

/**
 * #2103.18 — LE MAIL DE SUIVI SE DÉPOSE EN BROUILLON, IL NE SE COPIE PLUS SEUL.
 *
 * Jusqu'ici la carte « Mail de suivi » ne proposait que de COPIER le texte :
 * le seul chemin d'écriture réellement branché restait « tâches + CRM ». Le
 * copilote prépare, il n'envoie jamais (doctrine) — donc le geste attendu est
 * un VRAI dépôt de brouillon (`mailboxApi.createDraft`, « UN BROUILLON, AUCUN
 * ENVOI »), jamais un envoi, et le résultat ne dit jamais « envoyé ».
 *
 * Les trois obligations d'une garde :
 *  - elle LIT quelque chose (le bouton de dépôt apparaît, l'appel part avec le
 *    VRAI corps du brouillon) ;
 *  - elle sait dire NON (adresse invalide ⇒ fermé ; capacité absente ⇒ rien) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas (la copie reste possible sans
 *    la capacité de dépôt).
 */

const CASCADE: Cascade = {
  cards: [
    {
      kind: 'follow_up_email',
      position: 6,
      band: 'a3',
      state: 'separate_draft',
      itemCount: 1,
      evidence: [{ kind: 'notes-derived' }],
      reachesOutside: true,
    },
  ],
  summary: {
    internalWrites: [],
    externalDrafts: ['follow_up_email'],
    estimatedCredits: 0,
    sources: [],
    droppedWithoutEvidence: 0,
  },
}

describe('#2103.18 — brouillon de mail déposé, jamais envoyé', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('sans capacité de dépôt, seule la copie est proposée', () => {
    render(
      <MeetingCascade
        cascade={CASCADE}
        fromTranscript={false}
        drafts={{ follow_up_email: 'Bonjour, suite à notre échange…' }}
        onApprove={vi.fn()}
        approving={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Copier le brouillon' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Déposer en brouillon' })).not.toBeInTheDocument()
  })

  it('sait dire NON : une adresse invalide laisse le dépôt FERMÉ', () => {
    render(
      <MeetingCascade
        cascade={CASCADE}
        fromTranscript={false}
        drafts={{ follow_up_email: 'Bonjour, suite à notre échange…' }}
        onApprove={vi.fn()}
        approving={false}
        onDepositEmailDraft={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Déposer en brouillon' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('nom@entreprise.com'), { target: { value: 'pas-une-adresse' } })
    expect(button).toBeDisabled()
  })

  it('une adresse réelle dépose le VRAI corps, et le résultat ne dit jamais « envoyé »', async () => {
    const onDepositEmailDraft = vi.fn().mockResolvedValue({ webUrl: 'https://mail.google.com/draft/42' })
    render(
      <MeetingCascade
        cascade={CASCADE}
        fromTranscript={false}
        drafts={{ follow_up_email: 'Bonjour, suite à notre échange…' }}
        onApprove={vi.fn()}
        approving={false}
        onDepositEmailDraft={onDepositEmailDraft}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('nom@entreprise.com'), { target: { value: 'client@acme.fr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déposer en brouillon' }))
    await waitFor(() => expect(onDepositEmailDraft).toHaveBeenCalledTimes(1))
    expect(onDepositEmailDraft).toHaveBeenCalledWith({
      to: 'client@acme.fr',
      body: 'Bonjour, suite à notre échange…',
    })
    const done = await screen.findByText('Brouillon déposé dans ta messagerie.')
    expect(done).toBeInTheDocument()
    // Le texte de confirmation dit « déposé », jamais « envoyé » — le
    // copilote prépare, il n'envoie jamais (doctrine, décision Louis 21/09).
    expect(done.textContent).not.toMatch(/envoyé/)
    expect(screen.getByRole('link', { name: 'Ouvrir le brouillon' })).toHaveAttribute(
      'href',
      'https://mail.google.com/draft/42',
    )
  })

  it('un échec de dépôt affiche la raison, sans prétendre un succès', async () => {
    const onDepositEmailDraft = vi.fn().mockRejectedValue(new Error('Ce destinataire s’est désabonné.'))
    render(
      <MeetingCascade
        cascade={CASCADE}
        fromTranscript={false}
        drafts={{ follow_up_email: 'Bonjour…' }}
        onApprove={vi.fn()}
        approving={false}
        onDepositEmailDraft={onDepositEmailDraft}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('nom@entreprise.com'), { target: { value: 'client@acme.fr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déposer en brouillon' }))
    expect(await screen.findByText('Ce destinataire s’est désabonné.')).toBeInTheDocument()
    expect(screen.queryByText('Brouillon déposé dans ta messagerie.')).not.toBeInTheDocument()
  })
})
