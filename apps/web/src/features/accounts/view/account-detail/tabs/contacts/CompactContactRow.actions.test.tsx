import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { CompactContactRow } from './CompactContactRow'

/**
 * #2120.40 / #2120.42 / #2120.44 — les actions terrain de la ligne compacte
 * du dossier (onglet Contacts), absentes avant ce lot :
 *  - « Préparer un message » OUVRE le brouillon (panneau d'engagement) au lieu
 *    de l'envoyer directement — c'était `row.sendDraft`, qui appelait
 *    `useSendContactEmail().mutate` sur un simple clic de menu ;
 *  - « Ajouter au plan » réutilise le hook `useAddContactsToPlan` déjà lu par
 *    le portefeuille /contacts (pas un second mécanisme) ;
 *  - « Masquer » pose l'état réversible (`useHideContact`), jamais une
 *    suppression.
 */

const addToPlanMutate = vi.fn()
const hideMutate = vi.fn()
const openEngagement = vi.fn()

vi.mock('@/features/contacts/hooks/useAddContactsToPlan', () => ({
  useAddContactsToPlan: () => ({ mutate: addToPlanMutate, isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useHideContact', () => ({
  useHideContact: () => ({ mutate: hideMutate, isPending: false }),
}))
vi.mock('../../components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement }),
  useOptionalContactEngagement: () => ({ openEngagement }),
}))

function contact(partial: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Camille Roux',
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 3,
    email: 'camille@acme.fr',
    email_verified: false,
    phone: null,
    linkedin_url: null,
    photo_url: null,
    profile_summary: null,
    why_contact: null,
    email_message: { subject: 'Bonjour', body: 'Bonjour Camille,' },
    linkedin_message: null,
    phone_script: null,
    followup_message: null,
    user_status: 'not_contacted',
    source: null,
    ...partial,
  } as unknown as Contact
}

function draw(c: Contact) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CompactContactRow contact={c} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  addToPlanMutate.mockReset()
  hideMutate.mockReset()
  openEngagement.mockReset()
})

describe('CompactContactRow — actions terrain', () => {
  it('« Préparer un message » ouvre le panneau d’engagement, jamais un envoi direct', async () => {
    draw(contact())
    await userEvent.click(screen.getByRole('button', { name: /actions pour/i }))
    await userEvent.click(screen.getByText('Préparer un message'))
    expect(openEngagement).toHaveBeenCalledWith([expect.objectContaining({ id: 'c1' })], 'email')
  })

  // #4062.1 — sans e-mail, seul l'ENVOI est bloqué (EngagementSendEmail `noEmail`) : on prépare.
  it('#4062.1 — « Préparer un message » reste actif sans e-mail ni brouillon', async () => {
    draw(contact({ email: null, email_message: null }))
    await userEvent.click(screen.getByRole('button', { name: /actions pour/i }))
    const item = screen.getByText('Préparer un message').closest('[role="menuitem"]')
    expect(item).not.toHaveAttribute('data-disabled')
    await userEvent.click(screen.getByText('Préparer un message'))
    expect(openEngagement).toHaveBeenCalledWith([expect.objectContaining({ id: 'c1' })], 'email')
  })

  it('« Ajouter au plan » appelle le hook partagé avec CE contact', async () => {
    draw(contact())
    await userEvent.click(screen.getByRole('button', { name: /actions pour/i }))
    await userEvent.click(screen.getByText('Ajouter au plan'))
    expect(addToPlanMutate).toHaveBeenCalledWith([expect.objectContaining({ id: 'c1' })])
  })

  it('« Masquer » pose `hidden: true`, jamais une suppression', async () => {
    draw(contact())
    await userEvent.click(screen.getByRole('button', { name: /actions pour/i }))
    await userEvent.click(screen.getByText('Masquer'))
    expect(hideMutate).toHaveBeenCalledWith({ contact: expect.objectContaining({ id: 'c1' }), hidden: true })
  })

  it('« Ajouter au plan » est désactivé pour un contact à qualifier (sans compte)', async () => {
    draw(contact({ account_id: null }))
    await userEvent.click(screen.getByRole('button', { name: /actions pour/i }))
    expect(screen.getByText('Ajouter au plan').closest('[role="menuitem"]')).toHaveAttribute('data-disabled')
  })

  it('#2716.1 — « Envoyé le … » reste cliquable et ROUVRE le message réellement expédié', async () => {
    // Retour SKAIZen Group (22/09/2026) : « depuis 'envoyé', rien ne mène au
    // message réellement expédié ». `canPrepareDraft` excluait `alreadySent`,
    // donc l'item de menu passait `disabled` dès qu'un e-mail était parti — le
    // clic sur « Envoyé le … » ne faisait plus RIEN, alors que le panneau
    // d'engagement affiche déjà le message envoyé (`EngagementSendEmailAction`
    // → `SendReceipt`, #2714) sans jamais ré-envoyer.
    draw(contact({ email_sent_at: '2026-09-20T10:00:00.000Z' }))
    await userEvent.click(screen.getByRole('button', { name: /actions pour/i }))
    const sentItem = screen.getByText(/Envoyé le/).closest('[role="menuitem"]')
    expect(sentItem).not.toHaveAttribute('data-disabled')
    await userEvent.click(screen.getByText(/Envoyé le/))
    expect(openEngagement).toHaveBeenCalledWith([expect.objectContaining({ id: 'c1' })], 'email')
  })
})

