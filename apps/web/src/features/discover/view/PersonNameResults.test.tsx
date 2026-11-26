import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supplierNamesIn } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #2727 — « je tape un nom, je vois les homonymes, je choisis ».
 *
 * Mesuré le 22/09/2026 (call Loïc Inacio) : Découvrir ne cherche que des
 * entreprises ; aucun champ ne part d'un nom de personne, et le parcours
 * essayé plusieurs fois pour retrouver Marion Sagnard a échoué. Ce panneau
 * ajoute le champ manquant : un nom (+ entreprise, optionnelle) rend
 * une liste d'HOMONYMES qui se distinguent (poste, entreprise, ville) —
 * jamais une coordonnée (e-mail/téléphone restent des DISPONIBILITÉS, le
 * reveal payant est un geste séparé, hors tranche de ce panneau).
 */
const { searchByName } = vi.hoisted(() => ({ searchByName: vi.fn() }))
vi.mock('@/features/contacts/api', () => ({ contactsApi: { searchByName } }))

const { PersonNameResults } = await import('./PersonNameResults')

/**
 * #4574 — revient sur #2727 : la saisie par nom n'a plus de carte ni de formulaire, elle passe dans le champ libre
 * du rail. Ces tests prouvent que les RÉSULTATS (homonymes, « Ajouter et enrichir », vides honnêtes) sont ceux d'avant :
 * la demande arrive lue (`PersonNameRequest`), plus tapée ici.
 */
const renderFor = (fullName: string, organizationName?: string) =>
  renderWithRouter(
    <PersonNameResults
      request={{ query: organizationName ? { fullName, organizationName } : { fullName }, nonce: 1 }}
    />,
  )

