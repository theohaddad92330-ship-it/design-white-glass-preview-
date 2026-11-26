import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'
import type { RfpRequirement } from '@bellum/contracts'
import type { RfpDetail } from '../api'
import { resetLauraIntro, useCurrentLauraIntro } from '@/features/laura/bubble/laura-intro-store'
import { RfpWorkspace as RfpPage } from './RfpWorkspace'

// La coque de page a ses propres garanties ; ici on vérifie le CONTENU.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))
vi.mock('@/features/projects/hooks/useProjects', () => ({
  useProjects: () => ({ data: [], isLoading: false }),
}))
/**
 * #2571.3 — `Link` rend son `to`/`search` en `href` : c'est la DESTINATION de
 * la passerelle qu'on veut asserter, pas seulement la présence d'un lien —
 * même patron que `InvoiceReadinessPanel.test.tsx`.
 */
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, string>
    children: React.ReactNode
  }) => {
    const query = search ? new URLSearchParams(search).toString() : ''
    return (
      <a href={query ? `${to}?${query}` : to} {...rest}>
        {children}
      </a>
    )
  },
}))
const { openNeedsRows } = vi.hoisted(() => ({ openNeedsRows: { current: [] as unknown[] } }))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({ data: { data: openNeedsRows.current }, isLoading: false }),
}))
const { teamRole, hiddenSections, setSectionHidden } = vi.hoisted(() => ({
  teamRole: { current: 'owner' as string },
  hiddenSections: { current: [] as string[] },
  setSectionHidden: vi.fn(),
}))
const { downloadCsvMock } = vi.hoisted(() => ({ downloadCsvMock: vi.fn() }))
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => ({ allowed: true, grant: {} }) }))
vi.mock('@/lib/export-csv', () => ({ downloadCSV: downloadCsvMock }))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: teamRole.current } } }),
}))
// #2152.25 — la carte « Profils rattachés » a son propre test (`RfpProfilesCard.test.tsx`) ;
// ici, seul compte que le studio la monte sur le besoin de l'AO.
vi.mock('./RfpProfilesCard', () => ({
  RfpProfilesCard: ({ needId }: { needId: string }) => <p data-testid="rfp-profiles">{needId}</p>,
}))
vi.mock('../hooks/useWorkspaceHiddenSections', () => ({
  useWorkspaceHiddenSections: () => hiddenSections.current,
  useSetWorkspaceSectionHidden: () => ({ mutate: setSectionHidden, isPending: false }),
}))
const {
  rfpList,
  rfpGet,
  rfpUpdateRequirement,
  rfpPreview,
  rfpConfirm,
  rfpMarkSubmitted,
  rfpAddComment,
  rfpAssignSection,
  rfpDraft,
  rfpSourceDocuments,
  rfpDownloadSourceDocument,
  rfpImportSession,
  rfpSaveImportSession,
  rfpCancelImportSession,
} = vi.hoisted(() => ({
  // #2957 (#2180.53) — aucune session à reprendre par défaut.
  rfpImportSession: vi.fn(async () => ({ session: null as unknown })),
  rfpSaveImportSession: vi.fn(async () => ({})),
  rfpCancelImportSession: vi.fn(async () => ({ cancelled: true })),
  rfpAddComment: vi.fn(),
  rfpAssignSection: vi.fn(),
  rfpDraft: vi.fn(),
  rfpList: vi.fn(async () => ({ rfps: [] as unknown[] })),
  rfpGet: vi.fn(),
  rfpUpdateRequirement: vi.fn(),
  rfpPreview: vi.fn(),
  rfpConfirm: vi.fn(),
  rfpMarkSubmitted: vi.fn(),
  // #2957 (#2180.54) — vide par défaut : aucun test de ce fichier n'exerce la
  // carte « Documents sources », voir `RfpSourceDocuments.test.tsx`.
  rfpSourceDocuments: vi.fn(async () => ({ files: [] as unknown[], usedBytes: 0, quotaBytes: 1_000 })),
  rfpDownloadSourceDocument: vi.fn(),
}))
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    rfpKeys: actual.rfpKeys,
    rfpApi: {
      list: rfpList,
      get: rfpGet,
      updateRequirement: rfpUpdateRequirement,
      preview: rfpPreview,
      confirm: rfpConfirm,
      markSubmitted: rfpMarkSubmitted,
      addComment: rfpAddComment,
      assignSection: rfpAssignSection,
      draft: rfpDraft,
      sourceDocuments: rfpSourceDocuments,
      downloadSourceDocument: rfpDownloadSourceDocument,
      importSession: rfpImportSession,
      saveImportSession: rfpSaveImportSession,
      cancelImportSession: rfpCancelImportSession,
    },
  }
})

// jsdom (20.x, cette suite) n'implémente pas `File.prototype.arrayBuffer` —
// seul `IntakeCard` (#2180.2) en dépend dans cette page. `FileReader`, lui,
// est bien implémenté par jsdom.
beforeAll(() => {
  if (typeof File.prototype.arrayBuffer !== 'function') {
    File.prototype.arrayBuffer = function (this: File) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(reader.error ?? new Error('FileReader a échoué'))
        reader.readAsArrayBuffer(this)
      })
    }
  }
})

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <RfpPage />
    </QueryClientProvider>,
  )
}

/**
 * #1845 — « supprime ce titre ».
 *
 * L'élément pointé par le retour (markup joint à l'issue) est très précisément
 * le `<p>` de l'intro : `text-sm font-normal text-[var(--bellum-text-secondary)]
 * … max-w-[70ch]`, contenant EXACTEMENT `rfp.json#page.intro`. Ce n'est PAS le
 * titre d'entête (`CustomerPage pageTitle`) — celui-ci est déjà supprimé par
 * `PageHeader` dès qu'une section a plusieurs onglets (`nameLivesInTabs`,
 * 23/08), ce qui est déjà le cas de `/rfp` (section « Projets », 3 onglets) :
 * aucune répétition ne s'y produit aujourd'hui. Le texte flagué est la phrase
 * d'intro, redondante avec `routes.json#/rfp.description` (même information,
 * un mot près) et avec le geste lui-même une fois qu'on l'a fait une fois —
 * l'intitulé du bouton « Analyser » et les champs de l'intake suffisent à
 * savoir quoi faire.
 */
/**
 * #2179.4 / #2179.5 / #2179.6 — L'ENTÊTE DE LA PAGE.
 *
 * `PageHeader` supprime le titre de section dès qu'elle porte plusieurs
 * onglets (`nameLivesInTabs`) — c'est déjà le cas de `/rfp` (mock ci-dessus :
 * `CustomerPage` ne rend même pas cette chrome). Sans un titre écrit DANS
 * l'écran, la page n'affiche donc aucun titre du tout : c'est ce que ce test
 * vérifie, avec le sous-titre qui nomme le rôle de l'écran et ce qu'il suit.
 */
describe('#2179.4 / #2179.5 / #2179.6 — le titre et le sous-titre de /rfp', () => {
  it('affiche le titre exact et le sous-titre, écrits dans l’écran', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: "Tes appels d'offres" })).toBeInTheDocument()
    expect(screen.getByText(/Lire, distribuer et préparer un appel d'offres/)).toBeInTheDocument()
  })
})

/** Lit ce que le magasin partagé de Laura contient — la preuve du DÉPÔT,
 *  même patron que `VivierIntro.test.tsx` : sur bureau et hors surcouche,
 *  l'instance élue s'efface au profit de la bulle (`LauraDock`), donc on ne
 *  cherche pas un `<a>` visible mais l'amorce qu'elle a publiée. */
function IntroReader() {
  const intro = useCurrentLauraIntro()
  return <span data-testid="laura-intro">{intro ? `${intro.question}|${intro.label}` : 'rien'}</span>
}

/**
 * #2179.33 — LE CTA « Demander à Laura ».
 *
 * La catégorie « rfp » du tiroir de commandes existait déjà côté catalogue
 * (`chat-commands/categories.ts`) sans aucun point d'entrée sur cet écran —
 * `AskLaura` est la primitive partagée par une trentaine d'écrans (D44), pas
 * un second moteur de conversation.
 */
