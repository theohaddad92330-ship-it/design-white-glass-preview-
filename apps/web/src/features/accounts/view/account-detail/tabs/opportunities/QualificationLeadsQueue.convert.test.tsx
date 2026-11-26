import { LEAD_CONVERSION_FIELDS, leadConversionSchema, type ProjectReadRow } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { chooseOption, getSelect, optionLabels } from '@/test/select'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { QualificationLeadsQueue } from './QualificationLeadsQueue'

/**
 * #2172.36 → .40 / .53 — CE QUE L'ÉCRAN DEMANDE, L'API LE REÇOIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, ET CE QU'IL N'ÉTAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le formulaire de conversion ne demandait QUE l'étape, parce que
 * `PATCH /projects/:id/stage` était le seul endpoint qui recevait quoi que ce
 * soit. Rien n'était jeté — l'écran le disait, et différait le reste à la fiche
 * — mais quatre des cinq champs du contrat n'avaient nulle part où aller.
 *
 * Cette garde tient les DEUX bouts à la fois : le corps envoyé porte
 * exactement les clés de `LEAD_CONVERSION_FIELDS` (ni une de moins, ce serait
 * une saisie perdue ; ni une de plus, ce serait une ressaisie qui revient), et
 * il passe `leadConversionSchema` — le MÊME schéma que le DTO de l'API.
 */

const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}))

vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [
      { userId: '11111111-1111-4111-8111-111111111111', email: 'maelle@esn.fr', fullName: 'Maëlle Roy', isSelf: true },
      { userId: '22222222-2222-4222-8222-222222222222', email: 'sam@esn.fr', fullName: 'Sam Diallo', isSelf: false },
    ],
  }),
}))

const row = (over: Partial<ProjectReadRow>): ProjectReadRow =>
  ({
    account_id: 'acc-1',
    company_name: 'Transports Aurignac',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'signal',
    label: 'Ouverture d’un second entrepôt automatisé',
    detail: null,
    offer: null,
    source: 'Communiqué de presse',
    confidence: null,
    urgency: null,
    stage: 'detected',
    stage_entered_at: '2026-09-03T00:00:00.000Z',
    next_action: null,
    owner_id: null,
    objective: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-03T00:00:00.000Z',
    id: 'lead-1',
    ...over,
  }) as ProjectReadRow

