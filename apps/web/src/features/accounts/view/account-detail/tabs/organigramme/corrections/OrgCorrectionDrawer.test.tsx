import { ORG_CORRECTION_MOTIVES, ORG_CORRECTION_SCOPES, orgGraphSchema } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ApiError, apiFetch } from '@/lib/api'
import { ENTITY_CORRECTION_FIELDS } from './orgCorrectionDraft'
import { OrgCorrectionDrawer } from './OrgCorrectionDrawer'
import { chooseOption, optionLabels, selectedValue } from '@/test/select'

const SOURCE = { id: 's-off', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

const GRAPH = orgGraphSchema.parse({
  graphVersion: 7,
  entities: [{ id: 'e-it', name: 'Direction des systèmes d’information', type: 'bu', parentId: null, confidence: 80 }],
  people: [
    {
      id: 'p-marie-martin',
      fullName: 'Marie Martin',
      title: 'Directrice des systèmes d’information',
      entityId: 'e-it',
      hierarchyLevel: 'L1',
      decisionRoles: ['economic_buyer'],
      identityStatus: 'actionable',
      confidence: 80,
      sources: [SOURCE],
    },
    {
      id: 'p-paul-durand',
      fullName: 'Paul Durand',
      title: 'Responsable infrastructure',
      entityId: 'e-it',
      hierarchyLevel: 'L3',
      decisionRoles: [],
      identityStatus: 'classified',
      confidence: 55,
      sources: [],
    },
  ],
  hierarchyEdges: [],
  influenceEdges: [],
})

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrgCorrectionDrawer
        accountId="acc-1"
        graph={GRAPH}
        objectType="person"
        objectId="p-marie-martin"
        objectName="Marie Martin"
      />
    </QueryClientProvider>,
  )
}

/** Ouvre le tiroir et remplit une correction de titre valide. */
async function fillTitleCorrection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('org-correction-open'))
  await user.type(screen.getByLabelText(i18n.t('accountOrg:correction.newLabel')), 'Directrice générale déléguée')
  await user.type(screen.getByLabelText(i18n.t('accountOrg:correction.reasonLabel')), 'Relevé sur la page Gouvernance.')
}

/**
 * LE GESTE, LE CONFLIT, ET CE QU'ILS PROMETTENT.
 *
 * Ces tests ne vérifient pas qu'un panneau existe : ils vérifient qu'un CLIC
 * atteint l'API avec le verrou, et qu'un 409 se voit à l'écran. C'est la
 * distinction qui a coûté sept gardes borgnes en trois jours — « le composant
 * est monté » n'a jamais prouvé que quoi que ce soit était appelé.
 */
