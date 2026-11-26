import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact, SessionUser } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { SessionContext } from '@/features/auth/session-context'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactHeader } from './ContactHeader'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), warning: vi.fn() } }))
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({ useEnrichContact: vi.fn() }))

// #2160.9 — « Attribuer » depuis la fiche : mêmes doubles que le menu ⋯ de la
// liste (`ContactTableRow.test.tsx`), pour ne payer aucun appel réseau réel.
const { members, assignMutate, demo } = vi.hoisted(() => ({
  members: vi.fn(),
  assignMutate: vi.fn(),
  demo: { isDemo: false },
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => members() }))
vi.mock('@/features/contacts/hooks/useAssignContacts', () => ({
  useAssignContacts: () => ({ mutate: assignMutate, isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.isDemo }))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const mutate = vi.fn()

/** Joignable par email seulement — « Compléter » est donc proposé. */
const contact = {
  id: 'c-1',
  account_id: 'acc-1',
  full_name: 'Alice Martin',
  title: 'DSI',
  entity: 'ACME',
  decision_role: 'technical',
  email: 'alice@acme.co',
  phone: null,
  linkedin_url: null,
} as unknown as Contact

/** #4331.2 — les actions de la pile vivent dans « Autres actions » : on ouvre le menu d'abord. */
async function openMoreActions() {
  await user().click(await screen.findByRole('button', { name: 'Autres actions' }))
}

function setCredits(enrichment: number) {
  vi.mocked(useCredits).mockReturnValue({
    // `credits_remaining` aussi : c'est ce que lit `useCreditGate` (le bouton
    // plein « Compléter » en dépend depuis #3021) — le serveur les renvoie
    // toujours égaux en production (`enrichment_credits` en est l'alias
    // déprécié, voir `apps/web/src/features/credits/api.ts`).
    data: { enrichment_credits: enrichment, credits_remaining: enrichment },
    isLoading: false,
  } as unknown as ReturnType<typeof useCredits>)
}

/** #2091 — `useCredits()` avant résolution : `data` est `undefined`, jamais un
 *  solde de repli (voir sa JSDoc « never a zero »). */
function setCreditsLoading() {
  vi.mocked(useCredits).mockReturnValue({
    data: undefined,
    isLoading: true,
  } as unknown as ReturnType<typeof useCredits>)
}

describe('ContactHeader — enrichment never debits without consent', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutate.mockClear()
    vi.mocked(useEnrichContact).mockReturnValue({
      mutate,
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useEnrichContact>)
    setCredits(5)
    members.mockReturnValue({ data: [] })
    assignMutate.mockClear()
    demo.isDemo = false
  })

  it('#2988 (recette écran 28/09/2026) — le bouton plein « Compléter » porte son coût ET propose la portée avant de débiter', async () => {
    // Renversement ASSUMÉ et daté de la partie « le clic débite directement »
    // de #3021 (25/09/2026) : la recette du 28/09 a montré qu'un crédit
    // partait sans jamais proposer le choix Email + téléphone / Email seul /
    // Téléphone seul. Le prix reste annoncé SUR le bouton (grille
    // `CREDIT_WEIGHTS`, inchangé) ; le clic arme désormais la même
    // confirmation que les autres appelants (`EnrichConfirmDialog`, GA-26)
    // au lieu d'enrichir directement.
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} />)

    // #4404.1 — « Compléter » est le bouton posé à côté de « Contacter », plus un item de menu.
    const complete = await screen.findByRole('button', { name: /Enrichir/ })
    expect(complete).not.toHaveTextContent(/cr[ée]dit/)

    await user().click(complete)
    expect(mutate).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Email seulement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Téléphone seulement' })).toBeInTheDocument()

    await user().click(screen.getByRole('button', { name: 'Email seulement' }))
    await user().click(screen.getByRole('button', { name: /^Enrichir$/ }))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ contact, only: 'email' }))
  })

  it('#3693.2 — le menu Contacter ne contient plus « Compléter les infos manquantes » ; Enrichir reste un bouton distinct', async () => {
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} />)

    await user().click(await screen.findByRole('button', { name: /Contacter/ }))
    expect(await screen.findByText('Préparer un email')).toBeInTheDocument()
    expect(screen.queryByText('Compléter les infos manquantes')).not.toBeInTheDocument()
    expect(screen.getByText('Ajouter à une séquence')).toBeInTheDocument()
    await user().keyboard('{Escape}')
    // #4404.1 — Enrichir est TOUJOURS le bouton voisin de « Contacter », coût annoncé.
    expect(await screen.findByRole('button', { name: /Enrichir/ })).toBeInTheDocument()
  })

  it('#3640 — « Notes » se pose avec « Contacter » et mène aux notes', async () => {
    const onOpenNotes = vi.fn()
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} onOpenNotes={onOpenNotes} />)

    await openMoreActions()
    await user().click(await screen.findByRole('menuitem', { name: 'Notes' }))
    expect(onOpenNotes).toHaveBeenCalledTimes(1)
  })

  it('disables the completion when the enrichment balance is empty (no doomed 402)', async () => {
    setCredits(0)
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} />)

    const complete = await screen.findByRole('button', { name: /Enrichir/ })
    expect(complete).toBeDisabled()
    await user().click(complete)
    expect(mutate).not.toHaveBeenCalled()
  })

  // #2091 — le solde en cours de lecture (`useCredits().isLoading`) ne doit
  // jamais affirmer « plus de crédits », une conclusion fausse tant qu'on n'a
  // pas lu le solde. Depuis #3021, ce bouton passe par le `useCreditGate`
  // PARTAGÉ (même doctrine que le reste du produit, voir sa JSDoc) : « le
  // doute n'interdit pas » — un solde non mesuré laisse cliquer, c'est le
  // serveur qui tranche.
  it('#2091 — solde en cours de lecture : reste cliquable, jamais « plus de crédits »', async () => {
    setCreditsLoading()
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} />)

    const complete = await screen.findByRole('button', { name: /Enrichir/ })
    expect(complete).toBeEnabled()
    expect(complete).not.toHaveAttribute('title', "Plus de crédits d'enrichissement")
  })

  it('stops offering the paid completion after a recent attempt that found nothing', async () => {
    renderWithRouter(
      <ContactHeader
        contact={
          {
            ...contact,
            last_enrichment_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
            last_enrichment_result: 'no_new_data',
            last_enrichment_missing: ['linkedin', 'phone'],
          } as unknown as Contact
        }
        onGenerateMessage={vi.fn()}
      />,
    )

    // #3693.2 — l'explication quitte le menu : elle se lit sur la fiche, à côté
    // de « Enrichir », sans reproposer un clic payant silencieux.
    await screen.findByRole('button', { name: /Contacter/ })
    // #4404.1 — le bouton reste à sa place, désactivé, et dit pourquoi (jamais caché).
    const complete = screen.getByRole('button', { name: /Enrichir/ })
    expect(complete).toBeDisabled()
    expect(complete).toHaveAttribute('aria-description', expect.stringMatching(/Déjà enrichi le/))
    await openMoreActions()
    expect(screen.queryByRole('menuitem', { name: /^Enrichir\b/ })).not.toBeInTheDocument()
    expect(await screen.findByText(/Déjà enrichi le/)).toBeInTheDocument()
    // …et « réessayer quand même » reste atteignable : aucune capacité perdue,
    // le clic ouvre la confirmation de coût au lieu de débiter.
    await user().click(screen.getByRole('menuitem', { name: /Réessayer quand même/ }))
    expect(mutate).not.toHaveBeenCalled()
    expect(await screen.findByText(/via nos sources d'enrichissement/)).toBeInTheDocument()
  })
  // ── #1100 : « Il faudrait un bouton -> Lien vers le linkedin s'il existe. » ──
  //
  // Il existait, mais uniquement dans la carte « profil Apollo », qui ne se rend
  // que si Apollo a renvoyé une charge utile. Un contact dont on connaît l'URL
  // LinkedIn sans profil Apollo n'avait aucun lien — le cas où le commercial
  // n'a justement que ça pour ouvrir la porte.

  it('ouvre le profil LinkedIn du contact quand on en connaît un', async () => {
    renderWithRouter(
      <ContactHeader
        contact={{ ...contact, linkedin_url: 'https://www.linkedin.com/in/frederique-l' } as unknown as Contact}
        onGenerateMessage={vi.fn()}
      />,
    )

    await openMoreActions()
    const lien = await screen.findByRole('menuitem', { name: /LinkedIn/ })
    expect(lien).toHaveAttribute('href', 'https://www.linkedin.com/in/frederique-l')
    expect(lien).toHaveAttribute('target', '_blank')
    expect(lien).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it("n'affiche aucun bouton LinkedIn quand on n'a pas d'URL", () => {
    renderWithRouter(
      <ContactHeader contact={{ ...contact, linkedin_url: null } as unknown as Contact} onGenerateMessage={vi.fn()} />,
    )

    // Un lien mort est pire que pas de lien : on ne promet pas une porte qu'on
    // ne sait pas ouvrir.
    expect(screen.queryByRole('link', { name: /LinkedIn/ })).not.toBeInTheDocument()
  })

  /**
   * #1129 — « ca mets 37/100 en Prio et Secondaire ? […] Comment le scoring est
   * fait ? »
   *
   * L'explication EXISTE — six critères, ce qui n'a pas pu être évalué nommé,
   * le dénominateur dit — mais elle vit sur l'onglet « Rôle », et rien depuis
   * l'entête n'y menait : le commentaire du code affirmait « the breakdown card
   * below » alors qu'elle est sur un AUTRE onglet. Un score nu qu'on ne peut pas
   * ouvrir n'est pas un score, c'est un verdict — exactement ce que la règle
   * « un score n'est jamais nu » interdit.
   */
  const scored = {
    ...contact,
    contact_score: 37,
    contact_score_breakdown: [
      { key: 'role', points: 12, max: 30, evaluated: true, proof: 'Fonction lue sur la fiche' },
      { key: 'proximity', points: 0, max: 20, evaluated: false, proof: 'Périmètre non rattaché' },
    ],
  } as unknown as Contact

  // Théo B c5-fiche-contact — « aucun score en points » : la jauge « 37/100 » quitte l'en-tête. La priorité
  // s'écrit en mot dans « Pourquoi préparer cet échange » (ContactWhyKey), et son détail par axes, en mots,
  // s'ouvre de là (#1129 : un score n'est jamais un verdict sans recours).
  it('Théo c5 — l’en-tête ne montre aucun score en points', async () => {
    renderWithRouter(<ContactHeader contact={scored} onGenerateMessage={vi.fn()} />)
    const hero = await screen.findByTestId('contact-hero')
    expect(hero).not.toHaveTextContent('/100')
    expect(hero).not.toHaveTextContent(/\b37\b/)
  })

  // #2160.10 — l'état relationnel (`user_status`) pilotait déjà la liste, jamais affiché sur la fiche détail.
  // #4504.1 — il reste l'étiquette de relation de l'en-tête (sans badge servi, le statut déclaré).
  it("#2160.10 — affiche le badge d'état relationnel « A répondu »", async () => {
    renderWithRouter(
      <ContactHeader
        contact={{ ...contact, user_status: 'replied' } as unknown as Contact}
        onGenerateMessage={vi.fn()}
      />,
    )
    expect(await screen.findByText('A répondu')).toBeInTheDocument()
  })

  /**
   * #1800 — « tu peux supprimer la notion de favori et cette page ça ne sert à
   * rien » (Louis, arbitrage produit). Retirer le MOYEN, pas seulement la
   * permission : aucun bouton étoile, qu'un contact soit déjà en favori ou non.
   */
  // #3487.1 — UN SEUL bloc « Préparer la première approche » : le bandeau
  // relationnel (`ContactRelationalCtaBanner`) le porte et ouvre le composeur
  // au premier clic ; l'entête garde le libellé générique, sinon le même
  // libellé apparaît deux fois (recette 01/10).
  it.each([
    ['new', /Préparer la première approche/],
    ['silence', /Préparer une reprise/],
    ['replied', /Traiter la réponse/],
  ] as const)('#3487.1 — statut %s : l’entête ne répète pas le CTA du bandeau', async (userStatus, label) => {
    renderWithRouter(
      <ContactHeader
        contact={{ ...contact, user_status: userStatus } as unknown as Contact}
        onGenerateMessage={vi.fn()}
      />,
    )
    await screen.findByText('Alice Martin')
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
  })

  it("#1800 — n'affiche plus aucun bouton favori, en favori ou non", async () => {
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} />)
    await screen.findByText('Alice Martin')

    expect(screen.queryByRole('button', { name: /favori/i })).not.toBeInTheDocument()

    renderWithRouter(
      <ContactHeader contact={{ ...contact, is_favorite: true } as unknown as Contact} onGenerateMessage={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /favori/i })).not.toBeInTheDocument()
  })
})