describe('#2179.33 — « Demander à Laura » sur /rfp', () => {
  afterEach(() => resetLauraIntro())

  it('dépose la question dans la conversation existante, sans l’envoyer', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={qc}>
        <RfpPage />
        <IntroReader />
      </QueryClientProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('laura-intro').textContent).toBe(
        "Aide-moi à prioriser mes appels d'offres en cours.|Demander à Laura",
      ),
    )
  })
})

describe('#1845 — /rfp n’affiche plus la phrase d’intro au-dessus de l’intake', () => {
  it('ne rend PAS le texte d’intro', async () => {
    renderPage()
    // Le champ de l'intake est la preuve que la page a bien fini de rendre —
    // sans lui, l'absence de l'intro pourrait juste vouloir dire « pas encore monté ».
    expect(
      await screen.findByLabelText('Intitulé du dossier (celui sous lequel tu le retrouveras)'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/ses exigences sont extraites et classées/)).toBeNull()
  })
})

const RFP_ID = '44444444-4444-4444-8444-444444444444'

function rfpDetail(over: Partial<RfpDetail['rfp']> = {}): RfpDetail {
  return {
    rfp: {
      id: RFP_ID,
      workspace_id: '55555555-5555-4555-8555-555555555555',
      account_id: null,
      title: 'Refonte SI comptable',
      issuer: null,
      source_format: 'text',
      status: 'analysed',
      due_at: null,
      lots: [],
      decision: null,
      requirements: [],
      document_extraction: null,
      created_at: '2026-09-17T00:00:00.000Z',
      updated_at: '2026-09-17T00:00:00.000Z',
      ...over,
    },
    compliance: {
      total: 0,
      mandatory: 0,
      mandatoryUnanswered: 0,
      ambiguous: 0,
      pendingByOwner: {},
      unprovenCommitments: [],
      exportReady: false,
    },
  }
}

/**
 * #2571.3 — LA PASSERELLE QUI MANQUAIT : côté consommateur tout est déjà là et
 * testé (`routes/projects/needs.tsx:fromRfp`, `OpenNeedsPage.tsx`,
 * `NeedFromRfpPreview.tsx`) — `git grep -rn "fromRfp" -- apps/web/src/features/rfp`
 * rendait ZÉRO avant ce lot. La salle de démonstration n'a aucun appel
 * d'offres importé (mesuré en recette le 18/09) : ce test est donc la SEULE
 * preuve du geste tant qu'aucun n'est semé (#2571.5, hors périmètre).
 */
describe('#2571.3 — la passerelle depuis /rfp vers l’aperçu du besoin proposé', () => {
  it('emmène vers /projects/needs?fromRfp=<id> — jamais un besoin créé directement au clic', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValueOnce(rfpDetail())
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))

    const link = await screen.findByRole('link', { name: 'Prévisualiser le besoin proposé' })
    // Un VRAI lien, pas un `onClick` sur un `div` : ce qui se clique se
    // tabule (GA-35), et l'href s'ouvre aussi au clic du milieu.
    expect(link).toHaveAttribute('href', `/projects/needs?fromRfp=${RFP_ID}`)
  })
})

/**
 * #2179.16 / #2179.17 / #2179.18 — LES VUES « Soumis », « Gagnés », « Perdus ».
 *
 * Un filtre CLIENT sur le statut déjà porté par chaque dossier
 * (`RfpSummary.status`) : aucune donnée nouvelle, juste un rangement de ce
 * qui existe déjà.
 */
/**
 * #2957 (#2180.9-.26/.27/.28/.30/.31) — la carte « Ce que le document dit ».
 * Contexte SCORE : les douze catégories sont TOUJOURS nommées, même celles
 * que le document ne porte pas — jamais une case retirée.
 */
describe('#2957 — la carte d’extraction document', () => {
  async function openDetail(extraction: RfpDetail['rfp']['document_extraction']) {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValueOnce(rfpDetail({ document_extraction: extraction }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))
    return screen.findByText('Ce que le document dit')
  }

  it('ne rend AUCUNE carte quand l’extraction n’a jamais tourné (dossier antérieur au chantier)', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValueOnce(rfpDetail())
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))
    await screen.findByText('Exigences')

    expect(screen.queryByText('Ce que le document dit')).toBeNull()
  })

  it('nomme les DOUZE catégories, y compris celles non trouvées — jamais une case retirée', async () => {
    await openDetail({
      legal_entity: { value: 'Ville de Test', source_document: null, page: '1', confidence: 'high', status: 'found' },
    })

    expect(screen.getByText('Entité juridique')).toBeInTheDocument()
    expect(screen.getByText('Ville de Test')).toBeInTheDocument()
    // Une catégorie que le document ne porte pas reste NOMMÉE, « Non trouvé » —
    // jamais une ligne tue (doctrine, absence en contexte SCORE).
    expect(screen.getByText('Tarifs')).toBeInTheDocument()
    expect(screen.getAllByText('Non trouvé').length).toBeGreaterThanOrEqual(11)
  })

  it('affiche la page citée à côté de la valeur', async () => {
    await openDetail({
      calendar: {
        value: 'Remise le 30/09/2026',
        source_document: null,
        page: '2',
        confidence: 'medium',
        status: 'found',
      },
    })

    expect(screen.getByText(/\(p\. 2\)/)).toBeInTheDocument()
  })
})

describe('#2179.16 / #2179.17 / #2179.18 — les vues de la liste des dossiers', () => {
  function rfp(over: { id: string; title: string; status: string }) {
    return {
      id: over.id,
      title: over.title,
      issuer: null,
      status: over.status,
      due_at: null,
      lots: [],
      account_id: null,
      created_at: '2026-09-17T00:00:00.000Z',
      updated_at: '2026-09-17T00:00:00.000Z',
    }
  }

  it('« Tous » montre tout, chaque vue ne montre que son statut', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        rfp({ id: '1', title: 'Dossier analysé', status: 'analysed' }),
        rfp({ id: '2', title: 'Dossier soumis', status: 'submitted' }),
        rfp({ id: '3', title: 'Dossier gagné', status: 'won' }),
        rfp({ id: '4', title: 'Dossier perdu', status: 'lost' }),
      ],
    })
    renderPage()

    expect(await screen.findByRole('button', { name: /Dossier analysé/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dossier soumis/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dossier gagné/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dossier perdu/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Gagnés' }))

    expect(screen.getByRole('button', { name: /Dossier gagné/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dossier analysé/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Dossier soumis/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Dossier perdu/ })).toBeNull()
  })

  // #2957 (#2179.13/.14/.15/.19) — les quatre vues restantes, DÉRIVÉES de la
  // donnée réelle : statut + réponses à valider (tranché sans Louis).
  it('À traiter / En préparation / À valider / Archivés dérivent du statut et des réponses à valider', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          ...rfp({ id: '1', title: 'Dossier à trancher', status: 'analysed' }),
          mandatoryUnanswered: 1,
          toValidateCount: 0,
        },
        { ...rfp({ id: '2', title: 'Dossier en cours', status: 'bid' }), mandatoryUnanswered: 1, toValidateCount: 0 },
        { ...rfp({ id: '3', title: 'Dossier à relire', status: 'bid' }), mandatoryUnanswered: 0, toValidateCount: 2 },
        { ...rfp({ id: '4', title: 'Dossier renoncé', status: 'no_bid' }), mandatoryUnanswered: 0, toValidateCount: 0 },
      ],
    })
    renderPage()
    await screen.findByRole('button', { name: /Dossier à trancher/ })
    const only = (view: string, title: RegExp) => async () => {
      await userEvent.click(screen.getByRole('button', { name: view }))
      const shown = ['Dossier à trancher', 'Dossier en cours', 'Dossier à relire', 'Dossier renoncé'].filter(
        name => screen.queryByRole('button', { name: new RegExp(name) }) !== null,
      )
      expect(shown).toEqual(shown.filter(name => title.test(name)))
      expect(shown).toHaveLength(1)
    }
    await only('À traiter', /à trancher/)()
    await only('En préparation', /en cours/)()
    await only('À valider', /à relire/)()
    await only('Archivés', /renoncé/)()
  })

  it('une vue sans dossier affiche un vide NOMMÉ, pas la liste entière', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [rfp({ id: '1', title: 'Dossier analysé', status: 'analysed' })],
    })
    renderPage()

    await screen.findByRole('button', { name: /Dossier analysé/ })
    await userEvent.click(screen.getByRole('button', { name: 'Perdus' }))

    expect(screen.queryByRole('button', { name: /Dossier analysé/ })).toBeNull()
    expect(screen.getByText('Aucun dossier dans cette vue.')).toBeInTheDocument()
  })
})