function render() {
  mockFetch.mockImplementation((args?: { path?: string }) => {
    const path = typeof args?.path === 'string' ? args.path : ''
    if (path.includes('qualification-leads')) return Promise.resolve([])
    if (path.startsWith('/projects')) return Promise.resolve([row({})])
    return Promise.resolve({})
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderWithRouter(
    <QueryClientProvider client={client}>
      <QualificationLeadsQueue accountId="acc-1" contactCount={0} onOpenTab={() => {}} />
    </QueryClientProvider>,
  )
}

/** Ouvre le formulaire de conversion de la seule piste rendue. */
async function openConvertForm(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Projets possibles, à confirmer')
  await user.click(await screen.findByRole('button', { name: 'Autres options' }))
  await user.click(await screen.findByRole('button', { name: 'Travailler dans le pipe' }))
  return screen.findByText('Convertir en opportunité')
}

/** L'appel de conversion, isolé des lectures que l'écran fait par ailleurs. */
function conversionCall(): { path?: string; method?: string; body?: Record<string, unknown> } | undefined {
  return mockFetch.mock.calls
    .map(call => call[0] as { path?: string; method?: string; body?: Record<string, unknown> })
    .find(args => typeof args?.path === 'string' && args.path.endsWith('/convert'))
}

beforeEach(() => mockFetch.mockReset())

describe('#2172.36 → .40 — la conversion d’une piste', () => {
  it('demande les CINQ champs du contrat, et rien de plus', async () => {
    const user = userEvent.setup()
    render()
    await openConvertForm(user)

    // Un libellé par champ : ce que le contrat fige se voit à l'écran.
    expect(getSelect('Étape de départ')).toBeInTheDocument()
    expect(getSelect('Responsable')).toBeInTheDocument()
    expect(screen.getByLabelText('Objectif')).toBeInTheDocument()
    expect(screen.getByLabelText('Prochaine action')).toBeInTheDocument()
    expect(screen.getByLabelText('Échéance')).toBeInTheDocument()
    expect(screen.getByLabelText('Besoin éventuel')).toBeInTheDocument()
  })

  it('envoie EXACTEMENT les clés du contrat, et un corps que le schéma de l’API accepte', async () => {
    const user = userEvent.setup()
    render()
    await openConvertForm(user)

    await chooseOption(getSelect('Responsable'), '22222222-2222-4222-8222-222222222222')
    await user.type(screen.getByLabelText('Objectif'), 'Décrocher 3 rendez-vous avec la DSI')
    await user.type(screen.getByLabelText('Prochaine action'), 'Appeler la DSI mardi')
    await user.type(screen.getByLabelText('Échéance'), '2026-09-22')
    await user.type(screen.getByLabelText('Besoin éventuel'), 'Deux développeurs Java confirmés')
    await user.click(screen.getByRole('button', { name: 'Convertir' }))

    await waitFor(() => expect(conversionCall()).toBeDefined())
    const call = conversionCall()!
    expect(call.path).toBe('/projects/lead-1/convert')
    expect(call.method).toBe('POST')
    // Ni une clé de moins (une saisie perdue), ni une de plus (une ressaisie).
    expect(Object.keys(call.body ?? {}).sort()).toEqual([...LEAD_CONVERSION_FIELDS].sort())
    // Et c'est le MÊME schéma que le DTO de l'API : ce que l'écran demande, elle
    // le reçoit.
    expect(leadConversionSchema.safeParse(call.body).success).toBe(true)
    expect(call.body).toMatchObject({
      owner_id: '22222222-2222-4222-8222-222222222222',
      objective: 'Décrocher 3 rendez-vous avec la DSI',
      initial_stage: 'qualified',
      next_action: { title: 'Appeler la DSI mardi', due_on: '2026-09-22' },
      need: 'Deux développeurs Java confirmés',
    })
  })

  it('un besoin laissé vide part en `null` — jamais en chaîne vide', async () => {
    const user = userEvent.setup()
    render()
    await openConvertForm(user)

    await chooseOption(getSelect('Responsable'), '22222222-2222-4222-8222-222222222222')
    await user.type(screen.getByLabelText('Objectif'), 'Décrocher 3 rendez-vous avec la DSI')
    await user.type(screen.getByLabelText('Prochaine action'), 'Appeler la DSI mardi')
    await user.type(screen.getByLabelText('Échéance'), '2026-09-22')
    await user.click(screen.getByRole('button', { name: 'Convertir' }))

    await waitFor(() => expect(conversionCall()).toBeDefined())
    expect(conversionCall()!.body?.need).toBeNull()
  })

  it('n’envoie RIEN tant qu’un champ requis manque — pas de 400 à la place d’un défaut', async () => {
    const user = userEvent.setup()
    render()
    await openConvertForm(user)

    await user.type(screen.getByLabelText('Objectif'), 'Décrocher 3 rendez-vous avec la DSI')
    expect(screen.getByRole('button', { name: 'Convertir' })).toBeDisabled()
    expect(conversionCall()).toBeUndefined()
  })

  // #2693 — « Étape de départ » rendait la clé i18n BRUTE (`stages.qualified`)
  // au lieu du libellé : `stages.<étape>` collisionne avec les buckets de la
  // file de qualification (`projects:stages.qualified` = un objet
  // {tab,label,help}, pas une chaîne), et `defaultValue` ne protège pas d'une
  // clé qui existe déjà sous un autre type. Le champ lit maintenant la MÊME
  // source que `PipelineSlaView` (`DEFAULT_STAGE_LABELS`), pas un doublon i18n.
  it('#2693 — « Étape de départ » propose des libellés, jamais une clé i18n brute', async () => {
    const user = userEvent.setup()
    render()
    await openConvertForm(user)

    const labels = await optionLabels(getSelect('Étape de départ'))
    // #4338.1 — « À qualifier » avant « Cadrage » (ordre seulement) ; libellés des cinq colonnes de Théo (c5, 22/10/2026).
    expect(labels).toEqual(['À qualifier', 'Cadrage', 'Profils présentés', 'Proposition', 'Gagnée'])
    expect(labels.some(label => label.startsWith('stages.'))).toBe(false)
  })
})
