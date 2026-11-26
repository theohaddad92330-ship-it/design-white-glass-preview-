import type { Mission } from '@bellum/contracts'
import type { MissionView } from '../api'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2408.54 — `SavedMissionViews` (pied de la barre) a SES tests dédiés
 * (`SavedMissionViews.test.tsx`) ; mocké ici comme dans `MissionsPage.test.tsx`
 * — ce fichier ne monte pas de `QueryClientProvider`/`SessionProvider`, les
 * trois hooks qu'il consomme sont donc hors sujet pour un fichier qui mesure
 * la PASTILLE de filtre de source.
 */
vi.mock('@/features/governance/api', () => ({
  useSavedViews: () => ({ data: [], isLoading: false, isError: false }),
  useCreateSavedView: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveSavedView: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => ({ known: true, allowed: true }),
}))
/**
 * #2408.64 / #2408.65 — `MissionCockpitKpiTiles` a SES tests dédiés
 * (`MissionCockpitKpiTiles.test.tsx`) ; le prévisionnel réel interroge un
 * VRAI `useQuery`, hors sujet pour ce fichier qui ne monte aucun
 * `QueryClientProvider` (même patron que `MissionsPage.test.tsx`).
 */
vi.mock('@/features/pilotage/api', () => ({
  useForecastHorizons: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/features/crm-counters/useCrmCounters', () => ({
  useCrmCounters: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'me' }, loading: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const missions = vi.fn()
const renewals = vi.fn()
const pipeline = vi.fn()
const search = vi.fn()
const navigate = vi.fn()
// L'entête (#1346) porte le prénom du profil ; le hook réel lit `useAuth`, qui
// réclame une session. Ce fichier mesure la PASTILLE de filtre, pas l'identité.
const firstName = vi.fn(() => '')

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => firstName() }))