/**
 * #2957 (#2179.20-.29) — la vue table : six colonnes RÉELLEMENT calculées
 * (client, périmètre, échéance, statut, exigences, couverture), triables au
 * clic sur l'entête.
 */
describe('#2957 (#2179.20-.29) — la vue table de la liste des dossiers', () => {
  function rfp(over: {
    id: string
    title: string
    issuer?: string | null
    due_at?: string | null
    lots?: string[]
    requirementsCount?: number
    mandatoryTotal?: number
    mandatoryUnanswered?: number
  }) {
    return {
      id: over.id,
      title: over.title,
      issuer: over.issuer ?? null,
      status: 'bid',
      due_at: over.due_at ?? null,
      lots: over.lots ?? [],
      account_id: null,
      created_at: '2026-09-17T00:00:00.000Z',
      updated_at: '2026-09-17T00:00:00.000Z',
      toValidateCount: 0,
      requirementsCount: over.requirementsCount ?? 0,
      mandatoryTotal: over.mandatoryTotal ?? 0,
      mandatoryUnanswered: over.mandatoryUnanswered ?? 0,
    }
  }

  it('bascule en tableau et montre les six colonnes réelles', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        rfp({
          id: '1',
          title: 'Dossier A',
          issuer: 'Ville de Test',
          due_at: '2026-12-01T00:00:00.000Z',
          lots: ['Lot 1'],
          requirementsCount: 5,
          mandatoryTotal: 3,
          mandatoryUnanswered: 1,
        }),
      ],
    })
    renderPage()

    await screen.findByRole('button', { name: /Dossier A/ })
    await userEvent.click(screen.getByRole('button', { name: 'Tableau' }))

    const table = await screen.findByRole('table', { name: 'Tes dossiers' })
    expect(within(table).getByText('Ville de Test')).toBeInTheDocument()
    expect(within(table).getByText('Lot 1')).toBeInTheDocument()
    expect(within(table).getByText('2/3 obligatoires validées')).toBeInTheDocument()
    expect(within(table).getByText('5')).toBeInTheDocument()
  })

  it('un dossier sans échéance affiche « — », jamais une date inventée', async () => {
    rfpList.mockResolvedValueOnce({ rfps: [rfp({ id: '1', title: 'Dossier sans échéance' })] })
    renderPage()

    await screen.findByRole('button', { name: /Dossier sans échéance/ })
    await userEvent.click(screen.getByRole('button', { name: 'Tableau' }))

    const table = await screen.findByRole('table', { name: 'Tes dossiers' })
    const row = within(table).getByText('Dossier sans échéance').closest('tr') as HTMLElement
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('trier par échéance inverse l’ordre au second clic, une échéance absente reste toujours en fin', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        rfp({ id: '1', title: 'Sans échéance' }),
        rfp({ id: '2', title: 'Échéance proche', due_at: '2026-10-01T00:00:00.000Z' }),
        rfp({ id: '3', title: 'Échéance lointaine', due_at: '2026-12-01T00:00:00.000Z' }),
      ],
    })
    renderPage()

    await screen.findByRole('button', { name: /Sans échéance/ })
    await userEvent.click(screen.getByRole('button', { name: 'Tableau' }))
    const table = await screen.findByRole('table', { name: 'Tes dossiers' })

    const titlesInOrder = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map(row => row.textContent ?? '')

    // Tri croissant (déjà actif par défaut sur l'échéance) : proche d'abord,
    // « sans échéance » toujours en dernier.
    let titles = titlesInOrder()
    expect(titles[0]).toContain('Échéance proche')
    expect(titles[1]).toContain('Échéance lointaine')
    expect(titles[2]).toContain('Sans échéance')

    // Second sens : décroissant — lointaine d'abord, « sans échéance » TOUJOURS en dernier.
    await userEvent.click(screen.getByRole('button', { name: 'Trier par Échéance' }))
    titles = titlesInOrder()
    expect(titles[0]).toContain('Échéance lointaine')
    expect(titles[1]).toContain('Échéance proche')
    expect(titles[2]).toContain('Sans échéance')
  })

  it('cliquer une ligne ouvre le détail, comme en vue cartes', async () => {
    rfpGet.mockResolvedValue(rfpDetail({ title: 'Dossier A' }))
    rfpList.mockResolvedValueOnce({ rfps: [rfp({ id: RFP_ID, title: 'Dossier A' })] })
    renderPage()

    await screen.findByRole('button', { name: /Dossier A/ })
    await userEvent.click(screen.getByRole('button', { name: 'Tableau' }))
    const table = await screen.findByRole('table', { name: 'Tes dossiers' })
    await userEvent.click(within(table).getByRole('button', { name: 'Dossier A' }))

    expect(await screen.findByText('Conformité')).toBeInTheDocument()
    expect(screen.queryByText('Sélectionne un dossier pour voir ses exigences.')).not.toBeInTheDocument()
  })
})

const REQUIREMENT_ID = '66666666-6666-4666-8666-666666666666'

/**
 * #2152.24 — « attribuer » une exigence : le contrat porte déjà `owner_role`
 * en écriture (`updateRfpRequirementSchema`, `PATCH /rfp/:id/requirements/:id`)
 * mais `RequirementsTable` ne le rendait qu'en LECTURE (`t('owner.…')` dans un
 * `Text`). L'assignation reste un RÔLE, jamais une personne — nominative, hors
 * périmètre par design (commentaire `rfp.ts` sur `rfpOwnerRoleSchema`).
 */
describe('#2152.24 — attribuer un rôle à une exigence RFP', () => {
  function detailWithRequirement(): RfpDetail {
    const base = rfpDetail()
    return {
      ...base,
      rfp: {
        ...base.rfp,
        requirements: [
          {
            id: REQUIREMENT_ID,
            rfp_id: RFP_ID,
            section: null,
            text: 'Le prestataire doit garantir un PRA sous 4h.',
            weight: 'mandatory',
            kind: 'technical',
            owner_role: 'sales',
            answer_status: 'to_produce',
            answer_source: null,
            answer_text: null,
            risk: null,
            source_document: null,
          },
        ],
      },
      compliance: { ...base.compliance, total: 1, mandatory: 1, mandatoryUnanswered: 1 },
    }
  }

  it('câble un select owner_role — PATCH avec le rôle choisi, pas une assignation nominative', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValueOnce(detailWithRequirement())
    rfpUpdateRequirement.mockResolvedValueOnce(detailWithRequirement())
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))

    const select = await screen.findByLabelText('Rôle qui répond — Le prestataire doit garantir un PRA sous 4h.')
    await chooseOption(select, 'legal')

    expect(rfpUpdateRequirement).toHaveBeenCalledWith(RFP_ID, REQUIREMENT_ID, { owner_role: 'legal' })
  })
})

/**
 * #2957 (#2181.19/.20/.22/.23) — le statut de réponse ne se posait QUE par le
 * service (bouton « Rédiger » → `drafted`) ; les quatre valeurs ajoutées au
 * registre `STATUTS` (à compléter/à valider/bloquée/non applicable)
 * n'avaient donc aucun moyen d'être posées depuis l'écran, malgré un contrat
 * déjà prêt à les accepter (`updateRfpRequirementSchema.answer_status`).
 */
describe('#2957 (#2181.19/.20/.22/.23) — poser un des nouveaux statuts de réponse', () => {
  function detailWithRequirement(): RfpDetail {
    const base = rfpDetail()
    return {
      ...base,
      rfp: {
        ...base.rfp,
        requirements: [
          {
            id: REQUIREMENT_ID,
            rfp_id: RFP_ID,
            section: null,
            text: 'Le prestataire doit garantir un PRA sous 4h.',
            weight: 'mandatory',
            kind: 'technical',
            owner_role: 'sales',
            answer_status: 'to_produce',
            answer_source: null,
            answer_text: null,
            risk: null,
            source_document: null,
          },
        ],
      },
      compliance: { ...base.compliance, total: 1, mandatory: 1, mandatoryUnanswered: 1 },
    }
  }

  it('câble un select answer_status — PATCH avec le statut choisi', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValueOnce(detailWithRequirement())
    rfpUpdateRequirement.mockResolvedValueOnce(detailWithRequirement())
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))

    const select = await screen.findByLabelText('Statut de la réponse — Le prestataire doit garantir un PRA sous 4h.')
    await chooseOption(select, 'blocked')

    expect(rfpUpdateRequirement).toHaveBeenCalledWith(RFP_ID, REQUIREMENT_ID, { answer_status: 'blocked' })
  })
})

