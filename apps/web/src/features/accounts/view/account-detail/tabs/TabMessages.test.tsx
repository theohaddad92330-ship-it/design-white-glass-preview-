import type { Account, Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TabId } from '../components/AccountDetailTabsBar'
import {
  ContactEngagementContext,
  type ContactEngagementContextValue,
} from '../components/contact-engagement/ContactEngagementContext'
import { TabMessages } from './TabMessages'

function account(rawAnalysis: Record<string, unknown> = {}): Account {
  return { id: 'a1', raw_analysis: rawAnalysis } as unknown as Account
}

function contact(overrides: Partial<Contact> & { id: string; full_name: string }): Contact {
  return {
    title: null,
    email_message: null,
    linkedin_message: null,
    phone_script: null,
    ...overrides,
  } as unknown as Contact
}

function mount(
  props: { account: Account; contacts: Contact[]; onTabChange?: (tab: TabId) => void },
  openEngagement = vi.fn(),
) {
  const value = { openEngagement } as unknown as ContactEngagementContextValue
  render(
    <ContactEngagementContext.Provider value={value}>
      <TabMessages account={props.account} contacts={props.contacts} onTabChange={props.onTabChange ?? (() => {})} />
    </ContactEngagementContext.Provider>,
  )
  return openEngagement
}

/**
 * #2115.26 — LA PRÉPARATION DES MESSAGES EST UNE PORTE, PAS UNE SECONDE SURFACE.
 *
 * L'ancien onglet Messages a été supprimé le 22/07/2026 parce qu'il était mort
 * ET faux, et parce que le produit avait DÉJÀ sa surface vivante : le panneau
 * d'engagement contact. Ce qui se vérifie ici est exactement cette frontière —
 * la sous-section LISTE et OUVRE, elle ne rend aucun message, elle n'en édite
 * ni n'en envoie aucun.
 */
