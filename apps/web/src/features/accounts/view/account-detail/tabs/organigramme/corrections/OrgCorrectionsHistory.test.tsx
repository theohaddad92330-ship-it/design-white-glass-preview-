import { orgGraphSchema, type OrgGraphCorrection } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { OrgCorrectionsHistory } from './OrgCorrectionsHistory'

const GRAPH = orgGraphSchema.parse({
  graphVersion: 4,
  entities: [{ id: 'e-it', name: 'Direction des systèmes d’information', type: 'bu', parentId: null, confidence: 80 }],
  people: [
    {
      id: 'p-pierre-palmieri',
      fullName: 'Pierre Palmieri',
      title: 'Directeur général délégué',
      entityId: 'e-it',
      hierarchyLevel: 'L1',
      decisionRoles: [],
      identityStatus: 'actionable',
      confidence: 80,
      sources: [],
    },
  ],
  hierarchyEdges: [],
  influenceEdges: [],
})

const entry = (over: Partial<OrgGraphCorrection>): OrgGraphCorrection => ({
  id: 'c-1',
  workspaceId: 'w-1',
  accountId: 'acc-1',
  graphVersionBefore: 1,
  graphVersionAfter: 2,
  objectType: 'person',
  objectId: 'p-pierre-palmieri',
  field: 'title',
  oldValue: 'Directeur général adjoint',
  newValue: 'Directeur général délégué',
  reason: 'Titre exact relevé sur la page « Gouvernance » du site du groupe.',
  evidence: { kind: 'official_site', ref: 'societegenerale.com', claim: 'title' },
  userId: 'u-1',
  createdAt: '2026-08-21T10:00:00.000Z',
  revertedAt: null,
  motive: 'corrected',
  scope: 'account',
  visibility: 'workspace',
  ...over,
})

function renderHistory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrgCorrectionsHistory accountId="acc-1" graph={GRAPH} />
    </QueryClientProvider>,
  )
}

/**
 * « QUI A CHANGÉ ÇA ? » — la lecture du ledger.
 *
 * Le test qui compte n'est pas « la carte s'affiche » : c'est que la carte
 * APPELLE `GET …/corrections`, et qu'un échec de lecture ne se déguise pas en
 * « aucune correction ». Les deux se ressemblent à l'écran et ne veulent pas du
 * tout dire la même chose.
 */
describe('OrgCorrectionsHistory', () => {
  beforeEach(async () => {
    vi.mocked(apiFetch).mockReset()
    await i18n.changeLanguage('fr')
  })

  it('le corpus n’est pas vide — une ligne de ledger complète est rendue', () => {
    expect(entry({}).field).toBe('title')
    expect(GRAPH.people).toHaveLength(1)
  })

  it('lit l’historique du dossier et raconte chaque correction', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [entry({})] })
    renderHistory()

    expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/accounts/acc-1/org-graph/corrections' }))
    // Le sujet est NOMMÉ, jamais l'identifiant technique du graphe.
    expect(await screen.findByText(/Pierre Palmieri/)).toBeInTheDocument()
    expect(screen.getByText(/Directeur général adjoint/)).toBeInTheDocument()
    expect(screen.getByText(/Titre exact relevé/)).toBeInTheDocument()
  })

  it('une correction ANNULÉE reste lisible, avec sa pierre tombale et sans bouton d’annulation', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      items: [entry({ id: 'c-2', revertedAt: '2026-08-25T10:00:00.000Z' })],
    })
    renderHistory()
    expect(await screen.findByText(i18n.t('accountOrg:correction.history.reverted'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: i18n.t('accountOrg:correction.history.revert') }),
    ).not.toBeInTheDocument()
  })

  it('annuler passe par le MÊME verrou : POST …/revert avec la version courante', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ items: [entry({})] })
    renderHistory()
    await screen.findByText(/Pierre Palmieri/)

    vi.mocked(apiFetch).mockResolvedValue({ graphVersion: 5, corrections: [], applied: true })
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.history.revert') }))

    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/accounts/acc-1/org-graph/corrections/c-1/revert',
        method: 'POST',
        body: { expectedGraphVersion: 4 },
      }),
    )
  })

  it('un échec de lecture le DIT — ce n’est pas « aucune correction »', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('502'))
    renderHistory()
    expect(await screen.findByTestId('org-corrections-history-error')).toHaveTextContent(
      i18n.t('accountOrg:correction.history.loadError'),
    )
    expect(screen.queryByText(i18n.t('accountOrg:correction.history.empty'))).not.toBeInTheDocument()
  })

  it('un dossier réellement jamais corrigé le dit, distinctement', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [] })
    renderHistory()
    expect(await screen.findByText(i18n.t('accountOrg:correction.history.empty'))).toBeInTheDocument()
    expect(screen.queryByTestId('org-corrections-history-error')).not.toBeInTheDocument()
  })

  it('une valeur absente s’écrit « non renseigné », jamais « 0 » ni la chaîne vide', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [entry({ id: 'c-3', oldValue: null })] })
    renderHistory()
    const line = await screen.findByText(/Pierre Palmieri/)
    expect(line).toHaveTextContent(i18n.t('accountOrg:correction.currentUnknown'))
    expect(line).not.toHaveTextContent(/: 0 →/)
  })
})

describe('#2126.10 / .39 — ce que l’historique dit d’un motif et d’une portée', () => {
  beforeEach(async () => {
    vi.mocked(apiFetch).mockReset()
    await i18n.changeLanguage('fr')
  })

  it('#2126.10 — un fait déclaré obsolète le DIT, avec sa date et la valeur qu’il avait', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      items: [entry({ motive: 'obsolete', newValue: null, scope: 'account', visibility: 'workspace' })],
    })
    renderHistory()
    const when = new Date('2026-08-21T10:00:00.000Z').toLocaleDateString('fr')
    expect(
      await screen.findByText(
        i18n.t('accountOrg:correction.history.obsoleteSince', {
          date: when,
          field: i18n.t('accountOrg:correction.fields.title'),
          subject: 'Pierre Palmieri',
          value: 'Directeur général adjoint',
        }),
      ),
    ).toBeInTheDocument()
  })

  it('#2126.39 — une correction privée porte son badge ; une correction d’espace, non', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      items: [
        entry({ id: 'c-1', scope: 'personal', visibility: 'private', graphVersionAfter: 1 }),
        entry({ id: 'c-2', motive: 'confirmed', oldValue: 'Directeur général délégué' }),
      ],
    })
    renderHistory()
    expect(await screen.findAllByText(i18n.t('accountOrg:correction.history.private'))).toHaveLength(1)
    expect(
      screen.getByText(
        i18n.t('accountOrg:correction.history.motiveLine', {
          motive: i18n.t('accountOrg:correction.motives.confirmed'),
          field: i18n.t('accountOrg:correction.fields.title'),
          subject: 'Pierre Palmieri',
          value: 'Directeur général délégué',
        }),
      ),
    ).toBeInTheDocument()
  })
})
