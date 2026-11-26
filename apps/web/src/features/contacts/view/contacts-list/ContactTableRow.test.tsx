import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { Table, TableBody } from '@bellum/ui'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactTableRow } from './ContactTableRow'
import { contactSourceLabel } from '@/features/contacts/lib/contactProvenance'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'

// #2158.76 — capturé (pas jeté) : la ligne du tableau doit ouvrir la fiche au
// clavier (Entrée), pas seulement à la souris. Une factory fraîche à chaque
// rendu empêcherait toute assertion sur l'appel.
const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

// #2160.9 — « Attribuer » depuis le menu ⋯ de la ligne : mêmes doubles que
// `AccountCollaborationBand.test.tsx` (grammaire de compte) — la liste des
// membres et le hook d'écriture ne doivent payer aucun appel réseau réel.
const { members, assignMutate, demo, enrichMutate, toastSuccess, toastError } = vi.hoisted(() => ({
  members: vi.fn(),
  assignMutate: vi.fn(),
  demo: { isDemo: false },
  enrichMutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => members() }))
vi.mock('@/features/contacts/hooks/useAssignContacts', () => ({
  useAssignContacts: () => ({ mutate: assignMutate, isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.isDemo }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: enrichMutate, isPending: false, variables: undefined }),
}))
// #4016.L8b — « ne plus me demander » le coût : absente par défaut (la question se pose).
const costPreference = vi.hoisted(() => ({ skip: false, setSkip: vi.fn() }))
vi.mock('@/features/contacts/hooks/useEnrichmentCostPreference', () => ({
  useEnrichmentCostPreference: () => ({ skip: costPreference.skip, setSkip: costPreference.setSkip }),
}))
// #3713.2 — copier l'e-mail depuis la liste : un presse-papiers refusé se DIT
// (toast), jamais une copie silencieuse qui n'a pas eu lieu.
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}))

beforeAll(() => {
  window.scrollTo = vi.fn()
  // Les menus Radix (dont le sous-menu « Attribuer ») ont besoin de ces API de
  // pointeur, que jsdom n'implémente pas.
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

// La ligne lit les membres de l'espace pour nommer le responsable (#4503.5) : par défaut, aucun membre.
beforeEach(() => {
  members.mockReturnValue({ data: [] })
})

function makeContact(overrides: Partial<GlobalContact> = {}): GlobalContact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Alice Martin',
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 5,
    email: 'alice@corp.co',
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    company_name: 'Corp',
    ...overrides,
  }
}

function renderRow(contact: GlobalContact, initialPath = '/', onFilterBySource?: (source: string) => void) {
  return renderWithRouter(
    <Table>
      <TableBody>
        <ContactTableRow
          contact={contact}
          isSelected={false}
          onRowMouseDown={() => {}}
          onRowMouseEnter={() => {}}
          onSelectionChange={() => {}}
          onFilterBySource={onFilterBySource}
        />
      </TableBody>
    </Table>,
    initialPath,
  )
}

describe('#3549.4 — la liste dit, par contact, ce que les fournisseurs n’ont pas trouvé', () => {
  const attempted = {
    last_enrichment_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    last_enrichment_result: 'no_new_data' as const,
  }

  it('nomme « Téléphone non trouvé » pour un contact enrichi sans numéro, jamais un faux numéro', async () => {
    renderRow(makeContact({ phone: null, linkedin_url: 'https://www.linkedin.com/in/alice', ...attempted }))
    await screen.findByText('Alice Martin')
    // Théo B c1-repertoire.N5 — « Introuvable · <date> » (Louis 22/10) remplace « Non trouvé ».
    expect(screen.getByTestId('contact-row-phone-not-found')).toHaveTextContent(/^Introuvable · /)
  })

  it('#3821 — un texte dans la colonne téléphone n’est jamais affiché comme un numéro', async () => {
    renderRow(makeContact({ phone: 'Disponible dans Apollo', ...attempted }))
    await screen.findByText('Alice Martin')
    expect(screen.queryByText(/Apollo/)).not.toBeInTheDocument()
    expect(screen.getByTestId('contact-row-phone-not-found')).toBeInTheDocument()
  })

  it('J1b — le numéro trouvé porte « Enrichissement · date », jamais le fournisseur', async () => {
    renderRow(
      makeContact({
        phone: '+33 6 12 34 56 78',
        source: 'apollo',
        last_enrichment_at: '2026-10-07T10:00:00.000Z',
      }),
    )
    await screen.findByText('Alice Martin')
    expect(screen.getByText(/^Enrichissement · /)).toBeInTheDocument()
    expect(screen.queryByText(/Apollo/i)).not.toBeInTheDocument()
  })

  it('nomme « E-mail non trouvé » pour un contact enrichi qui n’a que le LinkedIn', async () => {
    renderRow(
      makeContact({ email: null, phone: null, linkedin_url: 'https://www.linkedin.com/in/alice', ...attempted }),
    )
    await screen.findByText('Alice Martin')
    expect(screen.getByTestId('contact-row-email-not-found')).toHaveTextContent(/^Introuvable · /)
  })

  it('nomme « pas encore cherché » pour un contact jamais enrichi : jamais un tiret nu, jamais « non trouvé »', async () => {
    renderRow(makeContact({ email: null, phone: null, linkedin_url: null, decision_role: null }))
    await screen.findByText('Alice Martin')
    expect(screen.queryByTestId('contact-row-phone-not-found')).not.toBeInTheDocument()
    expect(screen.queryByTestId('contact-row-email-not-found')).not.toBeInTheDocument()
    // R24 (15/10) est RENVERSÉ pour les coordonnées (Louis 22/10, Théo B c1-repertoire.N5) : une recherche jamais faite
    // propose « Chercher… » ; jamais « non trouvé » ni un tiret nu.
    expect(screen.queryByText('Pas encore cherché')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Téléphone pas encore cherché')).not.toBeInTheDocument()
    expect(screen.queryByTitle('E-mail pas encore cherché')).not.toBeInTheDocument()
    expect(screen.queryByText('-')).not.toBeInTheDocument()
  })

  it('ne dit rien quand le numéro est là', async () => {
    renderRow(makeContact({ phone: '+33 6 12 34 56 78', ...attempted }))
    await screen.findByText('Alice Martin')
    expect(screen.queryByTestId('contact-row-phone-not-found')).not.toBeInTheDocument()
  })

  // #3850.4 — affichage international lisible, quel que soit le format stocké.
  it('un téléphone stocké en E.164 COMPACT s’affiche en international lisible', async () => {
    renderRow(makeContact({ phone: '+33681050091', ...attempted }))
    await screen.findByText('Alice Martin')
    expect(screen.getByText('+33 6 81 05 00 91')).toBeInTheDocument()
    expect(screen.queryByText('+33681050091')).not.toBeInTheDocument()
  })
})

// #3822.2 / #3850.2 — un canal `unknown` (l'appel a échoué, OU une sonde
// FullEnrich n'a pas eu le temps de conclure) se distingue du « non trouvé »
// (l'appel a répondu, vide) ; persisté par contact et par coordonnée
// (`enrichment_coordinates`, état `unknown` — l'état d'E1), visible après reload — jamais recalculé
// depuis le seul `last_enrichment_at`, qui ne dit rien de QUEL canal attend.
// #3850.2 (08/10) — la copie ne doit jamais affirmer un échec qu'on n'a pas
// constaté : « Erreur » devient « Attente », cohérent avec la doctrine
// « un timeout n'est pas un échec ».
describe('#3822.2/#3850.2 — la ligne nomme un canal `unknown`, distinct d’un « non trouvé »', () => {
  it('nomme « Attente » pour le téléphone quand il est à `unknown` dans `enrichment_coordinates`', async () => {
    renderRow(
      makeContact({
        phone: null,
        enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: '2026-10-07T09:00:00.000Z' } },
      }),
    )
    await screen.findByText('Alice Martin')
    expect(
      screen.getByTitle("En attente du fournisseur — la recherche de téléphone n'a pas conclu, réessaie"),
    ).toHaveTextContent('Attente')
    expect(screen.queryByTitle('Téléphone non trouvé')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Téléphone pas encore cherché')).not.toBeInTheDocument()
  })

  it('nomme « Attente » pour l’e-mail quand il est à `unknown` dans `enrichment_coordinates`', async () => {
    renderRow(
      makeContact({
        email: null,
        enrichment_coordinates: { email: { state: 'unknown', sources_queried: 0, at: '2026-10-07T09:00:00.000Z' } },
      }),
    )
    await screen.findByText('Alice Martin')
    expect(
      screen.getByTitle("En attente du fournisseur — la recherche d’e-mail n'a pas conclu, réessaie"),
    ).toHaveTextContent('Attente')
  })

  it('une valeur déjà connue gagne sur une attente plus récente', async () => {
    renderRow(
      makeContact({
        phone: '+33 6 12 34 56 78',
        enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: '2026-10-07T09:00:00.000Z' } },
      }),
    )
    await screen.findByText('Alice Martin')
    expect(
      screen.queryByTitle("En attente du fournisseur — la recherche de téléphone n'a pas conclu, réessaie"),
    ).not.toBeInTheDocument()
    expect(screen.getByText('+33 6 12 34 56 78')).toBeInTheDocument()
  })

  it('une attente sur le téléphone ne change rien à l’e-mail — jamais un canal pour l’autre', async () => {
    renderRow(
      makeContact({
        email: null,
        phone: null,
        enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: '2026-10-07T09:00:00.000Z' } },
      }),
    )
    await screen.findByText('Alice Martin')
    expect(
      screen.getByTitle("En attente du fournisseur — la recherche de téléphone n'a pas conclu, réessaie"),
    ).toBeInTheDocument()
    expect(screen.queryByTitle('E-mail pas encore cherché')).not.toBeInTheDocument()
  })
})