/**
 * #2120.45 — « Corriger » depuis la ligne : le formulaire de correction s'ouvre
 * SUR PLACE, sans quitter la liste. C'est la fiche d'identité corrigeable de la
 * fiche contact (`ContactRecordCard`), la même — pas un second formulaire.
 */
vi.mock('@/features/contacts/view/contact-detail/components/ContactRecordCard', () => ({
  ContactRecordCard: ({ contact: c }: { contact: Contact }) => <div data-testid="record-card">{c.full_name}</div>,
}))

describe('CompactContactRow — #2120.45 corriger depuis la ligne', () => {
  it('« Corriger » ouvre le formulaire de correction de CE contact', async () => {
    draw(contact())
    expect(screen.queryByTestId('record-card')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /actions pour/i }))
    await userEvent.click(screen.getByText('Corriger'))
    const dialog = await screen.findByRole('dialog', { name: 'Corriger Camille Roux' })
    expect(dialog).toHaveTextContent('Camille Roux')
    expect(screen.getByTestId('record-card')).toBeInTheDocument()
  })
})

/**
 * #2725 — « rien ne mène à la fiche complète depuis les vues en résumé » (Loïc
 * Inacio, 22/09/2026). La ligne ouvre déjà la fiche au clic (`onContactClick`,
 * #2150.62) et via « Voir la fiche » dans le menu « … » ci-dessus — mais rien
 * ne le DIT avant le clic, c'est la moitié manquante du retour.
 */
describe('CompactContactRow — #2725 annonce la fiche avant le clic', () => {
  it('porte un indice visuel de destination', () => {
    const { container } = draw(contact())
    expect(container.querySelector('[data-testid="account-contact-row-open-hint"]')).not.toBeNull()
  })
})

/** Recette démo Orange 12/10/2026 — un contact sans titre ne porte pas « - » : on n'affiche pas ce qu'on n'a pas. */
describe('CompactContactRow — titre absent', () => {
  it('ne rend aucun « - » à la place du titre', () => {
    draw(contact({ title: null, entity: 'Orange', decision_role: 'technical' }))
    expect(screen.queryByText('-')).not.toBeInTheDocument()
  })

  it('rend le titre quand il existe', () => {
    draw(contact({ title: 'Directeur SI' }))
    expect(screen.getByText('Directeur SI')).toBeInTheDocument()
  })
})