describe('OrgCorrectionDrawer', () => {
  beforeEach(async () => {
    vi.mocked(apiFetch).mockReset()
    await i18n.changeLanguage('fr')
  })

  it('le corpus n’est pas vide — le graphe rendu porte des personnes', () => {
    expect(GRAPH.people.length).toBeGreaterThan(1)
    expect(GRAPH.graphVersion).toBe(7)
  })

  it('un clic atteint le ledger : PATCH, avec la version que l’écran a sous les yeux', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ graphVersion: 8, corrections: [], applied: true })
    renderDrawer()
    await fillTitleCorrection(user)
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') }))

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const call = vi.mocked(apiFetch).mock.calls[0]?.[0] as {
      path: string
      method: string
      body: { expectedGraphVersion: number; objectType: string; objectId: string; claims: { field: string }[] }
    }
    expect(call.path).toBe('/accounts/acc-1/org-graph/corrections')
    expect(call.method).toBe('PATCH')
    expect(call.body.expectedGraphVersion).toBe(7)
    expect(call.body.objectType).toBe('person')
    expect(call.body.objectId).toBe('p-marie-martin')
    expect(call.body.claims[0]?.field).toBe('title')
  })

  it('n’envoie RIEN sans raison écrite — une correction sans raison n’est pas une correction', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByTestId('org-correction-open'))
    await user.type(screen.getByLabelText(i18n.t('accountOrg:correction.newLabel')), 'Directrice générale déléguée')
    expect(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') })).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('ne pré-remplit PAS la nouvelle valeur — on propose, on ne décide pas à la place', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByTestId('org-correction-open'))
    // Champ LIBRE ici (la correction porte sur l'intitulé) : c'est une saisie,
    // pas un menu.
    expect(screen.getByLabelText(i18n.t('accountOrg:correction.newLabel'))).toHaveValue('')
    // …mais la valeur COURANTE est lisible, sinon on corrige à l'aveugle.
    expect(screen.getByText(/Directrice des systèmes d’information/)).toBeInTheDocument()
  })

  it('un 409 est RENDU avec son diff, et la saisie survit', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiError('conflit', 409, 'graph_version_mismatch', {
        error: 'graph_version_mismatch',
        yours: 7,
        current: 9,
        diffSummary: '1 correction depuis la version 7',
        intervening: [
          {
            objectType: 'person',
            objectId: 'p-marie-martin',
            field: 'title',
            by: 'Claire Dubois',
            at: '2026-08-29T09:00:00.000Z',
          },
        ],
      }),
    )
    renderDrawer()
    await fillTitleCorrection(user)
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') }))

    const notice = await screen.findByTestId('org-correction-conflict')
    expect(notice).toHaveTextContent(i18n.t('accountOrg:correction.conflict.title'))
    // Ce qui s'est intercalé, NOMMÉ — pas un « conflit » nu.
    expect(notice).toHaveTextContent('Claire Dubois')
    expect(notice).toHaveTextContent('Marie Martin')
    // Les deux versions, pour décider s'il faut réappliquer ou abandonner.
    expect(notice).toHaveTextContent('7')
    expect(notice).toHaveTextContent('9')
    // ⚠️ Le brouillon est INTACT : un verrou qui vide le formulaire est une
    // perte de saisie déguisée en message d'erreur.
    expect(screen.getByLabelText(i18n.t('accountOrg:correction.newLabel'))).toHaveValue('Directrice générale déléguée')
  })

  it('une correction sans effet le DIT — elle n’annonce pas une version qui n’a pas bougé', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ graphVersion: 7, corrections: [], applied: false })
    renderDrawer()
    await fillTitleCorrection(user)
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') }))
    expect(await screen.findByTestId('org-correction-unchanged')).toHaveTextContent(
      i18n.t('accountOrg:correction.unchanged'),
    )
  })

  it('corriger le responsable direct se choisit parmi les autres personnes du graphe', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByTestId('org-correction-open'))
    await chooseOption(screen.getByLabelText(i18n.t('accountOrg:correction.fieldLabel')), 'reportsTo')
    // Les personnes proposées se lisent dans la LISTE OUVERTE : un menu Radix
    // ne porte pas ses options dans son déclencheur, contrairement au
    // `<select>` natif où elles vivaient dans le même élément.
    const proposées = await optionLabels(screen.getByLabelText(i18n.t('accountOrg:correction.newLabel')))
    expect(proposées).toContain('Paul Durand')
    // Personne ne se rapporte à soi-même : l'écran ne le propose pas.
    expect(proposées).not.toContain('Marie Martin')
  })
})

type SentBody = {
  motive: string
  scope: string
  claims: { field: string; value: unknown }[]
}
const sentBody = () => (vi.mocked(apiFetch).mock.calls[0]?.[0] as { body: SentBody }).body