/**
 * #2957 (#2181.10/.14/.42) — « Ajouter une preuve » : le contrat portait déjà
 * `evidence`/`confidence` en écriture (`updateRfpRequirementSchema`) sans
 * AUCUN geste écran pour les poser.
 */
describe('#2957 (#2181.10/.14/.42) — ajouter une preuve à une exigence RFP', () => {
  function detailWithRequirement(): RfpDetail {
    const base = rfpDetail()
    return {
      ...base,
      rfp: {
        ...base.rfp,
        requirements: [
          {
            id: REQUIREMENT_ID,
            rfp_id: RFP_ID,
            section: null,
            text: 'Le prestataire doit garantir un PRA sous 4h.',
            weight: 'mandatory',
            kind: 'technical',
            owner_role: 'sales',
            answer_status: 'to_produce',
            answer_source: null,
            answer_text: null,
            risk: null,
            source_document: null,
          },
        ],
      },
      compliance: { ...base.compliance, total: 1, mandatory: 1, mandatoryUnanswered: 1 },
    }
  }

  it('ouvre le formulaire et envoie evidence + confidence via PATCH', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValueOnce(detailWithRequirement())
    rfpUpdateRequirement.mockResolvedValueOnce(detailWithRequirement())
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter une preuve' }))

    const textarea = await screen.findByLabelText('Texte de la preuve')
    await userEvent.type(textarea, 'Attestation PRA 2026, page 3.')
    const confidenceSelect = screen.getByLabelText('Confiance dans la réponse')
    await chooseOption(confidenceSelect, 'high')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la preuve' }))

    expect(rfpUpdateRequirement).toHaveBeenCalledWith(RFP_ID, REQUIREMENT_ID, {
      evidence: 'Attestation PRA 2026, page 3.',
      confidence: 'high',
    })
  })
})

/**
 * #2180.2 / #2180.4 — l'intake DÉTECTE et REGROUPE plusieurs documents.
 *
 * Un seul document (texte ou fichier) doit envoyer EXACTEMENT la forme
 * mono-document d'avant — sans `documents` — pour ne rien changer côté API
 * tant que rien n'est regroupé. Deux fichiers ou plus doivent apparaître
 * regroupés dans `documents`, chacun avec son `fileName`.
 *
 * #2180.5 — « Analyser » appelle désormais `preview`, jamais `create`
 * directement : rien n'est écrit tant que l'écran de preview n'a pas été
 * confirmé (voir la describe suivante).
 */