// ⚠️ Le faux est PARTIEL : `filters.ts` importe `assigneeNames` (fonction pure)
// du même module pour compter les affectations par consultant
// (`consultantCounts`) — un faux exhaustif la ferait disparaître et l'écran
// plantait sur « No "assigneeNames" export is defined ».
vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  useMissions: (...args: unknown[]) => missions(...args),
  useRenewals: () => renewals(),
}))
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => pipeline() }))
// Le module de route est mocké — l'importer pour de vrai ferait une boucle
// (la route importe l'écran). Même patron que les tests du vivier.
vi.mock('@/routes/missions/index', () => ({ Route: { useSearch: () => search() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => navigate,
}))
vi.mock('./InvoiceReadinessPanel', () => ({ InvoiceReadinessPanel: () => null }))
vi.mock('./MissionDetailSheet', () => ({ MissionDetailSheet: () => null }))
vi.mock('./OdooSalesSection', () => ({ OdooSalesSection: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const { MissionsPage } = await import('./MissionsPage')

const ACCOUNT = '33333333-3333-4333-8333-333333333333'
const CONSULTANT = '44444444-4444-4444-8444-444444444444'

function mission(over: Partial<Mission> & { accountName?: string | null; assignees?: MissionView['assignees'] } = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: ACCOUNT,
    opportunity_id: null,
    label: 'Renfort plateforme',
    status: 'active' as Mission['status'],
    started_on: null,
    ends_on: null,
    daily_rate: null,
    daily_cost: null,
    contract_kind: 'regie' as Mission['contract_kind'],
    role_title: null,
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

/**
 * §4.4 — LE LIEN DE SOURCE MONTRE LA SOURCE.
 *
 * `missionsOfAccount(id)` construit `/missions?accountId=…`, et la moitié web
 * n'existait pas : ni `validateSearch` sur la route, ni lecture dans l'écran.
 * Le lien ouvrait donc la liste ENTIÈRE — pire qu'un lien absent, parce que
 * l'utilisateur croit avoir la réponse.
 *
 * Deux exigences, et la seconde compte autant que la première : l'écran filtre,
 * et il DIT qu'il filtre. Un écran filtré muet fait croire que l'espace n'a que
 * ces missions-là.
 */
describe('MissionsPage — le lien de source filtre, et le DIT', () => {
  beforeEach(() => {
    cleanup()
    missions.mockReset()
    renewals.mockReset()
    pipeline.mockReset()
    search.mockReset()
    navigate.mockReset()
    renewals.mockReturnValue({ data: [], isLoading: false })
    pipeline.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    search.mockReturnValue({})
    missions.mockReturnValue({
      data: { missions: [mission({ accountName: 'Groupe Verlaine' })] },
      isLoading: false,
      isError: false,
    })
  })

  it('passe `accountId` au SERVEUR — filtrer une page plafonnée côté client rendrait un sous-ensemble faux', () => {
    search.mockReturnValue({ accountId: ACCOUNT })
    render(<MissionsPage />)
    // `GET /delivery/missions` plafonne à 200 lignes sans pagination : trier ces
    // 200-là dans le navigateur donnerait « 3 missions » là où le compte en a 12.
    expect(missions).toHaveBeenCalledWith({ accountId: ACCOUNT, consultantId: undefined })
  })

  it('passe `consultantId` au serveur — l’autre lien de source du même contrat', () => {
    search.mockReturnValue({ consultantId: CONSULTANT })
    render(<MissionsPage />)
    expect(missions).toHaveBeenCalledWith({ accountId: undefined, consultantId: CONSULTANT })
  })

  it('DIT qu’il filtre, en nommant le compte quand la liste le porte', () => {
    search.mockReturnValue({ accountId: ACCOUNT })
    render(<MissionsPage />)
    expect(screen.getByText('Missions de Groupe Verlaine')).toBeInTheDocument()
    expect(screen.getByText(/ne montre pas toutes les missions/i)).toBeInTheDocument()
  })

  it('n’INVENTE pas de nom quand la liste filtrée est vide', () => {
    // Aucune ligne = aucun nom de compte lisible. Écrire celui d'ailleurs, ou un
    // identifiant brut, serait une donnée de remplissage.
    search.mockReturnValue({ accountId: ACCOUNT })
    missions.mockReturnValue({ data: { missions: [] }, isLoading: false, isError: false })
    render(<MissionsPage />)
    expect(screen.getByText('Missions d’un seul compte')).toBeInTheDocument()
    expect(screen.queryByText(ACCOUNT)).not.toBeInTheDocument()
  })

  it('un filtre qui ne ramène rien ne dit PAS « aucune mission » — et sa porte lève le filtre', async () => {
    // Le mensonge symétrique de celui qu'on répare : sous un filtre, « les
    // missions apparaissent ici dès qu'un projet est signé » enverrait réparer
    // un pipe qui n'a rien à voir, alors que l'espace en a peut-être vingt.
    search.mockReturnValue({ accountId: ACCOUNT })
    missions.mockReturnValue({ data: { missions: [] }, isLoading: false, isError: false })
    render(<MissionsPage />)
    expect(screen.getByText('Aucune mission sur ce périmètre')).toBeInTheDocument()
    expect(screen.queryByText(/projet signé/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Voir toutes les missions' }))
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('nomme le filtre consultant sans prétendre connaître son nom', () => {
    search.mockReturnValue({ consultantId: CONSULTANT })
    render(<MissionsPage />)
    expect(screen.getByText('Missions d’un seul consultant')).toBeInTheDocument()
  })

  it('refonte Théo — nomme la personne quand une ligne la porte, lue sur les affectations', () => {
    search.mockReturnValue({ consultantId: CONSULTANT })
    missions.mockReturnValue({
      data: {
        missions: [
          mission({
            assignees: [{ id: CONSULTANT, fullName: 'Inès Kaczmarek', photoUrl: null, loadPercent: null }],
          }),
        ],
      },
      isLoading: false,
      isError: false,
    })
    render(<MissionsPage />)
    expect(screen.getByTestId('missions-source-banner')).toHaveTextContent('Missions de Inès Kaczmarek')
  })

  it('la pastille se RETIRE — et c’est un bouton, donc tabulable et nommé', () => {
    search.mockReturnValue({ accountId: ACCOUNT })
    render(<MissionsPage />)
    const remove = screen.getByRole('button', { name: 'Retirer le filtre et voir toutes les missions' })
    expect(remove).toBeInTheDocument()
  })

  it('retirer la pastille EFFACE le paramètre de l’URL — jamais un <Navigate> (GA-27)', async () => {
    search.mockReturnValue({ accountId: ACCOUNT })
    render(<MissionsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le filtre et voir toutes les missions' }))
    expect(navigate).toHaveBeenCalledTimes(1)
    const [call] = navigate.mock.calls
    const patch = (call?.[0] as { search: (prev: Record<string, unknown>) => Record<string, unknown> }).search
    expect(patch({ accountId: ACCOUNT, consultantId: CONSULTANT })).toEqual({
      accountId: undefined,
      consultantId: undefined,
    })
  })

  it('AUCUNE pastille sans filtre — un écran non filtré ne s’annonce pas filtré', () => {
    search.mockReturnValue({})
    render(<MissionsPage />)
    expect(screen.queryByText(/ne montre pas toutes les missions/i)).not.toBeInTheDocument()
    expect(missions).toHaveBeenCalledWith({ accountId: undefined, consultantId: undefined })
  })

  it('un paramètre ABÎMÉ n’annonce rien — le filtre n’a pas pris, l’écran ne le prétend pas', () => {
    // `validateSearch` retombe sur `undefined` : un lien collé de travers ouvre
    // la liste entière plutôt qu'une page en erreur, et surtout SANS pastille —
    // c'est la pastille qui affirme un périmètre.
    search.mockReturnValue({})
    render(<MissionsPage />)
    expect(screen.queryByRole('button', { name: /Retirer le filtre/ })).not.toBeInTheDocument()
  })
})