describe('Recette 21/10 A.5 — l’e-mail n’est jamais tronqué ni coupé au milieu d’un mot', () => {
  const email = 'michel.associe.tres.long@grand-groupe-industriel.example.com'
  it('le lien e-mail ne coupe que sur des points de rupture (<wbr>), jamais break-all, jamais truncate', async () => {
    renderRow(makeContact({ email }))
    await screen.findByText('Alice Martin')
    const link = screen.getByRole('link', { name: /^michel\./ })
    expect(link).toHaveAttribute('href', `mailto:${email}`)
    expect(link.className).not.toContain('break-all')
    expect(link.className).not.toContain('truncate')
    expect(link.textContent).toBe(email)
    expect(link.querySelectorAll('wbr').length).toBeGreaterThan(0)
    // #4503 — la coupure passe d'abord AVANT « @ » : « @domaine » se lit d'un bloc.
    expect(link.innerHTML).toMatch(/<wbr><span[^>]*>@/)
    expect(link.innerHTML).toContain('.<wbr>')
  })
})

// #3821.2 — « les trois icônes téléphone / e-mail / LinkedIn lisibles » (retour
// bêta Kevin Sansen, 07/10/2026) : une icône par coordonnée, la valeur
// restant EN CLAIR dans la colonne (doctrine c87) — l'icône ne la remplace
// jamais.
describe('#3821.2 — icônes téléphone / e-mail / LinkedIn lisibles par ligne', () => {
  it('porte une icône téléphone ET e-mail sur la ligne, en plus de la valeur en clair', async () => {
    renderRow(makeContact({ email: 'alice@corp.co', phone: '+33 6 12 34 56 78' }))
    await screen.findByText('Alice Martin')
    expect(screen.getByTestId('contact-row-icon-phone')).toBeInTheDocument()
    expect(screen.getByTestId('contact-row-icon-email')).toBeInTheDocument()
    // La valeur reste lisible dans la colonne — l'icône est un AJOUT, jamais un remplacement.
    expect(screen.getByTitle('alice@corp.co')).toHaveTextContent(/^alice@corp\.co$/)
    expect(screen.getByText('+33 6 12 34 56 78')).toBeInTheDocument()
  })
})