describe('#2180.2 / #2180.4 — intake multi-documents', () => {
  afterEach(() => rfpPreview.mockReset())

  function emptyPreview(title: string) {
    return {
      draft: {
        account_id: null,
        title,
        issuer: null,
        source_format: 'pasted',
        due_at: null,
        lots: [],
        source_text: null,
        decision: null,
        requirements: [],
        document_hash: 'a'.repeat(64),
      },
      indicators: {
        totalRequirements: 0,
        mandatoryRequirements: 0,
        dueAt: null,
        missingDocuments: null,
        contradictions: null,
        estimatedCost: null,
      },
      duplicateOf: null,
      failedDocuments: [],
    }
  }

  it('envoie la forme mono-document d’avant quand un seul texte est collé', async () => {
    rfpPreview.mockResolvedValue(emptyPreview('AO texte seul'))
    renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByPlaceholderText(/Intitulé du dossier/), 'AO texte seul')
    await user.type(screen.getByPlaceholderText(/Colle le texte de la consultation/), 'contenu de la consultation')
    await user.click(screen.getByRole('button', { name: 'Analyser' }))

    await waitFor(() =>
      expect(rfpPreview).toHaveBeenCalledWith({ title: 'AO texte seul', text: 'contenu de la consultation' }),
    )
  })

  it('regroupe deux fichiers déposés dans UN dossier, via `documents`', async () => {
    rfpPreview.mockResolvedValue(emptyPreview('AO multi-documents'))
    const { container } = renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByPlaceholderText(/Intitulé du dossier/), 'AO multi-documents')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const cctp = new File(['cahier des charges'], 'cctp.pdf', { type: 'application/pdf' })
    const bpu = new File(['bordereau de prix'], 'bpu.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(fileInput, [cctp, bpu])

    expect(await screen.findByText('cctp.pdf')).toBeInTheDocument()
    expect(screen.getByText('bpu.xlsx')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Analyser' }))

    await waitFor(() => expect(rfpPreview).toHaveBeenCalledTimes(1))
    const call = rfpPreview.mock.calls[0][0]
    expect(call.title).toBe('AO multi-documents')
    expect(call.text).toBeUndefined()
    expect(call.documents).toEqual([
      { fileBase64: expect.any(String), fileName: 'cctp.pdf' },
      { fileBase64: expect.any(String), fileName: 'bpu.xlsx' },
    ])
  })

  it('retirer un fichier déposé le sort de la liste avant l’envoi', async () => {
    rfpPreview.mockResolvedValue(emptyPreview('AO retrait'))
    const { container } = renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByPlaceholderText(/Intitulé du dossier/), 'AO retrait')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const cctp = new File(['cahier des charges'], 'cctp.pdf', { type: 'application/pdf' })
    const bpu = new File(['bordereau de prix'], 'bpu.xlsx', { type: 'text/plain' })
    await user.upload(fileInput, [cctp, bpu])
    expect(await screen.findByText('cctp.pdf')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retirer bpu.xlsx' }))
    expect(screen.queryByText('bpu.xlsx')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Analyser' }))
    await waitFor(() => expect(rfpPreview).toHaveBeenCalledTimes(1))
    // Un seul fichier restant : forme mono-document, pas `documents`.
    expect(rfpPreview.mock.calls[0][0]).toEqual({
      title: 'AO retrait',
      fileBase64: expect.any(String),
      fileName: 'cctp.pdf',
    })
  })
})

/**
 * #2180.5 / #2180.6 / #2180.41-52 — L'ÉCRAN DE PREVIEW ET SA CONFIRMATION.
 *
 * Cliquer « Analyser » ne crée plus rien : il affiche l'aperçu, avec ses
 * indicateurs (#2180.41-46) et ses actions de contrôle (#2180.47-52). Seule
 * « Confirmer » (ou « Créer comme brouillon ») écrit, via `POST /rfp/confirm`.
 */
describe('#2180.5 / #2180.6 — l’écran de preview d’import', () => {
  afterEach(() => {
    rfpPreview.mockReset()
    rfpConfirm.mockReset()
  })

  function preview(
    over: {
      totalRequirements?: number
      mandatoryRequirements?: number
      dueAt?: string | null
      duplicateOf?: { id: string; title: string; matchedOn: string[] } | null
      failedDocuments?: { fileName: string | null; reason: string }[]
    } = {},
  ) {
    return {
      draft: {
        account_id: null,
        title: 'AO industrialisation',
        issuer: null,
        source_format: 'pasted',
        due_at: over.dueAt ?? null,
        lots: [],
        source_text: 'contenu',
        decision: null,
        requirements: [],
        document_hash: 'a'.repeat(64),
      },
      indicators: {
        totalRequirements: over.totalRequirements ?? 3,
        mandatoryRequirements: over.mandatoryRequirements ?? 2,
        dueAt: over.dueAt ?? null,
        missingDocuments: null,
        contradictions: null,
        estimatedCost: null,
      },
      duplicateOf: over.duplicateOf ?? null,
      failedDocuments: over.failedDocuments ?? [],
    }
  }

  async function reachPreview(response: ReturnType<typeof preview>) {
    rfpPreview.mockResolvedValue(response)
    renderPage()
    const user = userEvent.setup()
    await user.type(await screen.findByPlaceholderText(/Intitulé du dossier/), 'AO industrialisation')
    await user.type(screen.getByPlaceholderText(/Colle le texte de la consultation/), 'contenu')
    await user.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText("Aperçu de l'import")
    return user
  }

  it('affiche les indicateurs réels — total et obligatoires calculés depuis les exigences', async () => {
    await reachPreview(preview({ totalRequirements: 5, mandatoryRequirements: 2 }))

    expect(screen.getByText('Exigences').nextSibling).toHaveTextContent('5')
    expect(screen.getByText('Obligatoires').nextSibling).toHaveTextContent('2')
  })

  it('nomme « Non mesuré » les trois axes sans détection — jamais un zéro fabriqué (#2180.43/.44/.46)', async () => {
    await reachPreview(preview())

    expect(screen.getAllByText('Non mesuré').length).toBeGreaterThanOrEqual(3)
  })

  it('signale un doublon nommé quand le hash correspond à un dossier déjà importé (#2180.40)', async () => {
    await reachPreview(preview({ duplicateOf: { id: 'rfp-existant', title: 'AO déjà importé', matchedOn: ['hash'] } }))

    expect(screen.getByText(/Un dossier « AO déjà importé » avec le même contenu existe déjà/)).toBeInTheDocument()
  })

  it('signale un doublon PAR RÉFÉRENCE de consultation, critère nommé (#2180.39)', async () => {
    await reachPreview(
      preview({ duplicateOf: { id: 'rfp-ref', title: 'AO même référence', matchedOn: ['reference'] } }),
    )

    expect(screen.getByText(/« AO même référence » \(même référence de consultation\)/)).toBeInTheDocument()
  })

  it('signale un doublon PAR SIMILARITÉ en nommant les critères qui concordent (#2180.36-38)', async () => {
    await reachPreview(
      preview({ duplicateOf: { id: 'rfp-proche', title: 'AO proche', matchedOn: ['title', 'issuer'] } }),
    )

    expect(
      screen.getByText(
        /Un dossier proche existe déjà dans cet espace : « AO proche » \(titre proche et même émetteur\)/,
      ),
    ).toBeInTheDocument()
  })

  it('aucun avertissement quand aucun doublon n’a été trouvé', async () => {
    await reachPreview(preview({ duplicateOf: null }))

    expect(screen.queryByText(/existe déjà dans cet espace/)).not.toBeInTheDocument()
  })

  it('#2180.53 — nomme le document en échec sans faire disparaître la preview des autres', async () => {
    await reachPreview(preview({ failedDocuments: [{ fileName: 'lot2.pdf', reason: 'Document illisible' }] }))

    expect(screen.getByText('Documents non analysés')).toBeInTheDocument()
    expect(screen.getByText('lot2.pdf : Document illisible')).toBeInTheDocument()
  })

  it('aucun échec → aucune bannière « documents non analysés »', async () => {
    await reachPreview(preview())

    expect(screen.queryByText('Documents non analysés')).not.toBeInTheDocument()
  })

  it('« Confirmer » écrit exactement le brouillon prévisualisé, via `POST /rfp/confirm`', async () => {
    const response = preview()
    const user = await reachPreview(response)
    rfpConfirm.mockResolvedValue({ rfp: { id: 'rfp-new', requirements: [] }, compliance: {} })

    await user.click(screen.getByRole('button', { name: 'Confirmer' }))

    // #2957 (#2180.54) — `sourceDocuments` voyage aussi, vide ici : `reachPreview`
    // saisit un texte collé, aucun fichier à reconserver.
    await waitFor(() => expect(rfpConfirm).toHaveBeenCalledWith(response.draft, undefined, []))
  })

  it('« Annuler l’import » revient à un intake vide — rien n’était écrit', async () => {
    const user = await reachPreview(preview())

    await user.click(screen.getByRole('button', { name: "Annuler l'import" }))

    expect(rfpConfirm).not.toHaveBeenCalled()
    expect(await screen.findByPlaceholderText(/Intitulé du dossier/)).toHaveValue('')
  })

  it('« Corriger » revient à l’intake SANS vider ce qui a déjà été saisi', async () => {
    const user = await reachPreview(preview())

    await user.click(screen.getByRole('button', { name: 'Corriger' }))

    expect(rfpConfirm).not.toHaveBeenCalled()
    expect(await screen.findByPlaceholderText(/Intitulé du dossier/)).toHaveValue('AO industrialisation')
  })

  it('« Exclure » un document relance une preview avec ce qui reste (#2180.49)', async () => {
    const { container } = renderPage()
    const user = userEvent.setup()
    await user.type(await screen.findByPlaceholderText(/Intitulé du dossier/), 'AO deux fichiers')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const cctp = new File(['cahier des charges'], 'cctp.pdf', { type: 'application/pdf' })
    const bpu = new File(['bordereau de prix'], 'bpu.xlsx', { type: 'text/plain' })
    await user.upload(fileInput, [cctp, bpu])
    rfpPreview.mockResolvedValue(preview({ totalRequirements: 4 }))
    await user.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText("Aperçu de l'import")

    rfpPreview.mockClear()
    rfpPreview.mockResolvedValue(preview({ totalRequirements: 1 }))
    await user.click(screen.getByRole('button', { name: 'Exclure bpu.xlsx' }))

    await waitFor(() => expect(rfpPreview).toHaveBeenCalledTimes(1))
    const call = rfpPreview.mock.calls[0][0]
    expect(call.text).toBeUndefined()
    expect(call.fileName).toBe('cctp.pdf')
  })
})

/**
 * #2957 (#2181.47) — « Marquer soumis » : `submitted` existait dans le
 * contrat sans AUCUN bouton pour y passer.
 */
describe('#2957 (#2181.47) — marquer un dossier soumis', () => {
  it('n’affiche le bouton qu’après la décision « on y va » (status bid)', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValueOnce(rfpDetail({ status: 'analysed' }))
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))
    await screen.findByText('Conformité')

    expect(screen.queryByRole('button', { name: 'Marquer soumis' })).not.toBeInTheDocument()
  })

  it('câble le bouton « Marquer soumis » sur POST /rfp/:id/submitted', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'bid',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValueOnce(rfpDetail({ status: 'bid' }))
    rfpMarkSubmitted.mockResolvedValueOnce({ rfp: { id: RFP_ID, status: 'submitted' } })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Marquer soumis' }))

    expect(rfpMarkSubmitted).toHaveBeenCalledWith(RFP_ID)
  })
})

/**
 * #2957 (#2181.41) — « Demander à Laura » DANS le studio, pas seulement en
 * tête de liste (#2179.33, déjà là). La catégorie « rfp » du tiroir de
 * commandes existait déjà côté catalogue, sans point d'entrée SCOPÉ au
 * dossier ouvert.
 */
describe('#2957 (#2181.41) — « Demander à Laura » sur un dossier RFP ouvert', () => {
  afterEach(() => resetLauraIntro())

  it('dépose une question qui nomme LE dossier ouvert, dès l’ouverture du dossier', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValueOnce(rfpDetail())
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={qc}>
        <RfpPage />
        <IntroReader />
      </QueryClientProvider>,
    )

    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))
    await screen.findByText('Conformité')

    // Deux `<AskLaura>` vivent désormais sur cet écran (en-tête + dossier
    // ouvert) : le magasin fait gagner le DERNIER enregistré (`laura-intro-store`,
    // règle 1) — celui du dossier, monté après celui de l'en-tête.
    await waitFor(() =>
      expect(screen.getByTestId('laura-intro').textContent).toBe(
        "Aide-moi sur l'appel d'offres « Refonte SI comptable ».|Demander à Laura",
      ),
    )
  })
})

/**
 * #2957 (#2179.7-.12) — LE RÉSUMÉ de la page d'entrée. Registre RÉSUMÉ de
 * #2179 : Actifs, À J-7, Exigences bloquantes, Profils manquants, Réponses
 * à valider, Soumis — AUCUNE de ces six cartes n'existait avant ce lot.
 */