describe('#2126.25-.30 / .37-.44 — ce qu’on dit du fait, et pour qui', () => {
  beforeEach(async () => {
    vi.mocked(apiFetch).mockReset()
    await i18n.changeLanguage('fr')
  })

  it('propose les six gestes, chacun un vrai bouton qui se tabule — « Corriger » par défaut', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByTestId('org-correction-open'))
    for (const motive of ORG_CORRECTION_MOTIVES) {
      const button = screen.getByRole('button', { name: i18n.t(`accountOrg:correction.motives.${motive}`) })
      expect(button.tagName).toBe('BUTTON')
      expect(button).toHaveAttribute('aria-pressed', motive === 'corrected' ? 'true' : 'false')
    }
  })

  it('« Obsolète » ne demande aucune valeur et envoie `null` — le fait redevient inconnu', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ graphVersion: 8, corrections: [], applied: true })
    renderDrawer()
    await user.click(screen.getByTestId('org-correction-open'))
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.motives.obsolete') }))
    expect(screen.queryByLabelText(i18n.t('accountOrg:correction.newLabel'))).toBeNull()
    expect(screen.getByText(i18n.t('accountOrg:correction.motiveHints.obsolete'))).toBeInTheDocument()
    await user.type(screen.getByLabelText(i18n.t('accountOrg:correction.reasonLabel')), 'Partie en juin.')
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') }))
    expect(sentBody().motive).toBe('obsolete')
    expect(sentBody().claims[0]?.value).toBeNull()
  })

  it('« Confirmer » envoie la valeur que l’organigramme porte déjà, et le dépôt n’est pas « rien enregistré »', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ graphVersion: 7, corrections: [{ id: 'c-1' }], applied: false })
    renderDrawer()
    await user.click(screen.getByTestId('org-correction-open'))
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.motives.confirmed') }))
    await user.type(screen.getByLabelText(i18n.t('accountOrg:correction.reasonLabel')), 'Revu en rendez-vous.')
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') }))
    expect(sentBody()).toMatchObject({
      motive: 'confirmed',
      claims: [{ value: 'Directrice des systèmes d’information' }],
    })
    expect(screen.queryByTestId('org-correction-unchanged')).toBeNull()
  })

  it('« Moi seul » : la portée voyage, et l’écran dit qui la verra', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ graphVersion: 7, corrections: [{ id: 'c-1' }], applied: false })
    renderDrawer()
    await fillTitleCorrection(user)
    expect(screen.getByText(i18n.t('accountOrg:correction.visibility.workspace'))).toBeInTheDocument()
    await chooseOption(
      screen.getByLabelText(i18n.t('accountOrg:correction.scopeLabel')),
      i18n.t('accountOrg:correction.scopes.personal'),
    )
    expect(screen.getByText(i18n.t('accountOrg:correction.visibility.private'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') }))
    expect(sentBody().scope).toBe('personal')
  })

  it('#2126.43 — « Équipe / BU » n’est pas proposée tant qu’aucune source ne la porte', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByTestId('org-correction-open'))
    const labels = await optionLabels(screen.getByLabelText(i18n.t('accountOrg:correction.scopeLabel')))
    expect(labels).toEqual(ORG_CORRECTION_SCOPES.map(scope => i18n.t(`accountOrg:correction.scopes.${scope}`)))
    expect(labels.join(' ')).not.toMatch(/BU|équipe/i)
  })

  it('#2126.7 / .12 — un refus de droits NOMME « Permission insuffisante », sans chiffre, et garde la saisie', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockRejectedValue(new ApiError('forbidden', 403, 'forbidden'))
    renderDrawer()
    await fillTitleCorrection(user)
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') }))
    const notice = await screen.findByTestId('org-correction-forbidden')
    expect(notice).toHaveTextContent(i18n.t('accountOrg:correction.forbiddenTitle'))
    expect(notice.textContent).not.toMatch(/\b0\b/)
    expect(screen.getByLabelText(i18n.t('accountOrg:correction.newLabel'))).toHaveValue('Directrice générale déléguée')
  })
})

/**
 * #2310.54 — le tiroir sait porter une ENTITÉ, pas seulement une personne.
 */
describe('#2310.54 — OrgCorrectionDrawer, sur une entité', () => {
  function renderEntityDrawer() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <OrgCorrectionDrawer
          accountId="acc-1"
          graph={GRAPH}
          objectType="entity"
          objectId="e-it"
          objectName="Direction des systèmes d’information"
        />
      </QueryClientProvider>,
    )
  }

  beforeEach(async () => {
    vi.mocked(apiFetch).mockReset()
    await i18n.changeLanguage('fr')
  })

  it('s’ouvre sur les champs d’une entité — jamais ceux d’une personne', async () => {
    const user = userEvent.setup()
    renderEntityDrawer()
    await user.click(screen.getByTestId('org-correction-open'))
    expect(
      screen.getByText(i18n.t('accountOrg:correction.title', { name: 'Direction des systèmes d’information' })),
    ).toBeInTheDocument()
    const labels = await optionLabels(screen.getByLabelText(i18n.t('accountOrg:correction.fieldLabel')))
    expect(labels).toEqual([...ENTITY_CORRECTION_FIELDS].map(field => i18n.t(`accountOrg:correction.fields.${field}`)))
    expect(labels).not.toContain(i18n.t('accountOrg:correction.fields.title'))
  })

  it('envoie `objectType: "entity"` — plus jamais « person » écrit en dur', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ graphVersion: 8, corrections: [], applied: true })
    renderEntityDrawer()
    await user.click(screen.getByTestId('org-correction-open'))
    await user.type(screen.getByLabelText(i18n.t('accountOrg:correction.newLabel')), 'Direction des SI')
    await user.type(
      screen.getByLabelText(i18n.t('accountOrg:correction.reasonLabel')),
      'Nom relevé sur l’organigramme officiel.',
    )
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') }))

    const call = vi.mocked(apiFetch).mock.calls[0]?.[0] as {
      body: { objectType: string; objectId: string; claims: { field: string }[] }
    }
    expect(call.body.objectType).toBe('entity')
    expect(call.body.objectId).toBe('e-it')
    expect(call.body.claims[0]?.field).toBe('name')
  })
})