/** Recette 12/10/2026 (Louis, « carré ») — rôle absent : rien (pas « - ») ; e-mail : la colonne a la place de se lire. */
describe('CompactContactRow — rôle et e-mail', () => {
  it('un contact sans rôle ni entité ne rend aucun « - »', () => {
    draw(contact({ decision_role: null, entity: null }))
    expect(screen.queryByText('-')).not.toBeInTheDocument()
  })

  it('un rôle connu garde sa pastille', () => {
    draw(contact({ decision_role: 'technical' }))
    expect(screen.getByText(i18n.t('contacts:roles.technical'))).toBeInTheDocument()
  })

  it('la colonne e-mail réserve de quoi lire une adresse d’entreprise (≥ 220 px), pas 140 px tronqués', () => {
    const { container } = draw(contact({ email: 'olivier.guenon@orange.com' }))
    const row = container.querySelector('[role="button"]') as HTMLElement
    expect(row.className).toMatch(/minmax\(2[2-9]\dpx,/)
    expect(row.className).not.toContain('minmax(140px,1fr)')
  })
})

// Recette 13/10/2026 — intitulé et e-mail longs : lisibles en entier (deux lignes / survol), date et rôle sans bruit.
describe('CompactContactRow — lisibilité (13/10)', () => {
  it('l intitulé long passe sur deux lignes avec son texte entier au survol, l e-mail aussi', () => {
    const long = 'Directeur des systemes d information et de la transformation numerique du groupe'
    draw(contact({ title: long, email: 'prenom.nom-tres-long@orange.com' }))
    expect(screen.getByText(long)).toHaveAttribute('title', long)
    expect(screen.getByText(long).className).toContain('line-clamp-2')
    // #4503 — l'adresse est rendue en deux blocs (coupure d'abord à « @ ») : on la retrouve par son titre, texte entier.
    expect(screen.getByTitle('prenom.nom-tres-long@orange.com')).toHaveTextContent(
      /^prenom\.nom-tres-long@orange\.com$/,
    )
  })

  // Recette 13/10/2026 — #4124 avait élargi la 2e piste (Entité) en la croyant celle du Rôle : « économique » débordait
  // toujours (79 > 76 px). Le test lit donc la piste de la cellule qui PORTE la pastille, jamais une position supposée.
  it('la piste de la cellule Rôle (xl et max-xl) est assez large pour « Décideur économique »', () => {
    draw(contact({ decision_role: 'economic' as Contact['decision_role'] }))
    const badge = screen.getAllByText(/Décideur économique/i).find(el => el.closest('[class*="grid-cols"]'))
    const row = badge?.closest('[class*="grid-cols"]') as HTMLElement
    const cells = Array.from(row.children) as HTMLElement[]
    const roleCell = cells.find(c => c.contains(badge ?? null)) as HTMLElement
    const tracks = (prefix: string) =>
      (row.className.match(new RegExp(`(?:^|\\s)${prefix}grid-cols-\\[([^\\]]+)\\]`))?.[1] ?? '').split('_')
    const xl = tracks('')
    const maxXl = tracks('max-xl:')
    expect(xl[cells.indexOf(roleCell)]).toMatch(/^minmax\(128px,/)
    const visibleSousXl = cells.filter(c => !c.className.includes('max-xl:hidden'))
    expect(maxXl[visibleSousXl.indexOf(roleCell)]).toMatch(/^minmax\(128px,/)
  })

  it('un rôle inconnu ne fait aucune pastille « Inconnu »', () => {
    draw(contact({ decision_role: 'unknown' as Contact['decision_role'] }))
    expect(screen.queryByText('Inconnu')).not.toBeInTheDocument()
  })
})

// LOIC-FIX2 O.4 — recette 20/10 : le chevron était un svg nu 14×14 et le nom un div, sans lien ni nom accessible.
describe('CompactContactRow — LOIC-FIX2 O.4 cibles ≥ 44 px vers la fiche', () => {
  function drawWithClick(c: Contact, onContactClick: (c: Contact) => void) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <CompactContactRow contact={c} onContactClick={onContactClick} />
      </QueryClientProvider>,
    )
  }

  it('le chevron est un bouton nommé « Ouvrir la fiche de <Nom> » de 44 × 44 px', async () => {
    const onContactClick = vi.fn()
    drawWithClick(contact(), onContactClick)
    const open = screen.getAllByRole('button', { name: 'Ouvrir la fiche de Camille Roux' })
    const chevron = open.find(el => el.querySelector('[data-testid="account-contact-row-open-hint"]'))
    expect(chevron).toBeDefined()
    expect(chevron?.className).toMatch(/min-h-11/)
    expect(chevron?.className).toMatch(/min-w-11/)
    await userEvent.click(chevron as HTMLElement)
    expect(onContactClick).toHaveBeenCalledTimes(1)
  })

  it('le nom est un lien vers la fiche, d’au moins 44 px de haut', async () => {
    const onContactClick = vi.fn()
    drawWithClick(contact(), onContactClick)
    const name = screen.getByRole('button', { name: 'Camille Roux' })
    expect(name.className).toMatch(/min-h-11/)
    await userEvent.click(name)
    expect(onContactClick).toHaveBeenCalledTimes(1)
  })
})