describe('#2957 (#2179.7-.12) — les cartes de résumé', () => {
  it('compte réellement, sur les dossiers ACTIFS seulement, et nomme ce qui n’est pas mesuré', async () => {
    const now = Date.now()
    const inThreeDays = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString()
    const inOneDay = new Date(now + 1 * 24 * 60 * 60 * 1000).toISOString()
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: 'rfp-1',
          title: 'AO actif à échéance proche',
          issuer: null,
          status: 'bid',
          due_at: inThreeDays,
          lots: [],
          account_id: null,
          mandatoryUnanswered: 2,
          toValidateCount: 1,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
        {
          id: 'rfp-2',
          title: 'AO gagné — plus actif',
          issuer: null,
          status: 'won',
          due_at: inOneDay,
          lots: [],
          account_id: null,
          mandatoryUnanswered: 5,
          toValidateCount: 4,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
        {
          id: 'rfp-3',
          title: 'AO sans échéance',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          mandatoryUnanswered: 0,
          toValidateCount: 3,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    renderPage()

    await screen.findByText('AO actif à échéance proche')
    const cards = within(await screen.findByTestId('rfp-summary-cards'))

    expect(cards.getByText('Actifs').nextSibling?.textContent).toBe('2')
    expect(cards.getByText('À J-7').nextSibling?.textContent).toBe('1')
    expect(cards.getByText('Exigences bloquantes').nextSibling?.textContent).toBe('2')
    expect(cards.getByText('Réponses à valider').nextSibling?.textContent).toBe('4')
    expect(cards.getByText('Soumis').nextSibling?.textContent).toBe('0')
    expect(cards.getByText('Profils manquants').nextSibling?.textContent).toBe('Non mesuré')
  })

  it('ne rend aucune carte tant que l’espace n’a aucun dossier', async () => {
    rfpList.mockResolvedValueOnce({ rfps: [] })
    renderPage()

    await screen.findByText(/Cette page est utile si tu traites régulièrement/)

    expect(screen.queryByText('Actifs')).not.toBeInTheDocument()
  })
})

/**
 * #2957 (#2179.34 / #2179.35 / #2179.2) — L'EMPTY STATE HONNÊTE ET LE MASQUAGE.
 * Texte exact de #2179 ; le bouton « Masquer » n'existe que pour qui peut
 * réellement écrire le réglage (owner/admin), et un espace masqué garde la
 * page atteignable avec « Réafficher ».
 */
describe('RfpPage — section masquable (#2179.34/.35)', () => {
  afterEach(() => {
    teamRole.current = 'owner'
    hiddenSections.current = []
    setSectionHidden.mockReset()
  })

  it('affiche le texte exact de l’empty state et propose de masquer à un admin', async () => {
    rfpList.mockResolvedValueOnce({ rfps: [] })
    renderPage()

    await screen.findByText(
      'Cette page est utile si tu traites régulièrement des dossiers structurés ou des référencements.',
    )
    screen.getByText('Tu peux importer un premier AO ou masquer cette section pour ton workspace.')
    await userEvent.click(screen.getByRole('button', { name: 'Masquer cette section' }))
    expect(setSectionHidden).toHaveBeenCalledWith({ current: [], section: 'rfp', hidden: true }, expect.anything())
  })

  it('ne propose pas le masquage à un membre sans droit d’administration', async () => {
    teamRole.current = 'sales'
    rfpList.mockResolvedValueOnce({ rfps: [] })
    renderPage()

    await screen.findByText(/Cette page est utile si tu traites régulièrement/)
    expect(screen.queryByRole('button', { name: 'Masquer cette section' })).not.toBeInTheDocument()
  })

  it('une section masquée reste atteignable et se réaffiche d’un clic', async () => {
    hiddenSections.current = ['rfp']
    rfpList.mockResolvedValueOnce({ rfps: [] })
    renderPage()

    await screen.findByText('Cette section est masquée pour ton espace.')
    await userEvent.click(screen.getByRole('button', { name: 'Réafficher la section' }))
    expect(setSectionHidden).toHaveBeenCalledWith(
      { current: ['rfp'], section: 'rfp', hidden: false },
      expect.anything(),
    )
  })
})

/**
 * #2957 (#2179.31) — « CRÉER DEPUIS UN BESOIN ». Le besoin choisi pré-remplit
 * l'intake avec SES champs (une absence ne fait aucune ligne), le parcours
 * d'import reste le même (Analyser → aperçu → Confirmer), et la confirmation
 * lie le dossier au besoin d'origine — ce qui ferme « Transformer en besoin ».
 */
describe('RfpPage — créer depuis un besoin (#2179.31)', () => {
  afterEach(() => {
    openNeedsRows.current = []
    rfpPreview.mockReset()
    rfpConfirm.mockReset()
  })

  const NEED = {
    id: '00000000-0000-4000-8000-0000000000aa',
    title: 'Architecte cloud',
    account_name: 'Acme',
    skills: [
      { term: 'AWS', required: true },
      { term: 'Terraform', required: true },
    ],
    seniority: 'Senior',
    headcount: 1,
    location: null,
    start_on: null,
    duration_months: 6,
  }

  it('pré-remplit l’intake depuis le besoin, puis confirme en le liant', async () => {
    openNeedsRows.current = [NEED]
    const draft = { title: 'Acme — Architecte cloud', requirements: [] }
    rfpPreview.mockResolvedValue({
      draft,
      indicators: {
        totalRequirements: 0,
        mandatoryRequirements: 0,
        dueAt: null,
        missingDocuments: null,
        contradictions: null,
        estimatedCost: null,
      },
      duplicateOf: null,
      failedDocuments: [],
    })
    rfpConfirm.mockResolvedValue({ rfp: { id: 'rfp-new', requirements: [] }, compliance: {} })
    renderPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Créer depuis un besoin' }))
    await chooseOption(screen.getByLabelText('Besoin d’origine'), 'Acme — Architecte cloud')

    expect(screen.getByPlaceholderText(/Intitulé du dossier/)).toHaveValue('Acme — Architecte cloud')
    const text = (screen.getByPlaceholderText(/Colle le texte de la consultation/) as HTMLTextAreaElement).value
    expect(text).toContain('Compétences : AWS, Terraform')
    expect(text).toContain('Séniorité : Senior')
    expect(text).toContain('Durée : 6 mois')
    // Une absence ne fait AUCUNE ligne (doctrine « on n'affiche pas ce qu'on n'a pas »).
    expect(text).not.toContain('Localisation')

    await user.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText("Aperçu de l'import")
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))

    await waitFor(() => expect(rfpConfirm).toHaveBeenCalledWith(draft, NEED.id, []))
  })

  it('un dossier déjà lié à un besoin ne propose plus « Transformer en besoin »', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        { id: 'rfp-1', title: 'AO lié', status: 'analysed', due_at: null, mandatoryUnanswered: 0, toValidateCount: 0 },
      ],
    })
    rfpGet.mockResolvedValueOnce(rfpDetail({ id: 'rfp-1', title: 'AO lié', need_id: NEED.id }))
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByText('AO lié'))

    await screen.findByText('Ce dossier est déjà lié à un besoin.')
    expect(screen.queryByText('Transformer en besoin')).not.toBeInTheDocument()
    // #2152.25 — et il offre de rattacher des profils, sur CE besoin.
    expect(screen.getByTestId('rfp-profiles')).toHaveTextContent(NEED.id)
  })
})

/**
 * #2957 (#2181.15 / #2181.16 / #2181.45) — COMMENTAIRES, VERSIONS, COMPARAISON
 * par exigence. Auteur/date viennent du serveur ; une réponse remplacée reste
 * lisible et se compare à la réponse actuelle.
 */
