import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { SendReceipt } from './SendReceipt'

/**
 * #2714 — « manque d'un compte rendu après avoir envoyé un email / contacter. »
 * (SKAIZen Group, 22/09/2026). Le récapitulatif existait déjà AVANT l'envoi
 * (le dialog de confirmation) ; rien ne le remplaçait après — un toast qui
 * disparaît et une simple date. `SendReceipt` est ce qui reste affiché une
 * fois l'envoi/la déclaration terminée : destinataire, canal, horodatage, et
 * la NATURE de ce qui est affirmé (`c73_fait_ne_porte_pas_preuve_denvoi`).
 */
const contact = (over: Partial<Contact> = {}): Contact =>
  ({
    id: 'c1',
    account_id: 'acc-1',
    full_name: 'Jean Dupont',
    email: 'jean@corp.fr',
    linkedin_url: 'https://www.linkedin.com/in/jean-dupont',
    ...over,
  }) as Contact

describe('SendReceipt', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('nomme le destinataire, le canal et l’horodatage d’un envoi e-mail VÉRIFIÉ', () => {
    render(<SendReceipt contact={contact()} channel="email" sentAt="2026-09-22T11:00:00.000Z" nature="verified" />)

    expect(screen.getByText('Jean Dupont · jean@corp.fr')).toBeInTheDocument()
    expect(screen.getByText('E-mail')).toBeInTheDocument()
    // La NATURE : un envoi e-mail est VÉRIFIÉ — Bellum sait qu'il est parti.
    expect(screen.getByText(/Expédié par Bellum/)).toBeInTheDocument()
  })

  it('dit la nature DÉCLARÉE d’une prise de contact LinkedIn, jamais confondue avec un envoi vérifié', () => {
    render(
      <SendReceipt
        contact={contact({ email: null })}
        channel="linkedin"
        sentAt="2026-09-22T11:00:00.000Z"
        nature="declared"
      />,
    )

    expect(screen.getByText('Jean Dupont · https://www.linkedin.com/in/jean-dupont')).toBeInTheDocument()
    // GA-44 — l'app ne nomme pas le fournisseur en dehors de Réglages ›
    // Intégrations ou de la surface d'action (ouvrir/rédiger/choisir un
    // canal) ; ce compte rendu ne fait qu'affirmer une NATURE, pas une
    // action : le canal se nomme par sa capacité, jamais par la marque.
    expect(screen.getByText('Réseau professionnel')).toBeInTheDocument()
    // c73_fait_ne_porte_pas_preuve_denvoi — jamais « expédié par Bellum » ici.
    expect(screen.getByText(/Déclaré par toi/)).toBeInTheDocument()
    expect(screen.queryByText(/Expédié par Bellum/)).not.toBeInTheDocument()
  })
})
