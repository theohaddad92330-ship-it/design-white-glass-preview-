import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ExportHistoryEntry, PortabilityManifest } from '@bellum/contracts'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * #1812 (09/09/2026) — « Demander à {{copilot}} » ne prend plus de place sur la
 * page : sur un poste de bureau, c'est la BULLE qui porte la question, et
 * `AskLaura` ne rend alors rien du tout.
 *
 * Ce test-ci ne mesure pas la bulle — il mesure que CET écran propose bien le
 * geste, avec le bon libellé et le bon contexte. On double donc le dépôt pour
 * dire « une autre instance porte la bulle », cas où `AskLaura` rend son lien
 * exactement comme avant. Le nouveau chemin a ses propres tests :
 * `laura-intro-store.test.tsx`, `LauraIntroBar.test.tsx`, `LauraDock.intro.test.tsx`
 * et `AskLaura.test.tsx`.
 */
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

// #4349 V.1 — le bloc qualité des fiches a son propre test (TalentQualityBlock.test.tsx).
vi.mock('./TalentQualityBlock', () => ({ TalentQualityBlock: () => null }))

/**
 * « MES DONNÉES » — la page qu'on montre à quelqu'un qui hésite à nous confier
 * son CRM. Ce qui s'y teste n'est pas la mise en page : c'est qu'aucune de ses
 * phrases ne soit fausse.
 *
 * Les trois retours du 04/09 : #1522 (l'export global doit dire ce qu'il produit
 * AVANT le clic, et « ce qui n'est pas inclus » ne doit pas exposer notre
 * architecture), #1523 (la suppression sort du niveau des exports), #1524 (une
 * page de confiance, pas un tableau de bord décoratif).
 */
const fixtures = vi.hoisted(() => ({
  manifest: null as unknown,
  exportData: vi.fn(),
  exportHistory: vi.fn(() => Promise.resolve<ExportHistoryEntry[]>([])),
}))

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Louis' }))

vi.mock('@/features/settings/lib/portability-api', () => ({
  portabilityApi: {
    manifest: () => Promise.resolve(fixtures.manifest),
    downloadObject: vi.fn(() => Promise.resolve()),
  },
  saveAs: vi.fn(),
}))

vi.mock('@/features/settings/lib/privacy-api', () => ({
  privacyApi: {
    exportData: () => fixtures.exportData(),
    exportHistory: () => fixtures.exportHistory(),
    retention: () => Promise.resolve({ rules: [], sweepEnabled: false }),
  },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * #2439.7/.8/.17 — la catégorie « mémoire » LIT le registre existant
 * (`useMemoryLedger`), elle n'en refait aucun calcul (GA-26). On double le
 * hook pour ne pas dépendre de son propre réseau dans les tests de cet écran.
 */
const memoryLedgerFixture = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }))
vi.mock('@/features/memory/hooks/useMemoryLedger', () => ({
  useMemoryLedger: () => memoryLedgerFixture,
}))