describe('TabMessages — qui a déjà un message, et par quel canal', () => {
  it('ne propose QUE les canaux dont le texte existe', async () => {
    const openEngagement = mount({
      account: account(),
      contacts: [contact({ id: 'c1', full_name: 'Claire Dupuis', linkedin_message: 'Bonjour Claire…' })],
    })

    expect(screen.getByText('Claire Dupuis')).toBeInTheDocument()
    // Un canal sans texte n'est pas offert : un bouton qui ouvre un brouillon
    // vide promet un travail déjà fait qui ne l'est pas.
    expect(screen.getByRole('button', { name: /Relire le message|Read the message/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Relire l’email|Read the email/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Relire le message|Read the message/i }))
    expect(openEngagement).toHaveBeenCalledTimes(1)
    expect(openEngagement.mock.calls[0]?.[1]).toBe('linkedin')
  })

  /**
   * #2617.2 — LE VERBE DU BOUTON DISAIT L'INVERSE DE L'ÉCRAN.
   *
   * Mesuré le 21/09/2026 : un lecteur attentif a conclu de cet écran
   * qu'« aucun message n'est pré-rédigé », parce que chaque bouton disait
   * « Préparer un email ». Or cette sous-section ne liste QUE les personnes
   * dont le message EXISTE déjà (`prepared` plus haut), sous un titre qui dit
   * « Messages déjà préparés » et un sous-titre qui dit « Relire, corriger,
   * puis envoyer ». Le bouton contredisait la carte qui le porte.
   *
   * ⚠️ Le libellé « Préparer… » reste juste AILLEURS — dans le menu de canaux
   * d'un contact (`ContactChannelMenu`), où le texte n'existe pas encore. Ce
   * lot ne touche donc pas `channel.action.*` : il ajoute `channel.review.*`
   * pour la surface qui ouvre un texte DÉJÀ écrit.
   */
  it('#2617.2 — le bouton dit qu’on RELIT un texte écrit, jamais qu’on le prépare', () => {
    mount({
      account: account(),
      contacts: [contact({ id: 'c1', full_name: 'Claire Dupuis', linkedin_message: 'Bonjour Claire…' })],
    })

    expect(screen.queryByRole('button', { name: /Préparer|Prepare/i })).not.toBeInTheDocument()
    // Le test qui sait dire NON : un écran qui n'aurait plus aucun bouton
    // passerait l'assertion du dessus. Celle-ci l'en empêche.
    expect(screen.getByRole('button', { name: /Relire le message|Read the message/i })).toBeInTheDocument()
  })

  it('repêche le message depuis le DOSSIER quand la ligne contact ne le porte pas encore', () => {
    // `plan.contactMessages` est la forme que le pipeline émet ; l'appariement
    // par nom échoue parfois sur la ligne contact, et c'est ce repli qui évite
    // d'annoncer « aucun message » sur un dossier qui en porte vraiment.
    mount({
      account: account({
        plan: { contactMessages: [{ contactName: 'Claire Dupuis', emailSubject: 'Suite', emailBody: 'Bonjour…' }] },
      }),
      contacts: [contact({ id: 'c1', full_name: 'Claire Dupuis' })],
    })

    expect(screen.getByRole('button', { name: /Relire l’email|Read the email/i })).toBeInTheDocument()
  })

  /**
   * #2947/#2204.73 — LE CONTRÔLE DE MASSE, ENFIN APPELÉ.
   *
   * `outreachDuplicateGroups` (packages/contracts) était calculée et testée
   * seule, sans appelant réel — reste nommé par l'épopée #2947 le 26/09. Ce
   * lot est l'appelant : la liste des messages déjà préparés d'UN compte est
   * exactement le lot où « le même texte pour cinquante personnes » devient
   * observable.
   */
  it('#2947/#2204.73 — nomme les personnes qui reçoivent EXACTEMENT le même texte, par canal', () => {
    mount({
      account: account(),
      contacts: [
        contact({ id: 'c1', full_name: 'Claire Dupuis', linkedin_message: 'Bonjour, disponible jeudi ?' }),
        contact({ id: 'c2', full_name: 'Jean Martin', linkedin_message: '  bonjour, disponible   jeudi ? ' }),
        contact({ id: 'c3', full_name: 'Awa Diallo', linkedin_message: 'Un message tout à fait différent.' }),
      ],
    })

    expect(
      screen.getByText(/Même texte parti à plusieurs personnes|Same text sent to several people/i),
    ).toBeInTheDocument()
    const warningLine = screen.getByText(/reçoivent exactement le même message|are getting the exact same message/i)
    expect(warningLine.textContent).toContain('Claire Dupuis')
    expect(warningLine.textContent).toContain('Jean Martin')
    expect(warningLine.textContent).not.toContain('Awa Diallo')
  })

  it('#2947/#2204.73 — sait dire NON : des textes tous différents ne déclenchent aucun avertissement', () => {
    mount({
      account: account(),
      contacts: [
        contact({ id: 'c1', full_name: 'Claire Dupuis', linkedin_message: 'Bonjour Claire, un point sur X ?' }),
        contact({ id: 'c2', full_name: 'Jean Martin', linkedin_message: 'Bonjour Jean, un point sur Y ?' }),
      ],
    })

    expect(
      screen.queryByText(/Même texte parti à plusieurs personnes|Same text sent to several people/i),
    ).not.toBeInTheDocument()
  })

  it('sait dire NON : sans aucun message préparé, la sous-section le DIT et ouvre les contacts', async () => {
    const onTabChange = vi.fn()
    mount({
      account: account(),
      contacts: [contact({ id: 'c1', full_name: 'Claire Dupuis' })],
      onTabChange,
    })

    expect(screen.queryByText('Claire Dupuis')).not.toBeInTheDocument()
    expect(screen.getByText(/Aucun message préparé|No draft prepared/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Ouvrir les contacts|Open contacts/i }))
    expect(onTabChange).toHaveBeenCalledWith('contacts')
  })

  it('#3711.8 — sans message préparé, UNE ligne utile, jamais une grande carte vide', () => {
    mount({ account: account(), contacts: [contact({ id: 'c1', full_name: 'Claire Dupuis' })] })

    const line = screen.getByText(/Aucun message préparé|No draft prepared/i).closest('p')
    expect(line).not.toBeNull()
    // Le constat ET le geste tiennent sur la même ligne.
    expect(line).toContainElement(screen.getByRole('button', { name: /Ouvrir les contacts|Open contacts/i }))
    // Ni grande icône, ni titre d'état vide, ni paragraphe d'explication en plus.
    expect(document.querySelector('svg')).toBeNull()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByText(/se préparent par personne|are prepared per person/i)).not.toBeInTheDocument()
  })
})