/**
 * #4504 (contrat Louis 24/10) — l'en-tête COMPACT : avatar · nom · « fonction · compte » · deux étiquettes au plus
 * (relation + rôle) + « Décideur » discret ; à droite Enrichir (secondaire) et Contacter ▾ (principal), puis « … ».
 * Chaque geste retiré est prouvé ABSENT ici et PRÉSENT à son nouvel endroit (Informations clés, modale d'Enrichir,
 * menu « … ») — voir aussi `ContactKeyInfo.test.tsx` (#4504.3).
 */
describe('#4504 — l’en-tête compact de la fiche contact', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    setCredits(5)
    members.mockReturnValue({ data: [] })
    vi.mocked(useEnrichContact).mockReturnValue({
      mutate,
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useEnrichContact>)
  })

  const full = {
    ...contact,
    decision_role: 'economic',
    user_status: 'new',
    updated_at: '2026-09-10T08:00:00.000Z',
    email_bounced_at: '2026-09-22T11:00:00.000Z',
    owner: { user_id: 'u-2', name: 'Camille Dubois' },
    solicitation: { colleague: { user_id: 'u-3', name: 'Karim Haddad' }, lastTouchOn: '2026-09-20', withinDays: 7 },
    tags: ['SAP'],
  } as unknown as Contact

  it('deux étiquettes au plus (relation + rôle) et « Décideur » discret', async () => {
    renderWithRouter(<ContactHeader contact={full} onGenerateMessage={vi.fn()} />)
    const badges = await screen.findByTestId('contact-hero-badges')
    expect(badges).toHaveTextContent('À contacter')
    expect(badges).toHaveTextContent('Interlocuteur métier')
    expect(badges).toHaveTextContent('Décideur')
    // Le rôle décisionnel exact se lit au survol de l'étiquette de rôle.
    expect(screen.getByTitle(/^Rôle décisionnel : /)).toBeInTheDocument()
  })

  it('quittent l’en-tête : ton du message, calcul de l’analyse, « À jour depuis », porteur, Attribuer, sollicitation, rebond, étiquettes', async () => {
    renderWithRouter(<ContactHeader contact={full} onGenerateMessage={vi.fn()} />)
    const hero = await screen.findByTestId('contact-hero')
    expect(hero).not.toHaveTextContent(/Ton du message/)
    expect(hero).not.toHaveTextContent(/calculé par/i)
    expect(hero).not.toHaveTextContent(/À jour depuis/)
    // #2160.9 — revient sur #4504 (contrat Louis 31/10) : le NOM du responsable se relit en tête (lecture seule) ;
    // « Porté par », le signal collègue et « Attribuer » restent dans Informations clés.
    expect(hero).not.toHaveTextContent(/Porté par|Déjà travaillé par/)
    expect(hero).not.toHaveTextContent(/Sollicité par/)
    expect(hero).not.toHaveTextContent(/N’est jamais arrivé/)
    expect(hero).not.toHaveTextContent('SAP')
    expect(screen.queryByRole('button', { name: /Attribuer ce contact/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ne pas contacter/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('« Copier le lien » vit dans le menu « … »', async () => {
    renderWithRouter(<ContactHeader contact={full} onGenerateMessage={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Copier le lien' })).not.toBeInTheDocument()
    await openMoreActions()
    expect(await screen.findByRole('menuitem', { name: 'Copier le lien' })).toBeInTheDocument()
  })

  it('« Nom à révéler » n’est plus une étiquette : la modale d’Enrichir le dit', async () => {
    const masked = {
      ...contact,
      full_name: 'Séverine',
      last_name_obfuscated: 'Mo***y',
    } as unknown as Contact
    renderWithRouter(<ContactHeader contact={masked} onGenerateMessage={vi.fn()} />)
    const hero = await screen.findByTestId('contact-hero')
    expect(hero).not.toHaveTextContent('Nom à révéler')
    await user().click(screen.getByRole('button', { name: /Enrichir/ }))
    const identity = await screen.findByTestId('enrich-identity')
    expect(identity).toHaveTextContent('Nom à révéler')
  })

  it('identité incomplète sans rôle : l’explication et le champ du nom sont DANS la modale, « Enrichir » attend un nom', async () => {
    const anonymous = {
      ...contact,
      full_name: 'Julien',
      title: null,
      email: null,
      decision_role: null,
    } as unknown as Contact
    renderWithRouter(<ContactHeader contact={anonymous} onGenerateMessage={vi.fn()} />)
    await screen.findByTestId('contact-hero')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: /Enrichir/ }))
    const field = await screen.findByRole('textbox', { name: /nom/i })
    const confirm = screen.getByRole('button', { name: /^Enrichir$/ })
    expect(confirm).toBeDisabled()
    await user().type(field, 'Julien Morel')
    expect(confirm).not.toBeDisabled()
  })
})

describe('ContactHeader — responsable du contact (#2160.9)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    setCredits(5)
    vi.mocked(useEnrichContact).mockReturnValue({
      mutate,
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useEnrichContact>)
    members.mockReturnValue({ data: [] })
    demo.isDemo = false
  })

  it('#2160.9 — nomme le responsable dans l’en-tête', async () => {
    const owned = { ...contact, owner: { user_id: 'u-9', name: 'Camille Durand' } } as unknown as Contact
    renderWithRouter(<ContactHeader contact={owned} onGenerateMessage={vi.fn()} />)
    expect(await screen.findByTestId('contact-hero-owner')).toHaveTextContent('Responsable du contact : Camille Durand')
  })

  it('#2160.9 — « Non attribué » quand le contact est lu sans responsable', async () => {
    const free = { ...contact, owner: null } as unknown as Contact
    renderWithRouter(<ContactHeader contact={free} onGenerateMessage={vi.fn()} />)
    expect(await screen.findByTestId('contact-hero-owner')).toHaveTextContent('Responsable du contact : Non attribué')
  })

  it('#2160.9 — responsable non servi : aucune ligne, pas de nom deviné', async () => {
    renderWithRouter(<ContactHeader contact={contact} onGenerateMessage={vi.fn()} />)
    await screen.findByRole('button', { name: /Enrichir/ })
    expect(screen.queryByTestId('contact-hero-owner')).toBeNull()
  })
})