describe('RfpPage — commentaires et versions par exigence', () => {
  const REQ = '66666666-6666-4666-8666-666666666666'
  function detail(over: Record<string, unknown> = {}): RfpDetail {
    const base = rfpDetail()
    return {
      ...base,
      rfp: {
        ...base.rfp,
        requirements: [
          {
            id: REQ,
            rfp_id: RFP_ID,
            section: null,
            text: 'Hébergement des données en France.',
            weight: 'mandatory',
            kind: 'security',
            owner_role: 'sales',
            answer_status: 'drafted',
            answer_source: 'Politique sécurité 2026',
            answer_text: 'Nos serveurs sont à Paris et Roubaix.',
            risk: null,
            source_document: null,
            ...over,
          },
        ],
      },
    }
  }

  afterEach(() => {
    rfpAddComment.mockReset()
  })

  it('ajoute un commentaire sur une exigence', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          status: 'analysed',
          due_at: null,
          mandatoryUnanswered: 0,
          toValidateCount: 0,
        },
      ],
    })
    rfpGet.mockResolvedValue(
      detail({
        comments: [{ id: 'c-1', author_id: 'u-2', body: 'Vérifier le PRA', created_at: '2026-09-27T10:00:00.000Z' }],
      }),
    )
    rfpAddComment.mockResolvedValue(detail())
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))

    await user.click(await screen.findByRole('button', { name: 'Commentaires (1)' }))
    expect(screen.getByText('Vérifier le PRA')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nouveau commentaire'), 'OK pour moi')
    await user.click(screen.getByRole('button', { name: 'Commenter' }))

    await waitFor(() => expect(rfpAddComment).toHaveBeenCalledWith(RFP_ID, REQ, 'OK pour moi'))
  })

  it('montre la version précédente et la compare à la réponse actuelle', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          status: 'analysed',
          due_at: null,
          mandatoryUnanswered: 0,
          toValidateCount: 0,
        },
      ],
    })
    rfpGet.mockResolvedValue(
      detail({
        versions: [
          {
            answer_text: 'Nos serveurs sont en Europe.',
            answer_status: 'drafted',
            answer_source: null,
            replaced_at: '2026-09-27T10:00:00.000Z',
            replaced_by: null,
          },
        ],
      }),
    )
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))

    await user.click(await screen.findByRole('button', { name: 'Versions précédentes (1)' }))
    await user.click(screen.getByRole('button', { name: 'Comparer avec la réponse actuelle' }))

    const comparison = within(screen.getByTestId('rfp-version-compare'))
    expect(comparison.getByText('Nos serveurs sont en Europe.')).toBeInTheDocument()
    expect(comparison.getByText('Nos serveurs sont à Paris et Roubaix.')).toBeInTheDocument()
  })

  it('sans commentaire ni version, aucun des deux boutons ne compte un zéro fabriqué', async () => {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          status: 'analysed',
          due_at: null,
          mandatoryUnanswered: 0,
          toValidateCount: 0,
        },
      ],
    })
    rfpGet.mockResolvedValue(detail())
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))

    expect(await screen.findByRole('button', { name: 'Commenter l’exigence' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Versions précédentes/ })).not.toBeInTheDocument()
  })
})

/**
 * #2957 (#2179.37 / #2181.40 / #2181.46 / #2181.48) — lecture seule, section
 * attribuée d'un geste, export seulement quand le dossier peut partir, coût
 * annoncé avant l'analyse.
 */
describe('RfpPage — lecture seule, sections, export, coût', () => {
  const LIST = {
    rfps: [
      {
        id: RFP_ID,
        title: 'Refonte SI comptable',
        status: 'analysed',
        due_at: null,
        mandatoryUnanswered: 0,
        toValidateCount: 0,
      },
    ],
  }
  function req(id: string, section: string | null, over: Partial<RfpRequirement> = {}): RfpRequirement {
    return {
      id,
      rfp_id: RFP_ID,
      section,
      text: `Exigence ${id.slice(0, 4)}`,
      weight: 'mandatory',
      kind: 'security',
      owner_role: 'sales',
      answer_status: 'validated',
      answer_source: 'Politique 2026',
      answer_text: 'Réponse validée',
      risk: null,
      source_document: null,
      ...over,
    }
  }

  afterEach(() => {
    teamRole.current = 'owner'
    rfpAssignSection.mockReset()
  })

  it('#2179.37 — un lecteur voit les dossiers, sans geste d’écriture', async () => {
    teamRole.current = 'viewer'
    rfpList.mockResolvedValueOnce(LIST)
    rfpGet.mockResolvedValue(
      rfpDetail({
        decision: {
          verdict: 'bid',
          rationale: 'Bon fit.',
          fit: 70,
          capacity: null,
          conditions: [],
          questions: [],
          redFlags: [],
        },
      }),
    )
    renderPage()
    const user = userEvent.setup()

    await screen.findByText('Lecture seule : tu consultes les appels d’offres de ton espace sans pouvoir les modifier.')
    expect(screen.queryByRole('button', { name: 'Analyser' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))
    expect(await screen.findByRole('button', { name: 'On y va' })).toBeDisabled()
  })

  it('#2181.40 — attribue une section entière à un rôle', async () => {
    rfpList.mockResolvedValueOnce(LIST)
    const detail = rfpDetail({
      requirements: [
        req('a1111111-1111-4111-8111-111111111111', 'Sécurité'),
        req('b1111111-1111-4111-8111-111111111111', 'Sécurité'),
        req('c1111111-1111-4111-8111-111111111111', 'Technique'),
      ],
    })
    rfpGet.mockResolvedValue(detail)
    rfpAssignSection.mockResolvedValue(detail)
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))

    await chooseOption(await screen.findByLabelText('Attribuer la section « Sécurité » (2 exigences)'), 'legal')

    await waitFor(() => expect(rfpAssignSection).toHaveBeenCalledWith(RFP_ID, 'Sécurité', 'legal'))
  })

  it('#2181.46 — « Exporter » n’apparaît que quand le dossier peut partir, et télécharge la matrice', async () => {
    rfpList.mockResolvedValueOnce(LIST)
    rfpGet.mockResolvedValue({
      ...rfpDetail({ requirements: [req('a1111111-1111-4111-8111-111111111111', 'Sécurité')] }),
      compliance: {
        total: 1,
        mandatory: 1,
        mandatoryUnanswered: 0,
        ambiguous: 0,
        pendingByOwner: {},
        unprovenCommitments: [],
        exportReady: true,
      },
    })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))

    await user.click(await screen.findByRole('button', { name: 'Exporter la matrice (CSV)' }))
    expect(downloadCsvMock).toHaveBeenCalledTimes(1)
    const [csv, filename] = downloadCsvMock.mock.calls[0] as [string, string]
    expect(filename).toBe('Refonte SI comptable.csv')
    expect(csv).toContain('Réponse validée')
  })

  it('#2181.46 — sait dire NON : pas d’export tant qu’une obligatoire n’est pas validée', async () => {
    rfpList.mockResolvedValueOnce(LIST)
    rfpGet.mockResolvedValue(rfpDetail())
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))

    await screen.findByText(/Le dossier ne peut pas partir en l'état/)
    expect(screen.queryByRole('button', { name: 'Exporter la matrice (CSV)' })).not.toBeInTheDocument()
  })

  it('#2181.48 / #4463 — plus de ligne de coût avant l’analyse : aucun crédit à l’écran', async () => {
    rfpList.mockResolvedValueOnce({ rfps: [] })
    const { container } = renderPage()
    await waitFor(() => expect(rfpList).toHaveBeenCalled())
    // Défaut attrapé : la ligne appelait encore `t('intake.cost')` après le retrait de la clé, et
    // affichait la clé brute à l'écran.
    expect(container).not.toHaveTextContent(/crédit|intake\.cost/i)
  })
})

