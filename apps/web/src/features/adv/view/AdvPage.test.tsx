import type { AdvDossier, AdvSummary } from '@bellum/contracts'
import { ADV_BLOCKERS } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dossiers = vi.fn()
const update = vi.fn()
const entities = vi.fn()

vi.mock('../api', () => ({
  useAdvDossiers: () => dossiers(),
  useUpdateAdvDossier: () => ({ mutate: update, isPending: false, isError: false }),
  useAccountEntities: () => entities(),
  advApi: { exportCsv: vi.fn() },
}))
// La coque de page a ses propres garanties ; ici on vérifie le CONTENU.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
/** Le vrai `Link` exige un routeur monté. Le faux GARDE les attributs qu'on lui
 *  passe — un faux qui les jette testerait le mock et non le composant. */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { AdvPage } = await import('./AdvPage')

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

function summary(over: Partial<AdvSummary> = {}): AdvSummary {
  return {
    month: '2026-08',
    total: 2,
    starts: 1,
    renewals: 1,
    active: 1,
    readyToInvoice: 0,
    inNegotiation: null,
    incomplete: 2,
    startsDelta: null,
    renewalsDelta: null,
    byBlocker: ADV_BLOCKERS.map(blocker => ({
      blocker,
      count: blocker === 'kyc_not_validated' ? null : blocker === 'missing_client_reference' ? 2 : 0,
    })),
    ...over,
  }
}

function dossier(over: Partial<AdvDossier> = {}): AdvDossier {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Renfort plateforme',
    accountId: '22222222-2222-4222-8222-222222222222',
    accountName: 'ACME',
    kind: 'start',
    missionStatus: 'onboarding',
    state: 'incomplete',
    blockers: ['missing_client_reference'],
    openedOn: '2026-08-01',
    startedOn: '2026-08-01',
    endsOn: null,
    clientBillingReference: null,
    paymentTermsDays: null,
    paymentDetailsTransmittedAt: null,
    clientEntityId: null,
    clientEntityName: null,
    ...over,
  }
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  entities.mockReturnValue({ data: { items: [] }, isError: false })
  dossiers.mockReturnValue({
    data: { month: '2026-08', items: [dossier()], summary: summary(), renewalsTruncated: false },
    isLoading: false,
    isError: false,
  })
})