// #3713.2 — recette prod 09/10 : « e-mail tronqué (sumith.vijayan@dec…) ».
// L'adresse entière reste déjà au survol (`title`) ; la recette demande AU
// MINIMUM ce plancher, et un geste de copie en plus — sans ouvrir mailto: ni
// la fiche, la colonne restant la plus étroite du tableau.
describe('#3713.2 — l’e-mail reste lisible en entier (survol + copie)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('porte l’adresse complète en `title`, jamais tronquée', async () => {
    renderRow(makeContact({ email: 'sumith.vijayan@decathlon.com' }))
    await screen.findByText('Alice Martin')
    expect(screen.getByTitle('sumith.vijayan@decathlon.com')).toHaveTextContent('sumith.vijayan@decathlon.com')
  })

  it('copie l’adresse au clic, sans ouvrir la fiche ni mailto:', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderRow(makeContact({ email: 'alice@corp.co' }))
    await screen.findByText('Alice Martin')

    fireEvent.click(screen.getByRole('button', { name: "Copier l'e-mail" }))

    expect(writeText).toHaveBeenCalledWith('alice@corp.co')
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1))
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('un presse-papiers refusé se DIT — jamais une copie silencieuse', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderRow(makeContact({ email: 'alice@corp.co' }))
    await screen.findByText('Alice Martin')

    fireEvent.click(screen.getByRole('button', { name: "Copier l'e-mail" }))
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

describe('#1473 — le contact à qualifier, sans entreprise', () => {
  // Le point qui casse en silence : la ligne EXISTE. Un contact sans compte
  // disparaissait de la liste (INNER JOIN côté serveur), et le commercial
  // concluait que sa saisie avait été perdue.
  it('affiche la ligne, avec le nom de la personne', async () => {
    renderRow(makeContact({ account_id: null, company_name: null }))

    expect(await screen.findByText('Alice Martin')).toBeInTheDocument()
  })

  // « - » se lit comme une donnée perdue ; « À qualifier » est une réponse, et
  // elle nomme le geste qui manque. Même règle que la colonne Entité d'à côté.
  it('nomme l’absence d’entreprise au lieu d’un tiret muet', async () => {
    renderRow(makeContact({ account_id: null, company_name: null }))

    // ⚠️ On n'assertionne PAS « aucun tiret dans la ligne » : d'autres colonnes
    // en portent légitimement (dates, LinkedIn). La revendication est que la
    // colonne Entreprise, elle, NOMME son absence.
    expect(await screen.findByText('À qualifier')).toBeInTheDocument()
  })

  it('affiche le nom de l’entreprise quand elle est connue', async () => {
    renderRow(makeContact({ company_name: 'Corp' }))

    expect(await screen.findByText('Corp')).toBeInTheDocument()
    expect(screen.queryByText('À qualifier')).not.toBeInTheDocument()
  })
})

// #2158.40 — « Affichage logo entreprise » : `EntityAvatar` était importé sans
// être rendu dans la ligne (texte seul). Aucune URL de logo n'existe côté
// contrat contact — les initiales sont le même stand-in que `ContactAvatar`
// pour une personne sans photo.
// #4503.5 (contrat Louis 24/10) — le logo quitte la ligne : « Compte » = le nom (lien vers le compte) + la ville.
describe('#4503.5 — la colonne Compte : nom cliquable et ville, plus de logo', () => {
  // #4503 (recette prod 25/10) — « la ville n'apparaît que sur une ligne sur trois » : la colonne lisait le lieu de
  // travail de la PERSONNE (rempli par l'enrichissement seul). « Compte » = nom + ville DU COMPTE (son siège).
  it('le nom du compte mène au compte, la ville DU COMPTE suit (son siège) ; aucun logo d’initiales', async () => {
    renderRow(
      makeContact({
        company_name: 'Northwind Trading',
        location: null,
        account_headquarters: '29 boulevard Haussmann, 75009 Paris',
      } as Partial<GlobalContact>),
    )
    const account = await screen.findByTestId('contact-row-account')
    expect(account).toHaveTextContent('Northwind Trading')
    expect(account.getAttribute('href')).toContain('/accounts/a1')
    expect(screen.getByTestId('contact-row-city')).toHaveTextContent(/^Paris$/)
    expect(screen.queryByText('NT')).not.toBeInTheDocument()
  })

  it('le lieu de travail de la personne reste lu, sous sa fonction — jamais rabattu sur le siège, ni l’inverse', async () => {
    renderRow(
      makeContact({
        company_name: 'Northwind Trading',
        location: 'Lyon',
        account_headquarters: null,
      } as Partial<GlobalContact>),
    )
    await screen.findByTestId('contact-row-account')
    expect(screen.getByTestId('contact-row-location')).toHaveTextContent(/^Lyon$/)
    expect(screen.queryByTestId('contact-row-city')).not.toBeInTheDocument()
  })

  it('sait dire NON : sans siège ni lieu de travail connus, aucune ligne de ville', async () => {
    renderRow(
      makeContact({
        company_name: 'Northwind Trading',
        location: null,
        account_headquarters: null,
      } as Partial<GlobalContact>),
    )
    await screen.findByTestId('contact-row-account')
    expect(screen.queryByTestId('contact-row-city')).not.toBeInTheDocument()
    expect(screen.queryByTestId('contact-row-location')).not.toBeInTheDocument()
  })

  it("n'affiche aucun logo pour un contact à qualifier, sans entreprise", async () => {
    renderRow(makeContact({ account_id: null, company_name: null }))
    await screen.findByText('À qualifier')
    // Une seule lettre de secours ('?') n'a pas de sens sans nom d'entreprise :
    // l'absence de logo est l'absence elle-même, pas une case blanche.
    expect(screen.queryByText('?')).not.toBeInTheDocument()
  })
})

describe('ContactTableRow — restitution V2 §5', () => {
  // #4503.5 — « Relation » porte UN badge : le statut déclaré (« Contacté »…) ou « À contacter » ; « Déjà contacté »
  // n'est plus un second badge, le premier le dit déjà.
  it('#4503.5 — un contact déjà engagé se lit dans le badge Relation, sans second badge', async () => {
    renderRow(makeContact({ user_status: 'contacted' }))
    expect(await screen.findByTestId('contact-row-relation')).toHaveTextContent('Contacté')
    expect(screen.queryByText('Déjà contacté')).not.toBeInTheDocument()
  })

  it('#4503.5 — un contact neuf est « À contacter », avec son responsable nommé', async () => {
    members.mockReturnValue({ data: [{ userId: 'u-1', fullName: 'Camille Dubois', email: null, isSelf: false }] })
    renderRow(makeContact({ user_status: 'new', assigned_to: 'u-1' } as Partial<GlobalContact>))
    expect(await screen.findByTestId('contact-row-relation')).toHaveTextContent('À contacter')
    expect(screen.getByTestId('contact-row-owner')).toHaveTextContent('Camille Dubois')
  })

  // #4503 (recette prod 25/10) — « la colonne Relation n'affiche aucun responsable » : un contact SANS porteur est un
  // fait (`assigned_to: null`), le même que la fiche écrit « Non attribué ». Il se dit, sans nom inventé.
  it('#4503 — sans porteur, la ligne dit « Non attribué », comme la fiche, et n’invente aucun nom', async () => {
    members.mockReturnValue({ data: [{ userId: 'u-1', fullName: 'Camille Dubois', email: null, isSelf: false }] })
    renderRow(makeContact({ assigned_to: null } as Partial<GlobalContact>))
    await screen.findByTestId('contact-row-relation')
    expect(screen.queryByTestId('contact-row-owner')).not.toBeInTheDocument()
    expect(screen.getByTestId('contact-row-owner-none')).toHaveTextContent('Non attribué')
    expect(screen.queryByText('Camille Dubois')).not.toBeInTheDocument()
  })

  it('#4503 sait dire NON : un porteur que la liste des membres ne nomme pas (inconnu) ne fait aucune ligne', async () => {
    members.mockReturnValue({ data: undefined })
    renderRow(makeContact({ assigned_to: 'u-9' } as Partial<GlobalContact>))
    await screen.findByTestId('contact-row-relation')
    expect(screen.queryByTestId('contact-row-owner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('contact-row-owner-none')).not.toBeInTheDocument()
  })

  // #4503.3 — la colonne Relation demande « un badge + responsable » : l'absence de responsable se NOMME.
  it('#4503.3 — sans responsable, la colonne Relation dit « Non attribué », jamais une case vide', async () => {
    members.mockReturnValue({ data: [{ userId: 'u-1', fullName: 'Camille Dubois', email: null, isSelf: false }] })
    renderRow(makeContact({ assigned_to: null } as Partial<GlobalContact>))
    const none = await screen.findByTestId('contact-row-owner-none')
    expect(none.textContent?.trim()).toBe('Non attribué')
    expect(screen.queryByTestId('contact-row-owner')).not.toBeInTheDocument()
  })

  it("#4503.3 dit NON : avec un responsable, « Non attribué » ne s'écrit pas", async () => {
    members.mockReturnValue({ data: [{ userId: 'u-1', fullName: 'Camille Dubois', email: null, isSelf: false }] })
    renderRow(makeContact({ assigned_to: 'u-1' } as Partial<GlobalContact>))
    await screen.findByTestId('contact-row-owner')
    expect(screen.queryByTestId('contact-row-owner-none')).not.toBeInTheDocument()
  })

  it('#4503.3 dit NON : un responsable posé mais non résolu ne se déclare pas « Non attribué »', async () => {
    members.mockReturnValue({ data: [] })
    renderRow(makeContact({ assigned_to: 'u-inconnu' } as Partial<GlobalContact>))
    await screen.findByTestId('contact-row-relation')
    expect(screen.queryByTestId('contact-row-owner-none')).not.toBeInTheDocument()
    expect(screen.queryByTestId('contact-row-owner')).not.toBeInTheDocument()
  })

  // #2297.26 — la recette démo ne voyait « déjà enrichi récemment » que dans le
  // dialogue ; le contact sous délai de protection se NOMME aussi dans la liste.
  it('#2297.26 — nomme « Enrichi récemment » un contact sous délai de protection', async () => {
    renderRow(
      makeContact({
        email: null,
        last_enrichment_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        last_enrichment_result: 'no_new_data',
        last_enrichment_missing: ['email', 'linkedin', 'phone'],
      }),
    )
    await screen.findByText('Alice Martin')
    expect(screen.getByText('Enrichi récemment')).toBeInTheDocument()
  })

  it('#2297.26 — aucun badge « Enrichi récemment » sans tentative', async () => {
    renderRow(makeContact({ email: null }))
    await screen.findByText('Alice Martin')
    expect(screen.queryByText('Enrichi récemment')).not.toBeInTheDocument()
  })

  it('shows no « Déjà contacté » badge for a brand-new contact', async () => {
    renderRow(makeContact({ user_status: 'new' }))
    await screen.findByText('Alice Martin')
    expect(screen.queryByText('Déjà contacté')).not.toBeInTheDocument()
  })

  it('relegates the technical source to a subtitle of « Donnée vérifiée le » (single column)', async () => {
    renderRow(makeContact({ source: 'apollo' }))
    await screen.findByText('Alice Martin')
    // Source stays visible (sourced) but as a caption, not its own column.
    expect(screen.getByText(new RegExp(contactSourceLabel('apollo')))).toBeInTheDocument()
  })

  /**
   * La source seule ne dit pas quoi FAIRE de la valeur. La primitive
   * `Provenance` porte la CATÉGORIE — et c'est elle qui décide du geste : une
   * valeur lue dans un outil se revérifie à la source, une valeur proposée par
   * un modèle se relit. Ce test verrouille le CÂBLAGE : la primitive existait,
   * testée, gardée, et aucun écran ne l'appelait.
   */
  // #4503.5 — « Mis à jour le … lu dans un outil connecté » quitte la ligne ; « Origine » = la source + sa date d'ajout.
  it('#4503.5 — l’origine dit la source et sa précision, plus « lu dans un outil connecté »', async () => {
    renderRow(makeContact({ source: 'apollo' }))
    expect(await screen.findByTestId('contact-row-origin')).toHaveTextContent(contactSourceLabel('apollo'))
    expect(screen.getByText(/^Ajouté le /)).toBeInTheDocument()
    expect(screen.queryByText(/lu dans un outil connecté/)).not.toBeInTheDocument()
  })

  it('ne devine aucune catégorie pour une source non classée', async () => {
    renderRow(makeContact({ source: 'demo' }))
    await screen.findByText('Alice Martin')
    expect(screen.getByText(contactSourceLabel('demo'))).toBeInTheDocument()
    expect(screen.queryByText(/source publique/)).not.toBeInTheDocument()
  })

  /**
   * Un intitulé de poste long ne pousse PAS la colonne (Louis, 01/09/2026).
   * « Global Category Manager Small Molecules Drug Product (Development) »
   * élargissait la première cellule jusqu'à forcer un défilement HORIZONTAL du
   * tableau — le titre n'est pas la donnée qu'on vient lire dans une liste, il
   * cède avant tout le reste. Le texte entier reste lisible : il est porté par
   * l'attribut `title` de la cellule, donc au survol.
   *
   * ⚠️ #2465 (16/09/2026) — LA BORNE A CHANGÉ DE PLACE, PAS D'INTENTION. Elle
   * s'écrivait ici en `rem` (`max-w-[18rem]`), ce qui bornait l'intitulé sans
   * borner la COLONNE : le nom, lui, restait libre et prenait 474 px sur 1 587
   * en production. C'est la colonne qui porte désormais sa part (`table-fixed` +
   * `w-[22%]`, registre `contactsTableColumns.ts`) ; l'intitulé n'a plus qu'à
   * pouvoir RÉTRÉCIR dedans — `min-w-0` (leçon GA-255) et sa troncature.
   */
  // #4503.5 (contrat Louis 24/10) — la fonction se lit ENTIÈRE : elle passe à la ligne, jamais tronquée. La colonne
  // garde sa part du tableau (#2465) : c'est la hauteur de la ligne qui cède, plus le texte.
  it('#4503.5 — la fonction à rallonge se lit en entier, sans troncature', async () => {
    const longTitle = 'Global Category Manager Small Molecules Drug Product (Development & Launch)'
    renderRow(makeContact({ title: longTitle }))
    const cell = await screen.findByTestId('contact-row-title')
    expect(cell).toHaveTextContent(longTitle)
    expect(cell.className).toContain('break-words')
    expect(cell.className).not.toMatch(/text-ellipsis|truncate/)
    expect(cell.closest('td')?.className).toMatch(/\bw-\[\d+%\]/)
  })

  /**
   * #2465 — UN NOM TRONQUÉ RESTE ATTEIGNABLE.
   *
   * La colonne « Nom » est bornée à une part du tableau : un nom long s'y coupe.
   * Une information qu'on coupe ne doit pas DISPARAÎTRE — le nom entier reste au
   * survol, et la ligne entière ouvre la fiche. Sans cette garantie, borner la
   * colonne aurait échangé un défaut de mise en page contre une perte de donnée.
   */
  it('#2465 — le nom garde son texte entier au survol, avec ses dates (C1.A8)', async () => {
    renderRow(makeContact())
    const name = await screen.findByTestId('contact-row-name')
    expect(name.getAttribute('title')).toMatch(/^Alice Martin · Ajouté le /)
    // La colonne porte sa part : c'est elle qui décide de la coupe, pas la donnée.
    expect(name.closest('td')?.className).toMatch(/\bw-\[\d+%\]/)
  })

  /**
   * #1800 — « tu peux supprimer la notion de favori et cette page ça ne sert à
   * rien » (Louis, arbitrage produit). Retirer le MOYEN, pas seulement la
   * permission : aucune étoile sur la ligne, ni dans la barre d'actions ni dans
   * le menu, qu'un contact soit déjà en favori ou non.
   */
  it("#1800 — n'affiche plus aucun bouton favori sur la ligne", async () => {
    renderRow(makeContact())
    await screen.findByText('Alice Martin')

    expect(screen.queryByRole('button', { name: /favori/i })).not.toBeInTheDocument()

    renderRow({ ...makeContact(), is_favorite: true } as unknown as GlobalContact)
    expect(screen.queryByRole('button', { name: /favori/i })).not.toBeInTheDocument()
  })
})

// #2632.1 — l'écran ne détectait que les DÉPARTS (badge RISQUE), jamais les
// ARRIVÉES. `source_tag === 'ARRIVEE'` est calculé côté serveur
// (`contactSourceTag`, en miroir de `RISQUE`) ; ce test verrouille le seul
// morceau qui manquait : l'écran l'affiche.
describe('#2632.1 — badge ARRIVEE (nomination récente)', () => {
  it('affiche le badge ARRIVÉE quand source_tag vaut ARRIVEE', async () => {
    renderRow(makeContact({ source_tag: 'ARRIVEE' } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')
    expect(screen.getByText('ARRIVÉE')).toBeInTheDocument()
  })

  it("n'affiche aucun badge ARRIVÉE pour un contact sans arrivée détectée", async () => {
    renderRow(makeContact({ source_tag: 'PUBLIC' } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')
    expect(screen.queryByText('ARRIVÉE')).not.toBeInTheDocument()
  })

  it('date le badge ARRIVÉE quand le dernier enrichissement est connu', async () => {
    renderRow(
      makeContact({
        source_tag: 'ARRIVEE',
        last_enrichment_at: '2026-09-10T08:00:00.000Z',
      } as Partial<GlobalContact>),
    )
    await screen.findByText('Alice Martin')
    expect(screen.getByText('ARRIVÉE').closest('[title]')).toHaveAttribute(
      'title',
      expect.stringContaining('10/09/2026'),
    )
  })
})

// #2988 (recette écran 28/09/2026) — « sur /contacts, cliquer Enrichir
// enrichit DIRECTEMENT, sans proposer de portée ». Le menu ⋯ de la ligne
// ouvrait déjà `EnrichConfirmDialog`, mais sans `coordinateScope` : la porte
// annonçait un coût sans jamais proposer le choix Email + téléphone / Email
// seul / Téléphone seul que #2988.1 a posé côté pipeline serveur (`only`,
// 25/09) — même sélecteur que `ContactContent.tsx` (GA-26, même composant).
describe('#2988 — la ligne propose la portée avant de débiter', () => {
  beforeEach(() => {
    enrichMutate.mockClear()
    members.mockReturnValue({ data: [] })
  })

  it('propose Email + téléphone / Email seul / Téléphone seul avant le débit', async () => {
    renderRow(makeContact({ email: null }))
    await userEvent.click(await screen.findByRole('button', { name: /actions/i }))
    await userEvent.click(await screen.findByText(/enrichir/i))

    expect(await screen.findByRole('button', { name: 'Email seulement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Téléphone seulement' })).toBeInTheDocument()
    expect(enrichMutate).not.toHaveBeenCalled()
  })

  it('« Email seulement » atteint la mutation via `only`', async () => {
    renderRow(makeContact({ email: null }))
    await userEvent.click(await screen.findByRole('button', { name: /actions/i }))
    await userEvent.click(await screen.findByText(/enrichir/i))

    await userEvent.click(await screen.findByRole('button', { name: 'Email seulement' }))
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))

    expect(enrichMutate).toHaveBeenCalledTimes(1)
    expect(enrichMutate.mock.calls[0]?.[0]).toMatchObject({ only: 'email' })
  })

  it('sans choix (« les deux » par défaut), `only` est absent', async () => {
    renderRow(makeContact({ email: null }))
    await userEvent.click(await screen.findByRole('button', { name: /actions/i }))
    await userEvent.click(await screen.findByText(/enrichir/i))
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))

    expect(enrichMutate).toHaveBeenCalledTimes(1)
    expect(enrichMutate.mock.calls[0]?.[0]).not.toHaveProperty('only')
  })
})

// #2296.10/.36/.37 — le désaccord entre DEUX sources (une fiche humaine, un
// fournisseur) se NOMME, distinct du départ (RISQUE, qui ne se déclenche
// jamais sur une ligne humaine — voir `contact-score.spec.ts`).
describe('#2296.10/.36/.37 — badge CONFLIT (deux sources en désaccord)', () => {
  it('affiche le badge CONFLIT quand employer_conflict est présent', async () => {
    renderRow(makeContact({ employer_conflict: { detectedEmployer: 'Capgemini' } } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')
    expect(screen.getByText('CONFLIT')).toBeInTheDocument()
  })

  it("n'affiche aucun badge CONFLIT en l'absence de désaccord", async () => {
    renderRow(makeContact({ source_tag: 'INTERNE' } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')
    expect(screen.queryByText('CONFLIT')).not.toBeInTheDocument()
  })

  it("nomme l'employeur rapporté par le fournisseur dans le titre, jamais le fournisseur lui-même", async () => {
    renderRow(makeContact({ employer_conflict: { detectedEmployer: 'Capgemini' } } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')
    const title = screen.getByText('CONFLIT').closest('[title]')?.getAttribute('title') ?? ''
    expect(title).toContain('Capgemini')
    expect(title.toLowerCase()).not.toContain('apollo')
  })
})

// #2158.76 — recette 6 du registre écrans secondaires (16/09) : « ligne
// tabulable + Entrée ouvre la fiche ; test clavier + mobile ». La ligne
// n'avait ni `tabIndex`, ni `onKeyDown`, ni `role` (GA-35).
describe('#2158.76 — la ligne se tabule et Entrée ouvre la fiche', () => {
  beforeEach(() => {
    navigateMock.mockClear()
  })

  it('porte un tabIndex — atteignable au clavier sans la souris', async () => {
    renderRow(makeContact())
    await screen.findByText('Alice Martin')
    expect(screen.getByRole('row', { name: /Alice Martin/i })).toHaveAttribute('tabIndex', '0')
  })

  it('Entrée sur la ligne ouvre la fiche du contact', async () => {
    renderRow(makeContact({ id: 'c42' }))
    const row = await screen.findByRole('row', { name: /Alice Martin/i })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(navigateMock).toHaveBeenCalledWith({ to: '/contacts/$id', params: { id: 'c42' } })
  })

  it('Espace sur la ligne ouvre la fiche du contact', async () => {
    renderRow(makeContact({ id: 'c42' }))
    const row = await screen.findByRole('row', { name: /Alice Martin/i })
    fireEvent.keyDown(row, { key: ' ' })
    expect(navigateMock).toHaveBeenCalledWith({ to: '/contacts/$id', params: { id: 'c42' } })
  })

  it("Entrée pressée sur un enfant (checkbox) n'ouvre pas deux fois la fiche", async () => {
    renderRow(makeContact({ id: 'c42' }))
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.keyDown(checkbox, { key: 'Enter' })
    expect(navigateMock).not.toHaveBeenCalled()
  })
})

// #2719 — « impossible d'ouvrir une fiche dans un nouvel onglet ». La ligne
// naviguait par `onClick` + `navigate()` sur un `TableRow` (pas un lien) et le
// ctrl/cmd-clic subissait un `event.preventDefault()` en amont
// (ContactContent.tsx) : clic droit et ctrl/cmd-clic ne proposaient rien. Un
// vrai `<a href>` couvre désormais la ligne — clic droit, ctrl/cmd-clic et
// clic molette redeviennent le geste natif du navigateur, sans une ligne de
// JS à écrire pour ça.
describe('#2719 — la ligne navigue par un vrai <a href>, pas par onClick', () => {
  it('un vrai lien couvre la ligne, avec la destination du contact', async () => {
    const { container } = renderRow(makeContact({ id: 'c42' }))
    await screen.findByText('Alice Martin')
    const link = container.querySelector('a[href="/contacts/c42"]')
    expect(link).not.toBeNull()
    expect(link?.tagName).toBe('A')
  })

  it('la checkbox reste cliquable au-dessus du lien qui couvre la ligne', async () => {
    const onSelectionChange = vi.fn()
    renderWithRouter(
      <Table>
        <TableBody>
          <ContactTableRow
            contact={makeContact({ id: 'c42' })}
            isSelected={false}
            onRowMouseDown={() => {}}
            onRowMouseEnter={() => {}}
            onSelectionChange={onSelectionChange}
          />
        </TableBody>
      </Table>,
    )
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onSelectionChange).toHaveBeenCalledWith(true)
  })
})

/**
 * #3687.16 — « retour : origine, filtres, position ». Ouvrir une fiche depuis
 * une liste FILTRÉE doit pouvoir y revenir avec les MÊMES filtres (le maillon
 * « Contacts » de `ContactDetailPage`, voir `contactOrigin.ts`) — donc la
 * ligne doit porter ces filtres jusque dans l'URL de la fiche. Sans filtre
 * actif (le cas par défaut de ces tests), rien à restaurer : la ligne garde
 * EXACTEMENT son comportement d'avant (`/contacts/c42`, sans `?`), voir le
 * describe #2719 ci-dessus.
 */
describe('#3687.16 — la ligne porte les filtres de la liste vers la fiche', () => {
  beforeEach(() => {
    navigateMock.mockClear()
  })

  it('Entrée sur une ligne de liste FILTRÉE porte ces filtres dans la navigation', async () => {
    renderRow(makeContact({ id: 'c42' }), '/contacts?role=decideur&company=Acme')
    const row = await screen.findByRole('row', { name: /Alice Martin/i })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/contacts/$id',
      params: { id: 'c42' },
      search: { from: 'list', fromSearch: JSON.stringify({ role: 'decideur', company: 'Acme' }) },
    })
  })

  it('un vrai lien porte les mêmes filtres dans son `href`', async () => {
    const { container } = renderRow(makeContact({ id: 'c42' }), '/contacts?role=decideur')
    await screen.findByText('Alice Martin')
    const link = container.querySelector('a[href^="/contacts/c42?"]')
    expect(link).not.toBeNull()
    const url = new URL(link?.getAttribute('href') ?? '', 'https://example.test')
    expect(url.searchParams.get('from')).toBe('list')
    // `fromSearch` EST un JSON (notre propre sérialisation) : le routeur la
    // ré-encode une fois de plus pour que sa PROPRE désérialisation
    // (`useSearch`, symétrique) la lise comme une chaîne — pas un objet.
    expect(JSON.parse(JSON.parse(url.searchParams.get('fromSearch') ?? ''))).toEqual({ role: 'decideur' })
  })
})

/**
 * #2725 — « rien ne mène à la fiche complète depuis les vues en résumé » (Loïc
 * Inacio, 22/09/2026) : la ligne ouvre déjà la fiche (#2158.76, #2719 ci-
 * dessus), mais rien ne le DIT avant le clic — c'est la moitié manquante du
 * retour (« les vues amont ne disent pas qu'il y a plus derrière »).
 */
/**
 * LOIC-FIX O.4 (L.10) / #2725 — la ligne annonce la fiche et y mène par un VRAI lien nommé et tabulable
 * (GA-32 / GA-35). #4503.5 — Théo : c'est le NOM qui porte ce lien ; le chevron décoratif de bout de ligne quitte
 * la ligne (le menu « … » termine la ligne, comme dans la maquette).
 */
describe('LOIC-FIX O.4 / #4503.5 — le nom mène à la fiche', () => {
  it('le nom est un lien nommé vers /contacts/<id>, tabulable', async () => {
    renderRow(makeContact({ id: 'c42' }))
    const link = await screen.findByRole('link', { name: /Ouvrir la fiche de Alice Martin/i })
    expect(link).toHaveTextContent('Alice Martin')
    expect(link.getAttribute('href')).toContain('/contacts/c42')
    expect(link.getAttribute('tabindex')).not.toBe('-1')
    expect(screen.queryByTestId('contact-row-open-hint')).not.toBeInTheDocument()
  })
})

// #2160.9 — la recette du 25/09 constatait un affichage sans écrivain : le
// badge « Porté par » existait (#2128.12), mais rien dans le menu ⋯ de la
// liste ne permettait d'ATTRIBUER un contact.
describe('#2160.9 — « Attribuer » depuis le menu ⋯ de la ligne', () => {
  const openRowMenu = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(screen.getByRole('button', { name: /^Actions sur / }))
    await u.click(await screen.findByText('Attribuer'))
  }

  beforeEach(() => {
    members.mockReturnValue({ data: [{ userId: 'u-1', fullName: 'Camille Dubois', email: null, isSelf: false }] })
    assignMutate.mockClear()
    demo.isDemo = false
  })

  it('propose « Attribuer » dans le menu de la ligne', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow(makeContact({ id: 'c42' }))
    await screen.findByText('Alice Martin')

    await u.click(screen.getByRole('button', { name: /^Actions sur / }))
    expect(await screen.findByText('Attribuer')).toBeInTheDocument()
  })

  it('attribue le contact au membre choisi, sans ouvrir la fiche', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow(makeContact({ id: 'c42' }))
    await screen.findByText('Alice Martin')

    await openRowMenu(u)
    fireEvent.click(await screen.findByText('Camille Dubois'))

    expect(assignMutate).toHaveBeenCalledWith({
      contactIds: ['c42'],
      assignedTo: 'u-1',
      assigneeName: 'Camille Dubois',
    })
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('retire l’attribution', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow(makeContact({ id: 'c42', assigned_to: 'u-1' } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')

    await openRowMenu(u)
    fireEvent.click(await screen.findByText("Retirer l'attribution"))

    expect(assignMutate).toHaveBeenCalledWith({ contactIds: ['c42'], assignedTo: null })
  })

  it('coche le porteur courant dans la liste des membres', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow(makeContact({ id: 'c42', assigned_to: 'u-1' } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')

    await openRowMenu(u)
    // Le responsable se lit aussi dans la colonne « Relation » (#4503.5) : on vise l'item du menu.
    const item = await screen.findByRole('menuitem', { name: /Camille Dubois/ })
    expect(item.querySelector('svg')).not.toBeNull()
  })

  // #2160.9 — la salle de démonstration n'a qu'un seul occupant : l'écrivain
  // reste visible mais INERTE, même doctrine que les autres écritures démo.
  it('désactive « Attribuer » dans l’espace de démonstration', async () => {
    demo.isDemo = true
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow(makeContact({ id: 'c42' }))
    await screen.findByText('Alice Martin')

    await u.click(screen.getByRole('button', { name: /^Actions sur / }))
    const trigger = await screen.findByText('Attribuer')
    expect(trigger.closest('[role="menuitem"]')).toHaveAttribute('data-disabled')
  })
})

// #3563.1 — recette prod 02/10 : la cellule « Niveau » (72 px) écrivait la phrase
// entière sur ~10 lignes (ligne de 256 px). Libellé court + raison en infobulle.
// #4503.5 — le palier quitte la colonne « Relation » pour l'infobulle du nom (Théo C1.A8) ; inconnu, il n'y est pas.
describe('#4503.5 — le palier se lit dans l’infobulle du nom', () => {
  it('un palier connu est nommé au survol du nom, jamais en colonne', async () => {
    renderRow(makeContact({ title: 'Directeur des systèmes d’information' }))
    const name = await screen.findByTestId('contact-row-name')
    expect(name.getAttribute('title')).toMatch(/niveau : /)
    expect(screen.queryByText('non mesuré')).not.toBeInTheDocument()
  })

  it('sait dire NON : sans intitulé, aucun palier deviné', async () => {
    renderRow(makeContact({ title: null } as Partial<GlobalContact>))
    const name = await screen.findByTestId('contact-row-name')
    expect(name.getAttribute('title')).not.toMatch(/niveau/)
  })
})

// #3942.5 — brief F05, point 2 : le rang du chemin recommandé, à côté du nom
// du compte — même vocabulaire que le bloc du dossier compte (« N° k »).
// #4503.5 (contrat Louis 24/10) — « logo + N° » quittent la ligne : le rang ne s'affiche plus sur la ligne ; le
// regroupement par compte (« Compte — N contacts prioritaires ») reste, dans `ContactsTable`.
describe('#4503.5 — le rang « N° k » quitte la ligne', () => {
  it('aucun « N° k » même quand le serveur pose un rang', async () => {
    renderRow(makeContact({ recommended_rank: 1 } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')
    expect(screen.queryByText('N° 1')).not.toBeInTheDocument()
  })

  it('hors portée Recommandés (aucun rang posé), aucun badge n’apparaît', async () => {
    renderRow(makeContact())
    await screen.findByText('Alice Martin')
    expect(screen.queryByText(/^N° /)).not.toBeInTheDocument()
  })
})

// #3713.a — la ligne de liste tenait 62 px au lieu des 56 px promis (lot H07) : le remplissage vertical
// des cellules est borné à 4 px (py-1), jamais le p-2 par défaut du composant Table.
describe('#3713.a — la ligne de contact reste dans les 56 px promis', () => {
  it('chaque cellule porte py-1 (4 px, qui l’emporte sur le p-2 par défaut)', async () => {
    renderRow(makeContact())
    await screen.findByText('Alice Martin')
    const cells = document.querySelectorAll('tbody tr > td')
    expect(cells.length).toBe(5)
    cells.forEach(cell => {
      expect(cell.className).toMatch(/(^|\s)py-1(\s|$)/)
    })
  })
})

describe('#1 (recette 13/10) / #4503.5 — une date de la ligne porte toujours son libellé', () => {
  it('« Ajouté le … » sous l’origine, jamais une date nue ; « Mis à jour le … » quitte la ligne', async () => {
    renderRow(makeContact({}))
    await screen.findByText('Alice Martin')
    expect(screen.getByText(/^Ajouté le /)).toBeInTheDocument()
    expect(screen.queryByText(/^Mis à jour le /)).not.toBeInTheDocument()
  })
})

describe('R24 (15/10) — la liste /contacts', () => {
  it('pose le badge « Décideur » sur un décideur, rien sur un autre rôle', async () => {
    renderRow(makeContact({ decision_role: 'economic' }))
    await screen.findByText('Alice Martin')
    expect(screen.getByText('Décideur')).toBeInTheDocument()
  })

  it('aucun badge « Décideur » pour un influenceur', async () => {
    renderRow(makeContact({ decision_role: 'influencer' }))
    await screen.findByText('Alice Martin')
    expect(screen.queryByText('Décideur')).not.toBeInTheDocument()
  })

  it('« Rôle à identifier » se lit en entier : aucune troncature, le texte entier au survol', async () => {
    renderRow(makeContact({ full_name: 'Julien', title: 'Directeur des Sports Groupe TF1' }))
    await screen.findAllByText(/Rôle à identifier/)
    const badge = screen.getAllByText(/Rôle à identifier/)[0]?.closest('[title]') ?? null
    expect(badge?.getAttribute('title')).toBe('Rôle à identifier')
  })
})

describe('#4016.L8b — « ne plus me demander » le coût d’UN contact', () => {
  beforeEach(() => {
    enrichMutate.mockClear()
    costPreference.setSkip.mockClear()
    members.mockReturnValue({ data: [] })
    demo.isDemo = false
  })
  afterEach(() => {
    costPreference.skip = false
  })

  it('préférence posée : le clic enrichit sans question', async () => {
    costPreference.skip = true
    renderRow(makeContact({ email: null }))
    await userEvent.click(await screen.findByRole('button', { name: /actions/i }))
    // Théo B c1-repertoire.N5 — sans e-mail ni téléphone, le geste s'appelle « Enrichir » et ne porte pas de prix.
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Enrichir' }))

    expect(enrichMutate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /^Enrichir$/ })).not.toBeInTheDocument()
  })

  it('cocher « Ne plus me demander » puis confirmer pose la préférence', async () => {
    renderRow(makeContact({ email: null }))
    await userEvent.click(await screen.findByRole('button', { name: /actions/i }))
    await userEvent.click(await screen.findByText(/enrichir/i))
    await userEvent.click(await screen.findByRole('checkbox', { name: /Ne plus me demander/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))

    expect(enrichMutate).toHaveBeenCalledTimes(1)
    expect(costPreference.setSkip).toHaveBeenCalledWith(true)
  })
})

// #4290.12 — « a quitté l'entreprise » : la liste montre la preuve datée (employeur observé), comme la fiche.
describe('#4290.12 — contact parti', () => {
  it('affiche « A quitté l’entreprise » avec l’employeur observé et la date en infobulle', async () => {
    renderRow(
      makeContact({
        employment_left: { organization: 'Orange Business', at: '2026-10-08T10:00:00.000Z' },
      } as Partial<GlobalContact>),
    )
    await screen.findByText('Alice Martin')
    const badge = screen.getByText('A quitté l’entreprise')
    expect(badge.closest('[title]')?.getAttribute('title')).toMatch(/Orange Business/)
  })

  it('sait dire NON : sans preuve de départ, aucun badge', async () => {
    renderRow(makeContact({ employment_left: null } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')
    expect(screen.queryByText('A quitté l’entreprise')).not.toBeInTheDocument()
  })
})

describe('V4-CORRECTIFS 4290.12 — la liste marque « a quitté l’entreprise » (preuve datée)', () => {
  it('marque le contact dont un AUTRE employeur a été observé, avec l’employeur et la date', async () => {
    renderRow(makeContact({ employment_left: { organization: 'Orange Business', at: '2026-10-11T10:00:00.000Z' } }))
    await screen.findByText('Alice Martin')
    const badge = screen.getByTestId('employment-left-badge')
    expect(badge).toHaveTextContent('A quitté l’entreprise')
    expect(badge.getAttribute('title')).toMatch(/Orange Business/)
  })

  it('sait dire NON : sans preuve, aucune mention « a quitté »', async () => {
    renderRow(makeContact({ employment_left: null }))
    await screen.findByText('Alice Martin')
    expect(screen.queryByTestId('employment-left-badge')).not.toBeInTheDocument()
    expect(screen.queryByText(/A quitté l’entreprise/)).not.toBeInTheDocument()
  })
})

describe('LOIC-FIX O.3 — la liste /contacts n’affiche pas un score qu’elle n’a pas', () => {
  it('sait dire NON : sans score calculé par le serveur, aucune pastille (le « 78 » venait du rôle, la fiche disait 92)', async () => {
    const { container } = renderRow(makeContact({ decision_role: 'economic' }))
    await screen.findByText('Alice Martin')
    expect(container.querySelector('[data-testid="contact-row-score"]')).toBeNull()
  })

  it('un score calculé par le serveur (même source que la fiche) s’affiche', async () => {
    const { container } = renderRow(
      makeContact({ decision_role: 'economic', contact_score: 92 } as Partial<GlobalContact>),
    )
    await screen.findByText('Alice Martin')
    expect(container.querySelector('[data-testid="contact-row-score"]')).not.toBeNull()
  })
})

describe('SIMON-FIX S.19 — la pastille de priorité de la liste dit ce qu’elle mesure', () => {
  // Théo B c1-repertoire — « aucun score en points » : la priorité s'écrit en MOT, jamais « 92 ».
  it('la priorité s’écrit en mot (« Top contact »), jamais un nombre sur 100', async () => {
    // LOIC-FIX O.3 : la pastille n'existe que si le serveur a calculé le score.
    renderRow(makeContact({ contact_score: 92 } as Partial<GlobalContact>))
    await screen.findByText('Alice Martin')
    const badge = screen.getByTestId('contact-row-score')
    expect(badge).toHaveTextContent('Top contact')
    expect(badge).not.toHaveTextContent(/\d/)
  })
})

// #4597.4 — la colonne « Origine » devient un filtre : cliquer « Import de masse » filtre la liste sur cette origine.
describe('#4597.4 — l’origine est un filtre', () => {
  it('cliquer l’origine appelle le filtre avec LA source de la ligne, sans ouvrir la fiche', async () => {
    const onFilterBySource = vi.fn()
    navigateMock.mockClear()
    renderRow(makeContact({ source: 'import' }), '/', onFilterBySource)
    const origin = await screen.findByTestId('contact-row-origin')
    expect(origin).toHaveTextContent(contactSourceLabel('import'))
    await userEvent.click(screen.getByRole('button', { name: new RegExp(contactSourceLabel('import')) }))
    expect(onFilterBySource).toHaveBeenCalledWith('import')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('le geste a une cible tactile ≥ 44 px', async () => {
    renderRow(makeContact({ source: 'import' }), '/', vi.fn())
    const button = await screen.findByRole('button', { name: new RegExp(contactSourceLabel('import')) })
    expect(button.className).toMatch(/min-h-11/)
  })

  it('sans filtre branché, l’origine reste un simple texte (aucun bouton muet)', async () => {
    renderRow(makeContact({ source: 'import' }))
    await screen.findByTestId('contact-row-origin')
    expect(screen.queryByRole('button', { name: new RegExp(contactSourceLabel('import')) })).not.toBeInTheDocument()
  })
})

describe('#4586.5 — la liste dit qu’un nom est déduit de l’adresse', () => {
  it('une ligne au nom déduit porte la mention « estimé » ET dit de quoi il est tiré', async () => {
    renderRow(makeContact({ full_name: 'Menette Sebastien', name_derived_from_email: true }))
    await screen.findByText('Menette Sebastien')
    const mention = screen.getByTestId('contact-row-name-derived')
    expect(mention).toHaveTextContent(/estimé/i)
    expect(within(mention).getByRole('note').getAttribute('title') ?? '').toMatch(/adresse e-mail/i)
  })

  it('SAIT DIRE NON : un nom saisi (marqueur absent ou faux) ne porte aucune mention', async () => {
    renderRow(makeContact({ name_derived_from_email: false }))
    await screen.findByText('Alice Martin')
    expect(screen.queryByTestId('contact-row-name-derived')).not.toBeInTheDocument()
  })
})