// #2957 (#2180.53) — un import qui SURVIT à une interruption.
describe('#2180.53 — import interrompable et reprenable', () => {
  afterEach(() => {
    rfpPreview.mockReset()
    rfpConfirm.mockReset()
    rfpImportSession.mockReset()
    rfpImportSession.mockResolvedValue({ session: null })
    rfpSaveImportSession.mockClear()
    rfpCancelImportSession.mockClear()
  })

  const session = {
    id: 'session-1',
    status: 'in_progress',
    title: 'AO socle de données',
    pastedText: null,
    documentNames: ['CCTP.pdf', 'BPU.xlsx'],
    updatedAt: '2026-09-30T18:00:00.000Z',
    preview: {
      draft: {
        account_id: null,
        title: 'AO socle de données',
        issuer: null,
        source_format: 'pdf',
        due_at: null,
        lots: [],
        source_text: null,
        decision: null,
        requirements: [],
        document_hash: 'b'.repeat(64),
        document_extraction: null,
      },
      indicators: {
        totalRequirements: 7,
        mandatoryRequirements: 4,
        dueAt: null,
        missingDocuments: null,
        contradictions: null,
        estimatedCost: null,
      },
      duplicateOf: null,
      failedDocuments: [],
    },
  }

  it('propose de reprendre l’import en cours, avec son titre et le nombre de documents', async () => {
    rfpImportSession.mockResolvedValue({ session })
    renderPage()
    expect(await screen.findByText(/AO socle de données/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reprendre l’import' })).toBeInTheDocument()
  })

  it('aucune session → aucune bannière (une absence ne fait aucune ligne)', async () => {
    renderPage()
    await screen.findByPlaceholderText(/Intitulé du dossier/)
    expect(screen.queryByRole('button', { name: 'Reprendre l’import' })).not.toBeInTheDocument()
  })

  it('« Reprendre » rouvre l’aperçu déjà rendu, sans rappeler l’analyse', async () => {
    rfpImportSession.mockResolvedValue({ session })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Reprendre l’import' }))
    expect(await screen.findByText("Aperçu de l'import")).toBeInTheDocument()
    expect(rfpPreview).not.toHaveBeenCalled()
    // Les noms des documents reviennent, et on dit qu’ils sont à redéposer.
    expect(screen.getByText('CCTP.pdf')).toBeInTheDocument()
    expect(screen.getByText(/à redéposer/i)).toBeInTheDocument()
  })

  it('« Abandonner » archive la session côté serveur et retire la bannière', async () => {
    rfpImportSession.mockResolvedValue({ session })
    // Le serveur archive la session : la lecture suivante ne la rend plus.
    rfpCancelImportSession.mockImplementationOnce(async () => {
      rfpImportSession.mockResolvedValue({ session: null })
      return { cancelled: true }
    })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Abandonner l’import' }))
    await waitFor(() => expect(rfpCancelImportSession).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reprendre l’import' })).not.toBeInTheDocument())
  })

  it('une analyse réussie est GARDÉE côté serveur (titre, texte collé, noms, aperçu)', async () => {
    rfpPreview.mockResolvedValue(session.preview)
    renderPage()
    const user = userEvent.setup()
    await user.type(await screen.findByPlaceholderText(/Intitulé du dossier/), 'AO socle de données')
    await user.type(screen.getByPlaceholderText(/Colle le texte de la consultation/), 'contenu collé')
    await user.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText("Aperçu de l'import")
    await waitFor(() =>
      expect(rfpSaveImportSession).toHaveBeenCalledWith({
        title: 'AO socle de données',
        pastedText: 'contenu collé',
        documentNames: [],
        preview: session.preview,
      }),
    )
  })

  it('#2957 — la session est GARDÉE dès « Analyser », avant le retour de l’analyse (rechargement pendant le spinner)', async () => {
    // L'analyse ne rend jamais : l'onglet est rechargé pendant le spinner.
    rfpPreview.mockReturnValue(new Promise(() => undefined))
    renderPage()
    const user = userEvent.setup()
    await user.type(await screen.findByPlaceholderText(/Intitulé du dossier/), 'AO socle de données')
    await user.type(screen.getByPlaceholderText(/Colle le texte de la consultation/), 'contenu collé')
    await user.click(screen.getByRole('button', { name: 'Analyser' }))
    await waitFor(() =>
      expect(rfpSaveImportSession).toHaveBeenCalledWith({
        title: 'AO socle de données',
        pastedText: 'contenu collé',
        documentNames: [],
        preview: null,
      }),
    )
  })

  it('#2957 — une session sans aperçu (analyse interrompue) se reprend : texte rendu et analyse relancée', async () => {
    rfpImportSession.mockResolvedValue({
      session: { ...session, pastedText: 'contenu collé', documentNames: [], preview: null },
    })
    rfpPreview.mockResolvedValue(session.preview)
    renderPage()
    const user = userEvent.setup()
    expect(await screen.findByText(/analyse interrompue/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reprendre l’import' }))
    expect(await screen.findByText("Aperçu de l'import")).toBeInTheDocument()
    expect(rfpPreview).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'AO socle de données', text: 'contenu collé' }),
    )
  })

  it('#2957 — une session sans aperçu ET sans texte nomme les fichiers à redéposer', async () => {
    rfpImportSession.mockResolvedValue({
      session: { ...session, pastedText: null, documentNames: ['CCTP.pdf'], preview: null },
    })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Reprendre l’import' }))
    expect(rfpPreview).not.toHaveBeenCalled()
    expect(await screen.findByDisplayValue('AO socle de données')).toBeInTheDocument()
    expect(screen.getAllByText(/CCTP\.pdf/).length).toBeGreaterThan(0)
    expect(screen.getByText(/à redéposer/i)).toBeInTheDocument()
  })

  it('« Annuler l’import » archive aussi la session — sinon la bannière reviendrait', async () => {
    rfpPreview.mockResolvedValue(session.preview)
    renderPage()
    const user = userEvent.setup()
    await user.type(await screen.findByPlaceholderText(/Intitulé du dossier/), 'AO')
    await user.type(screen.getByPlaceholderText(/Colle le texte de la consultation/), 'contenu')
    await user.click(screen.getByRole('button', { name: 'Analyser' }))
    await screen.findByText("Aperçu de l'import")
    await user.click(screen.getByRole('button', { name: "Annuler l'import" }))
    await waitFor(() => expect(rfpCancelImportSession).toHaveBeenCalled())
  })
})

/**
 * #2152.27 — « VALIDER AVANT GÉNÉRATION ». Le bouton « Rédiger » appelait la
 * rédaction tout de suite, avec une liste de sources VIDE (`draft(…, [])`) :
 * rien n'était validé, et la preuve déjà rattachée à l'exigence n'était même
 * pas transmise. Le clic ouvre maintenant l'étape de validation : l'humain
 * coche ce que Laura a le droit de citer, puis lance la génération.
 *
 * ⚠️ Sait dire NON : un « Rédiger » qui génère au clic appelle `draft` avant
 * toute validation, et un écran qui ignore la coche envoie `[]`.
 */
describe('#2152.27 — valider les sources avant de générer une réponse', () => {
  const EVIDENCE = 'PRA testé deux fois par an — rapport d’audit 2025.'
  function detailWithEvidence(): RfpDetail {
    const base = rfpDetail()
    return {
      ...base,
      rfp: {
        ...base.rfp,
        requirements: [
          {
            id: REQUIREMENT_ID,
            rfp_id: RFP_ID,
            section: null,
            text: 'Le prestataire doit garantir un PRA sous 4h.',
            weight: 'mandatory',
            kind: 'technical',
            owner_role: 'sales',
            answer_status: 'to_produce',
            answer_source: null,
            answer_text: null,
            risk: null,
            source_document: null,
            evidence: EVIDENCE,
          },
        ],
      },
      compliance: { ...base.compliance, total: 1, mandatory: 1, mandatoryUnanswered: 1 },
    }
  }

  async function openRequirement() {
    rfpList.mockResolvedValueOnce({
      rfps: [
        {
          id: RFP_ID,
          title: 'Refonte SI comptable',
          issuer: null,
          status: 'analysed',
          due_at: null,
          lots: [],
          account_id: null,
          created_at: '2026-09-17T00:00:00.000Z',
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
    })
    rfpGet.mockResolvedValue(detailWithEvidence())
    rfpDraft.mockResolvedValue(detailWithEvidence())
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Refonte SI comptable/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Rédiger à partir des sources approuvées' }))
  }

  it('« Rédiger » ouvre la validation : rien n’est généré avant le geste humain', async () => {
    await openRequirement()
    expect(screen.getByRole('checkbox', { name: /Preuve rattachée/ })).not.toBeChecked()
    expect(rfpDraft).not.toHaveBeenCalled()
  })

  it('la génération reçoit EXACTEMENT les sources cochées', async () => {
    await openRequirement()
    await userEvent.click(screen.getByRole('checkbox', { name: /Preuve rattachée/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Générer avec les sources validées' }))
    await waitFor(() =>
      expect(rfpDraft).toHaveBeenCalledWith(RFP_ID, REQUIREMENT_ID, [{ title: 'Preuve rattachée', content: EVIDENCE }]),
    )
  })

  it('une source ajoutée à la main est transmise avec son titre', async () => {
    await openRequirement()
    await userEvent.type(screen.getByLabelText('Titre de la source'), 'Référence Banque X')
    await userEvent.type(screen.getByLabelText('Contenu de la source'), 'PRA déployé en 2024, RTO 2h.')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter cette source' }))
    await userEvent.click(screen.getByRole('button', { name: 'Générer avec les sources validées' }))
    await waitFor(() =>
      expect(rfpDraft).toHaveBeenCalledWith(RFP_ID, REQUIREMENT_ID, [
        { title: 'Référence Banque X', content: 'PRA déployé en 2024, RTO 2h.' },
      ]),
    )
  })
})