describe('AdvPage — aucun chiffre ne s’invente', () => {
  it('dit « non mesuré » pour « en négociation » plutôt que d’écrire un chiffre', () => {
    render(<AdvPage />)
    // La tuile EXISTE — la retirer laisserait croire qu'on ne s'est jamais posé
    // la question — et elle ne porte aucun nombre.
    expect(screen.getByText('En négociation')).toBeInTheDocument()
    expect(screen.getAllByText(/non mesuré/i).length).toBeGreaterThan(0)
  })

  // #1830 — la raison de la tuile « en négociation » faisait ~250 caractères
  // (concaténés à « non mesuré — »), trois fois plus longue que ses cinq
  // voisines de la même rangée (`grid-cols-6`) : la carte s'étirait, et
  // entraînait toute la rangée avec elle. La raison reste VRAIE (elle dit
  // toujours pourquoi), mais tient au même gabarit que ses voisines.
  it('raccourcit la raison « en négociation » au format de ses voisines de rangée', () => {
    render(<AdvPage />)
    expect(screen.getByText(/Une mission n'a pas d'état/i)).toBeInTheDocument()
    // L'ancienne phrase (~250 caractères affichés, « ce qui se négocie vit sur
    // les projets… ») ne doit plus apparaître : c'est elle qui étirait la
    // rangée.
    expect(screen.queryByText(/ce qui se négocie vit sur les projets/i)).not.toBeInTheDocument()
  })

  it('annonce l’écart mensuel comme NON MESURÉ, jamais « +0 »', () => {
    render(<AdvPage />)
    expect(screen.getAllByText(/Écart avec le mois précédent/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('+0')).not.toBeInTheDocument()
  })

  it('ne rend AUCUN chiffre pendant le chargement', () => {
    dossiers.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<AdvPage />)
    // « 0 dossier bloqué » le temps d'une requête fait refermer l'onglet avant
    // que la vérité arrive.
    expect(screen.queryByText('Tous')).not.toBeInTheDocument()
  })

  it('distingue une PANNE d’une liste vide', () => {
    dossiers.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<AdvPage />)
    expect(screen.getByText(/n'a pas pu être chargée/i)).toBeInTheDocument()
    // Et surtout : PAS l'état vide. Le message d'erreur cite volontairement
    // « aucun dossier à traiter » pour le NIER — c'est l'invitation à élargir
    // la sélection, propre à l'état vide, qui ne doit pas s'afficher.
    expect(screen.queryByText(/Change de mois ou retire un filtre/i)).not.toBeInTheDocument()
  })
})

describe('AdvPage — les pastilles mènent quelque part', () => {
  it('rend une pastille par motif, KYC compris, et la sienne dit « non mesuré »', () => {
    render(<AdvPage />)
    // Le libellé apparaît PLUSIEURS fois — l'histogramme, la pastille, la
    // ligne — et c'est voulu : le graphe montre, la pastille filtre, le lien
    // répare.
    expect(screen.getAllByText('Référence cliente manquante').length).toBeGreaterThan(1)
    expect(screen.getAllByText("Vérification d'identité de l'entité").length).toBeGreaterThan(0)
  })

  it('la pastille du motif réservé ne se clique pas — filtrer dessus rendrait une liste vide', () => {
    render(<AdvPage />)
    const chips = screen.getAllByRole('button')
    const kyc = chips.find(button => button.textContent?.includes("Vérification d'identité"))
    expect(kyc).toBeUndefined()
  })

  it('chaque motif de la ligne porte le lien de l’écran qui le répare', () => {
    render(<AdvPage />)
    const links = screen.getAllByRole('link')
    const repair = links.find(link => link.textContent === 'Référence cliente manquante')
    expect(repair).toHaveAttribute('href', '/missions/adv')
  })
})

describe('AdvPage — le chemin d’écriture est branché', () => {
  it('ouvre le panneau de réparation en cliquant une ligne, et enregistre', async () => {
    render(<AdvPage />)
    await user().click(screen.getByText('ACME'))
    const reference = screen.getByPlaceholderText(/Numéro fournisseur/i)
    await user().type(reference, 'REF-99')
    await user().click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: '11111111-1111-4111-8111-111111111111',
        input: expect.objectContaining({ clientBillingReference: 'REF-99' }),
      }),
      expect.anything(),
    )
  })

  it('RETIRE les conditions de règlement plutôt que d’écrire un zéro', async () => {
    dossiers.mockReturnValue({
      data: { month: '2026-08', items: [dossier({ paymentTermsDays: 60 })], summary: summary() },
      isLoading: false,
      isError: false,
    })
    render(<AdvPage />)
    await user().click(screen.getByText('ACME'))
    await user().clear(screen.getByDisplayValue('60'))
    await user().click(screen.getByRole('button', { name: 'Enregistrer' }))
    const [payload] = update.mock.calls[0] as [{ input: { paymentTermsDays: number | null } }]
    expect(payload.input.paymentTermsDays).toBeNull()
  })

  it('ne propose AUCUN champ où saisir un moyen de paiement', async () => {
    render(<AdvPage />)
    await user().click(screen.getByText('ACME'))
    // Bellum ne stocke aucun IBAN : ce qui se déclare est un ÉTAT, et c'est le
    // serveur qui pose la date.
    const html = document.body.innerHTML.toLowerCase()
    for (const forbidden of ['iban', 'bic', 'swift']) expect(html).not.toContain(forbidden)
    expect(screen.getByRole('button', { name: 'Déclarer transmises' })).toBeInTheDocument()
  })

  it('déclare la transmission par un ÉTAT booléen', async () => {
    render(<AdvPage />)
    await user().click(screen.getByText('ACME'))
    await user().click(screen.getByRole('button', { name: 'Déclarer transmises' }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ input: { paymentDetailsTransmitted: true } }))
  })

  it('dit qu’une liste d’entités ILLISIBLE n’est pas une liste vide', async () => {
    entities.mockReturnValue({ data: undefined, isError: true })
    render(<AdvPage />)
    await user().click(screen.getByText('ACME'))
    expect(screen.getByText(/n'ont pas pu être lues/i)).toBeInTheDocument()
  })
})