// `Link` hors routeur jette, et l'écran entier disparaîtrait — le faux négatif
// qu'on ne veut pas diagnostiquer deux fois. Le `to` est reporté sur le `href` :
// un faux qui l'avale rendrait indistinguables « la porte est ouverte » et « la
// porte mène ailleurs ». Il transmet la ref, sinon `<Button asChild>` avertit.
vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    Link: forwardRef<HTMLAnchorElement, { to: string; children?: ReactNode; search?: Record<string, unknown> }>(
      ({ to, children, search, ...rest }, ref) => (
        <a
          ref={ref}
          href={search ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}` : to}
          {...rest}
        >
          {children}
        </a>
      ),
    ),
  }
})

const { MyDataView } = await import('./MyDataView')

function manifest(over: Partial<PortabilityManifest> = {}): PortabilityManifest {
  return {
    objects: [
      { labelKey: 'objects.identity', payloadKey: 'profile', formats: ['json'], rows: 1 },
      { labelKey: 'objects.contacts', payloadKey: 'contacts', formats: ['json', 'csv'], rows: 259 },
      { labelKey: 'objects.accounts', payloadKey: 'accounts', formats: ['json', 'csv'], rows: 6 },
    ],
    withheld: [
      { kind: 'workspace_owned', reasonKey: 'withheld.workspaceOwned', tables: ['projects', 'missions'] },
      { kind: 'shared_market', reasonKey: 'withheld.sharedMarket', tables: ['esn_directory'] },
      { kind: 'shared_operator', reasonKey: 'withheld.sharedOperator', tables: ['prompts', 'scores'] },
    ],
    lastExportedAt: null,
    deletionDelayDays: 30,
    ...over,
  } as PortabilityManifest
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MyDataView />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fixtures.manifest = manifest()
  fixtures.exportData.mockReset()
  fixtures.exportData.mockResolvedValue({ exportedAt: '2026-09-05T10:00:00.000Z' })
  fixtures.exportHistory.mockReset()
  fixtures.exportHistory.mockResolvedValue([])
  memoryLedgerFixture.data = { entries: [], unreadableLayers: [] }
  memoryLedgerFixture.isLoading = false
})

describe('#4295.15 — la politique et le registre se trouvent depuis Réglages', () => {
  it('l’en-tête de Données & exports renvoie vers /privacy', async () => {
    renderView()
    const link = await screen.findByRole('link', { name: 'Voir la politique et le registre' })
    expect(link).toHaveAttribute('href', '/privacy')
  })
})

describe('#1522 — l’export global dit ce qu’il produit AVANT le clic', () => {
  it('le bouton n’exporte pas : il ouvre le récapitulatif', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(await screen.findByRole('button', { name: /Exporter mes données/ }))

    // Rien n'est parti : c'est le point du retour, et c'est la seule chose que
    // le libellé promettait avant.
    expect(fixtures.exportData).not.toHaveBeenCalled()
    expect(await screen.findByText(/Voici ce que ton export contiendra/)).toBeInTheDocument()
  })

  it('le récapitulatif LIT le manifeste — il ne récite pas une liste écrite à la main', async () => {
    const user = userEvent.setup()
    fixtures.manifest = manifest({
      objects: [{ labelKey: 'objects.talents', payloadKey: 'consultants', formats: ['json'], rows: 7 }],
    } as Partial<PortabilityManifest>)
    renderView()

    await user.click(await screen.findByRole('button', { name: /Exporter mes données/ }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(/Talents et compétences/)).toBeInTheDocument()
    expect(dialog.getByText(/7 lignes/)).toBeInTheDocument()
    // Un objet absent du manifeste n'apparaît pas : une liste rédigée une fois
    // aurait menti au premier objet ajouté.
    expect(dialog.queryByText(/Contacts/)).toBeNull()
  })

  it('« non mesuré » survit jusque dans le récapitulatif — jamais « 0 »', async () => {
    const user = userEvent.setup()
    fixtures.manifest = manifest({
      objects: [{ labelKey: 'objects.contacts', payloadKey: 'contacts', formats: ['json'], rows: null }],
    } as Partial<PortabilityManifest>)
    renderView()

    await user.click(await screen.findByRole('button', { name: /Exporter mes données/ }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(/non mesuré/)).toBeInTheDocument()
    expect(dialog.queryByText(/0 ligne/)).toBeNull()
  })

  it('ne télécharge qu’à la confirmation', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(await screen.findByRole('button', { name: /Exporter mes données/ }))
    await user.click(await screen.findByRole('button', { name: /Télécharger mon export/ }))

    expect(fixtures.exportData).toHaveBeenCalledTimes(1)
  })

  /**
   * ⚠️ LE POINT LE PLUS FACILE À PERDRE.
   *
   * Le retour demande de supprimer « 154 tables », « 7 tables », « 1 table » :
   * *« Les tables internes n'apportent aucune valeur utilisateur et donnent
   * l'impression de voir l'architecture technique Bellum. »* La dérivation, elle,
   * reste ENTIÈRE côté serveur — c'est l'AFFICHAGE qui change, pas le calcul.
   */
  it('« ce qui n’est pas inclus » ne montre plus notre architecture', async () => {
    renderView()
    await screen.findByText(/Ce que tu n’emportes pas|Ce que tu n'emportes pas/)

    expect(screen.queryByText(/\d+ tables?/)).toBeNull()
    expect(document.body.textContent).not.toContain('plomberie')
  })

  it('chaque famille non incluse porte un TITRE lisible', async () => {
    renderView()
    expect(await screen.findByText("Données partagées de l'espace")).toBeInTheDocument()
    expect(screen.getByText('Référentiels communs')).toBeInTheDocument()
    expect(screen.getByText('Technologie Bellum')).toBeInTheDocument()
  })
})

describe('#1523 — la suppression n’est plus au même niveau que les exports', () => {
  it('vit dans une zone nommée, et son premier geste EXPLIQUE', async () => {
    renderView()

    expect(await screen.findByText('Zone sensible')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comprendre la suppression' })).toBeInTheDocument()
    // Le geste destructif n'est PAS au premier niveau : il vit chez la sécurité.
    expect(screen.queryByRole('link', { name: /Aller à la suppression/ })).toBeNull()
  })

  /**
   * ⚠️⚠️ LE DÉFAUT DE FOND, ET IL ÉTAIT DANS LA PHRASE.
   *
   * L'écran écrivait « Suppression complète sous 30 jours ». `deletionDelayDays`
   * est la durée de conservation des enregistrements ANONYMISÉS, pas un délai
   * avant destruction : la suppression, elle, est IMMÉDIATE. Quelqu'un qui lisait
   * « sous 30 jours » pouvait croire qu'il lui restait un mois pour revenir.
   */
  it('ne promet AUCUN délai avant la suppression — elle est immédiate', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(await screen.findByRole('button', { name: 'Comprendre la suppression' }))

    expect(screen.getByText(/tout de suite, à la confirmation/)).toBeInTheDocument()
    expect(screen.getByText(/pas de délai de rétractation/)).toBeInTheDocument()
    // Les 30 jours ne disparaissent pas : ils reprennent leur vrai sens.
    expect(screen.getByText(/purgées après 30 jours/)).toBeInTheDocument()
  })

  it('dit ce qui arrive aux collègues, et mène à la confirmation', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(await screen.findByRole('button', { name: 'Comprendre la suppression' }))

    expect(screen.getByText(/C'est ton compte qui part, pas le travail de ton équipe/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Aller à la suppression/ })).toHaveAttribute('href', '/settings/security')
  })
})

describe('#1524 — la page de confiance', () => {
  it('résume les périmètres avant d’en montrer le détail', async () => {
    renderView()

    const summary = await screen.findByText(/Ce que tu emportes où que tu ailles/)
    expect(summary).toBeInTheDocument()
    expect(screen.getByText(/Ce qui vit dans l'espace de travail/)).toBeInTheDocument()
  })

  /**
   * Une somme partielle est un chiffre FAUX présenté comme un fait. Si un seul
   * objet est revenu `null`, la carte compte ce qu'elle sait — les objets.
   */
  it('ne totalise pas des lignes quand l’une d’elles est non mesurée', async () => {
    fixtures.manifest = manifest({
      objects: [
        { labelKey: 'objects.contacts', payloadKey: 'contacts', formats: ['json'], rows: 259 },
        { labelKey: 'objects.accounts', payloadKey: 'accounts', formats: ['json'], rows: null },
      ],
    } as Partial<PortabilityManifest>)
    renderView()

    const summary = within(await screen.findByRole('group', { name: 'Résumé de tes périmètres de données' }))
    expect(summary.getByText('2 objets exportables')).toBeInTheDocument()
    // ⚠️ Mesuré DANS le résumé : la ligne de l'objet, elle, porte bien « 259
    // lignes ». Un test qui cherche sur toute la page confondrait les deux et
    // passerait au vert sur une somme partielle.
    expect(summary.queryByText(/259/)).toBeNull()
  })

  it('offre les aides contextuelles de Laura, sans panneau permanent', async () => {
    renderView()

    expect(await screen.findByText('Que contient mon export ?')).toBeInTheDocument()
    expect(screen.getByText("Pourquoi cette donnée n'est-elle pas incluse ?")).toBeInTheDocument()
    expect(screen.getByText("Mes données ou celles de l'espace ?")).toBeInTheDocument()
  })
})

/**
 * #2439.2 — chaque objet affiche aussi son niveau de classification, retrouvé
 * sur le même catalogue déclaré que le périmètre (jamais deviné, jamais
 * recalculé côté serveur).
 */
describe('#2439.2 — chaque donnée porte un niveau de classification', () => {
  it('affiche le niveau déclaré à côté de chaque objet', async () => {
    renderView()

    const identityLabel = await screen.findByText('Mon identité')
    const identityRow = identityLabel.closest('div')?.parentElement
    // `profile` est déclaré `personnel` sur le catalogue de contrat.
    expect(identityRow ? within(identityRow).getByText('Donnée personnelle') : null).toBeInTheDocument()

    const accountsLabel = screen.getByText('Comptes suivis')
    const accountsRow = accountsLabel.closest('div')?.parentElement
    // `accounts` est déclaré `confidentiel`.
    expect(accountsRow ? within(accountsRow).getByText('Confidentiel') : null).toBeInTheDocument()
  })
})

/**
 * #2439.7/.8/.17 — la première des cinq catégories manquantes du NO-GO : la
 * classification `technique` sort de « Mes données personnelles » pour sa
 * propre catégorie, plutôt que d'y rester noyée.
 */
describe('#2439.7/.8/.17 — la catégorie technique se distingue du personnel', () => {
  it('affiche « Données techniques » comme groupe séparé quand un objet technique est présent', async () => {
    fixtures.manifest = manifest({
      objects: [
        { labelKey: 'objects.identity', payloadKey: 'profile', formats: ['json'], rows: 1 },
        { labelKey: 'objects.devices', payloadKey: 'sessions', formats: ['json'], rows: 2 },
      ],
    })
    renderView()

    // Le libellé apparaît DEUX fois de bonne foi : la carte de résumé et
    // l'intertitre de la section — jamais un troisième, jamais zéro.
    expect(await screen.findAllByText('Données techniques')).toHaveLength(2)
    // Le résumé des périmètres porte aussi la troisième carte.
    const summary = within(await screen.findByRole('group', { name: 'Résumé de tes périmètres de données' }))
    expect(summary.getByText(/Bellum observe pour ta sécurité/)).toBeInTheDocument()
  })

  it("n'affiche aucun groupe technique quand aucun objet technique n'est présent", async () => {
    renderView()

    await screen.findByText('Mon identité')
    expect(screen.queryByText('Données techniques')).not.toBeInTheDocument()
  })
})

/**
 * #2893 (#2439.7/.8/.17) — « Fichiers », la seconde catégorie séparée du
 * périmètre : `ragDocuments` sort de « Les données de l'espace de travail »
 * pour sa propre catégorie, même patron que « Données techniques » ci-dessus.
 */
describe('#2893 — la catégorie « Fichiers » se distingue de l’espace', () => {
  it('affiche « Fichiers » comme groupe séparé quand un document est présent', async () => {
    fixtures.manifest = manifest({
      objects: [
        { labelKey: 'objects.accounts', payloadKey: 'accounts', formats: ['json'], rows: 6 },
        { labelKey: 'objects.documents', payloadKey: 'ragDocuments', formats: ['json'], rows: 3 },
      ],
    })
    renderView()

    expect(await screen.findAllByText('Fichiers')).toHaveLength(2)
    // Le document n'apparaît plus sous « Les données de l'espace de travail »
    // (le libellé apparaît aussi dans la carte de résumé, d'où `findAllByText`).
    const workspaceLabels = await screen.findAllByText("Les données de l'espace de travail")
    const workspaceGroup = workspaceLabels.map(label => label.closest('section')).find(Boolean)
    expect(workspaceGroup ? within(workspaceGroup).queryByText('Documents déposés') : null).not.toBeInTheDocument()
  })

  it("n'affiche aucun groupe Fichiers quand aucun document n'est présent", async () => {
    renderView()

    await screen.findByText('Mon identité')
    expect(screen.queryByText('Fichiers')).not.toBeInTheDocument()
  })
})

describe('#2439.3 (8e attribut) — la ligne dit aussi ce qui arrive à un objet si le compte est supprimé', () => {
  it('nomme le sort réel de chaque objet, distinct de sa rétention normale', async () => {
    fixtures.manifest = manifest({
      objects: [
        { labelKey: 'objects.esnProfile', payloadKey: 'esnProfiles', formats: ['json'], rows: 1 },
        { labelKey: 'objects.smsChannel', payloadKey: 'smsChannel', formats: ['json'], rows: 1 },
      ],
    })
    renderView()

    const smsLabel = await screen.findByText('Numéro pour les alertes SMS')
    const smsRow = smsLabel.closest('div')?.parentElement
    // `smsChannel` est le SEUL objet réellement SUPPRIMÉ (pas anonymisé, pas conservé).
    expect(smsRow ? within(smsRow).getByText(/Si tu supprimes ton compte : supprimée\./) : null).toBeInTheDocument()

    const esnProfileLabel = screen.getByText('Mon profil ESN')
    const esnProfileRow = esnProfileLabel.closest('div')?.parentElement
    // Donnée de l'espace : une suppression PERSONNELLE ne la touche pas.
    expect(
      esnProfileRow ? within(esnProfileRow).getByText(/Si tu supprimes ton compte : non concernée/) : null,
    ).toBeInTheDocument()
  })
})

describe('#2439.7/.8/.17 — « Mes exports », la catégorie « exports » du NO-GO', () => {
  it("n'affiche AUCUNE section quand le compte n'a jamais exporté", async () => {
    fixtures.exportHistory.mockResolvedValue([])
    renderView()

    await screen.findByText('Mon identité')
    expect(screen.queryByText('Mes exports')).not.toBeInTheDocument()
  })

  it('liste les exports réels, les plus récents d’abord, sans deviner un objet inconnu', async () => {
    fixtures.exportHistory.mockResolvedValue([
      { kind: 'object', objectKey: 'contacts', format: 'csv', createdAt: '2026-09-27T10:00:00.000Z' },
      { kind: 'full', objectKey: null, format: null, createdAt: '2026-09-20T08:30:00.000Z' },
    ])
    renderView()

    expect(await screen.findByText('Mes exports')).toBeInTheDocument()
    expect(screen.getByText(/Export : Contacts \(CSV\)/)).toBeInTheDocument()
    expect(screen.getByText(/Export complet/)).toBeInTheDocument()
  })
})

/**
 * #2439.7/.8/.17 — la troisième catégorie manquante du NO-GO : « fichiers »,
 * même patron que la catégorie technique (`sessions`) déjà livrée — sépare
 * `ragDocuments` de « Les données de l'espace de travail » sans rien inventer.
 */
describe('#2439.7/.8/.17 — la catégorie fichiers se distingue de l’espace', () => {
  it('affiche « Fichiers » comme groupe séparé quand des documents sont présents', async () => {
    fixtures.manifest = manifest({
      objects: [
        { labelKey: 'objects.identity', payloadKey: 'profile', formats: ['json'], rows: 1 },
        { labelKey: 'objects.documents', payloadKey: 'ragDocuments', formats: ['json'], rows: 4 },
      ],
    })
    renderView()

    expect(await screen.findAllByText('Fichiers')).toHaveLength(2)
  })

  it("n'affiche aucun groupe fichiers quand aucun document n'est présent", async () => {
    renderView()

    await screen.findByText('Mon identité')
    expect(screen.queryByText('Fichiers')).not.toBeInTheDocument()
  })
})

/**
 * #2439.7/.8/.17 — la quatrième catégorie manquante du NO-GO : « marché ». Le
 * référentiel partagé (#1522 : jamais un NOMBRE de tables) sort de la liste
 * générique « ce que tu n'emportes pas » pour sa propre carte, au même niveau
 * que les autres catégories — séparation visuelle des trois origines.
 */
describe('#2439.7/.8/.17 — la catégorie marché, séparée du générique « non inclus »', () => {
  it('affiche une carte « Marché » distincte quand un référentiel partagé existe', async () => {
    renderView()

    const cards = await screen.findAllByText('Marché')
    expect(cards.length).toBeGreaterThan(0)
    // Toujours pas de nombre de tables (#1522), y compris dans cette carte.
    expect(screen.queryByText(/\d+ tables?/)).not.toBeInTheDocument()
  })

  it("n'affiche aucune carte marché quand aucun référentiel partagé n'existe", async () => {
    fixtures.manifest = manifest({
      withheld: [{ kind: 'workspace_owned', reasonKey: 'withheld.workspaceOwned', tables: ['projects'] }],
    })
    renderView()

    await screen.findByText('Mon identité')
    expect(screen.queryByText('Marché')).not.toBeInTheDocument()
  })
})

/**
 * #2439.7/.8/.17 — la cinquième et dernière catégorie manquante du NO-GO :
 * « mémoire ». La carte LIT le registre existant (`useMemoryLedger`), elle
 * n'en recalcule rien (GA-26), et renvoie vers son propre écran (`/settings/
 * memory`) — loi 4, rien n'apparaît deux fois sous la même forme.
 */
describe('#2439.7/.8/.17 — la catégorie mémoire, lue depuis le registre existant', () => {
  it('affiche le nombre réel de lignes retenues par Laura', async () => {
    memoryLedgerFixture.data = {
      entries: [
        {
          id: '1',
          layer: 'facts',
          text: 'x',
          recordedAt: '2026-09-01T00:00:00Z',
          accountId: null,
          detail: null,
          expiresAt: null,
        },
        {
          id: '2',
          layer: 'preferences',
          text: 'y',
          recordedAt: '2026-09-01T00:00:00Z',
          accountId: null,
          detail: null,
          expiresAt: null,
        },
      ],
      unreadableLayers: [],
    }
    renderView()

    expect(await screen.findByText('Mémoire')).toBeInTheDocument()
    expect(screen.getByText(/2 lignes/)).toBeInTheDocument()
  })

  it('« non mesuré » plutôt que « 0 » quand une couche du registre est illisible', async () => {
    memoryLedgerFixture.data = { entries: [], unreadableLayers: ['facts'] }
    renderView()

    expect(await screen.findByText('Mémoire')).toBeInTheDocument()
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
    expect(screen.queryByText(/0 ligne/)).not.toBeInTheDocument()
  })

  it('renvoie vers /settings/memory, ne réaffiche pas le détail ici', async () => {
    renderView()

    const memoryLink = (await screen.findByText('Mémoire')).closest('a')
    expect(memoryLink).toHaveAttribute('href', '/settings/memory')
  })
})

/**
 * Théo D settings-compte.R3 / A4 / A6 — trois cartes en tête (export personnel,
 * export de l'espace, retirer mes informations), la confidentialité en bas de
 * page, et tout le reste gardé (historique, récapitulatif avant téléchargement).
 */
describe('MyDataView — settings-compte.R3 : trois cartes', () => {
  beforeEach(() => {
    fixtures.manifest = manifest()
    fixtures.exportHistory.mockResolvedValue([])
  })

  it('montre Export personnel, Export de l’espace et Retirer mes informations', async () => {
    renderView()
    expect(await screen.findByRole('heading', { name: 'Export personnel' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Export de l’espace' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Retirer mes informations personnelles' })).toBeInTheDocument()
  })

  it('« Exporter mes données » ouvre le récapitulatif AVANT tout téléchargement (A6)', async () => {
    const user = userEvent.setup()
    renderView()
    const card = (await screen.findByRole('heading', { name: 'Export personnel' })).closest('section') as HTMLElement
    await user.click(within(card).getByRole('button', { name: 'Exporter mes données' }))
    expect(await screen.findByText('Voici ce que ton export contiendra')).toBeInTheDocument()
    expect(fixtures.exportData).not.toHaveBeenCalled()
  })

  it('suit l’ordre de la maquette Théo : quatre blocs, du personnel à la confidentialité', async () => {
    renderView()
    await screen.findByRole('heading', { name: 'Export personnel' })
    const order = screen
      .getAllByRole('heading', { level: 2 })
      .map(heading => heading.textContent ?? '')
      .filter(text =>
        [
          'Export personnel',
          'Export de l’espace',
          'Retirer mes informations personnelles',
          'Confidentialité & conservation',
        ].includes(text),
      )
    expect(order).toEqual([
      'Export personnel',
      'Export de l’espace',
      'Retirer mes informations personnelles',
      'Confidentialité & conservation',
    ])
    expect(screen.getByRole('heading', { level: 1, name: 'Mes données' })).toBeInTheDocument()
  })
})

describe('MyDataView — settings-compte.A4 : confidentialité en bas de page', () => {
  beforeEach(() => {
    fixtures.manifest = manifest()
  })

  it('porte « Confidentialité & conservation » et la politique, sous la zone sensible', async () => {
    renderView()
    const section = (await screen.findByRole('heading', { name: 'Confidentialité & conservation' })).closest(
      'section',
    ) as HTMLElement
    expect(within(section).getByRole('link', { name: 'Lire la politique de confidentialité' })).toBeInTheDocument()
    expect(within(section).getByText('Tes droits')).toBeInTheDocument()
  })
})