describe('PersonNameResults — les homonymes d’un nom lu dans le rail (#2727, #4574)', () => {
  beforeEach(() => {
    searchByName.mockReset()
  })

  it('rend la liste des homonymes avec ce qui les distingue — jamais une coordonnée', async () => {
    searchByName.mockResolvedValue({
      status: 'ok',
      hits: [
        {
          id: 'apollo-1',
          firstName: 'Marion',
          lastNameObfuscated: 'Sa***d',
          title: 'DRH',
          organizationName: 'Bedrock',
          city: 'Paris',
          country: 'France',
          hasEmail: true,
          hasPhone: false,
        },
      ],
    })
    renderFor('Marion Sagnard')

    expect(await screen.findByText(/Marion Sa\*\*\*d/)).toBeInTheDocument()
    expect(screen.getByText('DRH')).toBeInTheDocument()
    expect(screen.getByText('Bedrock')).toBeInTheDocument()
    expect(screen.getByText(/Paris/)).toBeInTheDocument()
    expect(searchByName).toHaveBeenCalledWith('Marion Sagnard', undefined)
    // Jamais de coordonnée écrite — seulement une DISPONIBILITÉ de canal.
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it('entreprise : resserre la recherche', async () => {
    searchByName.mockResolvedValue({ status: 'empty', hits: [] })
    renderFor('Marion Sagnard', 'Bedrock')

    await waitFor(() => expect(searchByName).toHaveBeenCalledWith('Marion Sagnard', 'Bedrock'))
  })

  it('aucun homonyme : le dit, jamais un « 0 » muet', async () => {
    searchByName.mockResolvedValue({ status: 'empty', hits: [] })
    renderFor('Personne Inconnue')

    // #4386 — plus jamais « Aucun homonyme » sec.
    expect(await screen.findByText(/Personne n’a été trouvé sous ce nom : « Personne Inconnue »/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun homonyme/)).not.toBeInTheDocument()
  })

  it('source indisponible : le dit explicitement, sans jamais nommer le fournisseur', async () => {
    searchByName.mockResolvedValue({ status: 'unconfigured', hits: [] })
    renderFor('Marion Sagnard')

    expect(await screen.findByText(/n.?est pas disponible/i)).toBeInTheDocument()
    expect(screen.queryByText(/apollo/i)).not.toBeInTheDocument()
  })

  it('aucune demande : rien n’est rendu, aucun appel', async () => {
    const { container } = renderWithRouter(<PersonNameResults request={null} />)

    await waitFor(() => expect(container.querySelector('[data-testid="person-name-results"]')).toBeNull())
    expect(searchByName).not.toHaveBeenCalled()
  })
})

/**
 * LOIC-FIX O.5 (L.14) — recherche d'une personne par nom + prénom : « 0 résultat » s'affichait
 * EN MÊME TEMPS que 7 homonymes (le compteur du dessous compte une AUTRE liste, celle de l'espace,
 * sans le dire), et chaque carte portait une virgule orpheline « , » (ville et pays vides joints).
 */
describe('LOIC-FIX O.5 — compteur juste, aucune ponctuation pour un champ absent', () => {
  const hit = (over: Record<string, unknown>) => ({
    id: 'h1',
    firstName: 'Marion',
    lastNameObfuscated: 'Sa***d',
    title: 'DRH',
    organizationName: 'Bedrock',
    city: '',
    country: '',
    hasEmail: false,
    hasPhone: false,
    ...over,
  })

  it('nomme le nombre d’homonymes trouvés', async () => {
    searchByName.mockResolvedValue({ status: 'ok', hits: [hit({ id: 'a' }), hit({ id: 'b' })] })
    renderFor('Marion Sagnard')
    expect(await screen.findByTestId('person-name-count')).toHaveTextContent(/2 homonymes/)
  })

  it('aucune virgule orpheline quand la ville ET le pays sont vides ; un seul champ ne ramène pas de virgule', async () => {
    searchByName.mockResolvedValue({
      status: 'ok',
      hits: [
        hit({ id: 'a' }),
        hit({ id: 'b', city: 'Paris', country: '' }),
        hit({ id: 'c', city: 'Lyon', country: 'France' }),
      ],
    })
    const { container } = renderFor('Marion Sagnard')
    await screen.findAllByText(/Marion Sa\*\*\*d/)
    expect(screen.queryByText(',')).not.toBeInTheDocument()
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.getByText('Lyon, France')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/(^|\s),(\s|$)/)
  })
})

/**
 * #4386 — « Theo Haddad » + « Bellum » → « Aucun homonyme trouvé » en prod, alors
 * que Théo Haddad est le CEO de Bellum AI. La recherche est devenue une CASCADE
 * (base de contacts → registre des dirigeants → recherche web) : l'écran nomme les
 * FAMILLES de sources, jamais un fournisseur, et un vide dit ce qui a été interrogé.
 */
describe('#4386 — recherche par nom en cascade', () => {
  const THEO = {
    id: 'web:linkedin.com/in/theo-haddad',
    firstName: 'Théo',
    lastName: 'Haddad',
    lastNameObfuscated: '',
    title: 'CEO',
    organizationName: 'BELLUM AI',
    city: '',
    country: '',
    hasEmail: false,
    hasPhone: false,
    linkedinUrl: 'https://fr.linkedin.com/in/theo-haddad',
    sources: ['legal_registry', 'web'],
    match: 'name_and_company',
  }

  beforeEach(() => searchByName.mockReset())

  it('un résultat dit son nom complet, sa correspondance EN MOTS, ses familles de sources et son profil public', async () => {
    searchByName.mockResolvedValue({
      status: 'ok',
      hits: [THEO],
      sourcesQueried: [
        { family: 'contact_base', outcome: 'empty', count: 0 },
        { family: 'legal_registry', outcome: 'found', count: 1 },
        { family: 'web', outcome: 'found', count: 1 },
      ],
    })
    const { container } = renderFor('Theo Haddad', 'Bellum')

    expect(await screen.findByText('Théo Haddad')).toBeInTheDocument()
    expect(screen.getByText('Nom et entreprise correspondent')).toBeInTheDocument()
    expect(screen.getByText(/Trouvé dans : registre des dirigeants, recherche web/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /profil public de Théo Haddad/i })).toHaveAttribute(
      'href',
      'https://fr.linkedin.com/in/theo-haddad',
    )
    // Jamais un pourcentage, jamais un fournisseur.
    expect(container.textContent).not.toMatch(/%/)
    expect(supplierNamesIn(container.textContent ?? '')).toEqual([])
  })

  it('vide HONNÊTE : les familles interrogées en mots, la source en panne dite, et un geste', async () => {
    searchByName.mockResolvedValue({
      status: 'empty',
      hits: [],
      sourcesQueried: [
        { family: 'contact_base', outcome: 'empty', count: 0 },
        { family: 'legal_registry', outcome: 'empty', count: 0 },
        { family: 'web', outcome: 'down', count: 0 },
      ],
    })
    const user = userEvent.setup()
    const { container } = renderFor('Theo Haddad', 'Bellum')

    // #4386.4 — les familles réellement interrogées, en mots (jamais une liste figée, jamais un fournisseur) ;
    // la famille en panne n'est PAS dite « cherchée sans résultat ».
    expect(
      await screen.findByText("Je n'ai trouvé Theo Haddad ni dans ta base, ni dans les registres publics."),
    ).toBeInTheDocument()
    expect(screen.queryByText(/profils professionnels publics/)).not.toBeInTheDocument()
    // Une source en panne se DIT — jamais maquillée en « 0 ».
    expect(screen.getByText(/La recherche web n’a pas répondu/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0\b/)
    expect(supplierNamesIn(container.textContent ?? '')).toEqual([])

    // Le geste : relancer sans l'entreprise.
    searchByName.mockResolvedValue({ status: 'ok', hits: [THEO], sourcesQueried: [] })
    await user.click(screen.getByRole('button', { name: /chercher sans l’entreprise/i }))
    await waitFor(() => expect(searchByName).toHaveBeenLastCalledWith('Theo Haddad', undefined))
    expect(await screen.findByText('Théo Haddad')).toBeInTheDocument()
  })

  it('sans entreprise, le vide suggère de vérifier l’orthographe ou d’ajouter l’entreprise', async () => {
    searchByName.mockResolvedValue({
      status: 'empty',
      hits: [],
      sourcesQueried: [{ family: 'contact_base', outcome: 'empty', count: 0 }],
    })
    renderFor('Zyx Qwerty')

    expect(await screen.findByText(/Vérifie l’orthographe du nom, ou ajoute l’entreprise/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /chercher sans l’entreprise/i })).not.toBeInTheDocument()
  })

  it('pendant la recherche, dit où elle cherche', async () => {
    let settle: (value: unknown) => void = () => {}
    searchByName.mockReturnValue(new Promise(resolve => (settle = resolve)))
    renderFor('Theo Haddad', 'Bellum')

    expect(await screen.findByRole('status')).toHaveTextContent(
      /base de contacts.*registre des dirigeants.*recherche web/,
    )
    settle({ status: 'empty', hits: [], sourcesQueried: [] })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('un nom en partie masqué se montre tel quel, avec son indice', async () => {
    searchByName.mockResolvedValue({
      status: 'ok',
      hits: [
        {
          ...THEO,
          id: 'ap-1',
          lastName: '',
          lastNameObfuscated: 'Ha***d',
          firstName: 'Theo',
          linkedinUrl: undefined,
          sources: ['contact_base'],
          match: 'partial_name_and_company',
        },
      ],
      sourcesQueried: [{ family: 'contact_base', outcome: 'found', count: 1 }],
    })
    renderFor('Theo Haddad', 'Bellum')

    expect(await screen.findByText(/Theo Ha\*\*\*d/)).toBeInTheDocument()
    expect(screen.getByText('Nom en partie masqué, entreprise correspondante')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /profil public/i })).not.toBeInTheDocument()
  })
})