describe('AdvPage — l’ancienneté', () => {
  it('dit « non mesuré » quand l’ouverture du dossier est inconnue', () => {
    dossiers.mockReturnValue({
      data: { month: '2026-08', items: [dossier({ openedOn: null })], summary: summary() },
      isLoading: false,
      isError: false,
    })
    render(<AdvPage />)
    // « 0 jour » se lirait « ouvert aujourd'hui » sur un dossier qu'on ne sait
    // pas dater — et il ne remonterait jamais en tête d'une file par ancienneté.
    expect(screen.queryByText('0 jour')).not.toBeInTheDocument()
    expect(screen.getAllByText(/non mesuré/i).length).toBeGreaterThan(0)
  })
})

describe('AdvPage — l’histogramme par motif (16-finance-v6.png)', () => {
  it('montre une barre par motif, avec son CHIFFRE à côté', () => {
    render(<AdvPage />)
    // Le motif chiffré (« Référence cliente manquante », count: 2) porte son
    // nombre à côté du graphe — la règle que l'annexe dataviz dit la plus
    // importante.
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
  })

  it('ne rend AUCUNE barre à zéro sur le motif RÉSERVÉ — « non mesuré », jamais 0', () => {
    render(<AdvPage />)
    // Le KYC vaut `count: null` dans `summary()` : l'histogramme le NOMME
    // plutôt que de dessiner une barre à zéro, qui se lirait « aucun KYC à
    // valider ».
    expect(screen.getAllByText(/non mesuré/i).length).toBeGreaterThan(0)
  })

  it('n’ajoute AUCUN bouton — le graphe montre, seule la pastille filtre', () => {
    render(<AdvPage />)
    // Preuve vivante de la doctrine du lot : l'histogramme ne doit RIEN
    // ajouter au compte des pastilles cliquables.
    const chips = screen.getAllByRole('button')
    const histogramButtons = chips.filter(button => button.textContent?.includes('Référence cliente manquante'))
    expect(histogramButtons).toHaveLength(1)
  })
})

describe('AdvPage — la troncature de la source, jamais un silence (31/08/2026)', () => {
  it('NOMME une liste de renouvellements possiblement TRONQUÉE', () => {
    dossiers.mockReturnValue({
      data: { month: '2026-08', items: [dossier()], summary: summary(), renewalsTruncated: true },
      isLoading: false,
      isError: false,
    })
    render(<AdvPage />)
    expect(screen.getByText(/peut être incomplète/i)).toBeInTheDocument()
  })

  it('ne dit RIEN quand la source est loin du plafond', () => {
    render(<AdvPage />)
    expect(screen.queryByText(/peut être incomplète/i)).not.toBeInTheDocument()
  })
})

/**
 * #1829 — « supprime ce titre ». Comme #1826, ce qui était pointé est un
 * SOUS-TITRE ORPHELIN : la phrase posée tout en haut du corps, sans aucun
 * titre au-dessus d'elle (l'onglet actif « ADV » nomme déjà l'écran, donc
 * `PageHeader` masque son propre titre — `nameLivesInTabs`).
 *
 * Elle n'est répétée nulle part ailleurs sur cet écran : elle rejoint donc un
 * titre plutôt que d'être supprimée — sa première phrase devient ce titre, la
 * seconde reste sa légende (mécanisme identique à TimesheetsPage, #1826).
 */
describe('AdvPage — le sous-titre rejoint son titre (#1829)', () => {
  it('affiche un TITRE visible qui précède la phrase, dans le DOM', () => {
    render(<AdvPage />)
    const heading = screen.getByText("Ce qui manque pour qu'une mission puisse démarrer ou être reconduite")
    const caveat = screen.getByText("Une ligne par dossier, son motif, et l'écran où tu le règles.")
    expect(heading.compareDocumentPosition(caveat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ne perd rien de la phrase — une ligne par dossier, son motif, l’écran où le régler', () => {
    render(<AdvPage />)
    expect(screen.getByText("Une ligne par dossier, son motif, et l'écran où tu le règles.")).toBeInTheDocument()
  })
})