/**
 * LOIC-FIX O.1 — UNE ÉTAPE NON FAITE NE SE DÉCLARE JAMAIS FAITE.
 *
 * Recette prod du 20/10 : le compte OGF affichait « Terminé » et un plan de 20
 * actions, mais « Aucun message préparé pour ce compte » — le même constat
 * neutre qu'un compte sans personne. Des personnes existent : les messages n'ont
 * simplement pas été rédigés (analyse interrompue pendant l'étape « messages »).
 * L'écran doit le DIRE et offrir le geste qui prépare, sans relancer l'analyse.
 */
describe('TabMessages — messages non préparés alors que des personnes existent', () => {
  it('nomme le manque et ouvre la préparation du premier contact, sans relancer l’analyse', async () => {
    const openEngagement = mount({
      account: account({ plan: { nextActions: [{ title: 'a' }] } }),
      contacts: [contact({ id: 'c1', full_name: 'Claire Dupuis' }), contact({ id: 'c2', full_name: 'Marc Roy' })],
    })

    expect(screen.getByText(/messages n.ont pas été rédigés|messages were not drafted/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Préparer les messages|Prepare the messages/i }))

    expect(openEngagement).toHaveBeenCalledTimes(1)
    expect((openEngagement.mock.calls[0]?.[0] as Contact[]).map(c => c.id)).toEqual(['c1'])
    expect(openEngagement.mock.calls[0]?.[1]).toBe('email')
  })

  it('reste la ligne neutre quand le compte n’a aucune personne (rien à préparer)', () => {
    mount({ account: account(), contacts: [] })

    expect(
      screen.queryByRole('button', { name: /Préparer les messages|Prepare the messages/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Aucun message préparé|No draft prepared/i)).toBeInTheDocument()
  })
})

/**
 * #O8 — recette Loïc 21/10 : l'analyse finissait « Terminé » avec 0 message préparé et
 * l'écran ne le disait pas. `raw_analysis.plan.messagesStatus === 'missing'` (posé par l'API)
 * nomme l'étape non faite en clair — jamais « 0 message », jamais « Terminé ».
 */
describe('TabMessages — l’étape « messages » non faite se dit en clair (#O8)', () => {
  const people = [contact({ id: 'c1', full_name: 'Claire Dupuis' })]

  it('plan.messagesStatus = missing : « Messages non préparés : relance l’analyse »', () => {
    mount({ account: account({ plan: { messagesStatus: 'missing' } }), contacts: people })

    expect(screen.getByText(/Messages non préparés\s*:\s*relance l.analyse/i)).toBeInTheDocument()
    expect(screen.queryByText(/\b0 message/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Terminé/i)).not.toBeInTheDocument()
  })

  it('sait dire NON : sans le statut, la ligne « relance l’analyse » n’apparaît pas', () => {
    mount({ account: account({ plan: {} }), contacts: people })
    expect(screen.queryByText(/relance l.analyse/i)).not.toBeInTheDocument()
  })

  it('plan absent ou raw_analysis nul : aucun plantage, aucune ligne inventée', () => {
    mount({ account: { id: 'a1', raw_analysis: null } as unknown as Account, contacts: people })
    expect(screen.queryByText(/relance l.analyse/i)).not.toBeInTheDocument()
  })

  it('statut missing mais des messages existent : on montre les messages, pas l’alerte', () => {
    mount({
      account: account({ plan: { messagesStatus: 'missing' } }),
      contacts: [contact({ id: 'c1', full_name: 'Claire Dupuis', linkedin_message: 'Bonjour Claire…' })],
    })
    expect(screen.getByText('Claire Dupuis')).toBeInTheDocument()
    expect(screen.queryByText(/relance l.analyse/i)).not.toBeInTheDocument()
  })

  it('statut missing sans personne : ligne neutre, l’analyse n’a rien à relancer pour les messages', () => {
    mount({ account: account({ plan: { messagesStatus: 'missing' } }), contacts: [] })
    expect(screen.queryByText(/relance l.analyse/i)).not.toBeInTheDocument()
  })
})
