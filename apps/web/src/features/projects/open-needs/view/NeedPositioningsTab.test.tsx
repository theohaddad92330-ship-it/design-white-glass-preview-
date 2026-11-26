import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow, Submission } from '@bellum/contracts'

/**
 * L'ONGLET POSITIONNEMENTS — les profils positionnés sur CE besoin, pas sur
 * l'affaire entière.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET PAS UN SIMPLE `<SubmissionsPanel projectId=…>`
 * ─────────────────────────────────────────────────────────────────────────────
 * `SubmissionsPanel` (features/submissions) ne connaît qu'un `projectId` — et
 * un projet porte souvent PLUSIEURS besoins (`ProjectNeedsPanel` existe pour
 * ça). Le monter tel quel sur la fiche d'un besoin précis montrerait les
 * profils positionnés sur les RÔLES VOISINS du même projet, sous l'onglet d'un
 * seul d'entre eux — une donnée réelle, au mauvais périmètre. `Submission`
 * porte un `needId` : ce fichier filtre dessus, ce que l'API ne fait pas encore
 * (`useSubmissions` n'accepte que `projectId`/`consultantId`), plutôt que
 * d'afficher une liste qui ment sur son sujet.
 *
 * `useSubmissions` est MOQUÉ, pas réimplémenté — même convention que
 * `SubmissionsPanel.test.tsx` : ce fichier garde le FILTRE et les trois états,
 * pas la lecture réseau, déjà gardée ailleurs.
 */

const submissions = vi.fn()
vi.mock('@/features/submissions/api', () => ({ useSubmissions: () => submissions() }))
// Refonte Théo — la correspondance en clair vient du verdict du besoin (même rapprochement).
const positionedInClear = vi.fn((): unknown[] => [])
vi.mock('../hooks/useNeedVerdict', () => ({ useNeedVerdict: () => ({ positionedInClear: positionedInClear() }) }))
// #2152.49 — même patron que `MatchDrawer.test.tsx` : le routeur réduit à ce
// que ce fichier mesure (un `href`), un `RouterProvider` complet coûterait un
// arbre entier hors sujet ici.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace('$' + key, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const { NeedPositioningsTab } = await import('./NeedPositioningsTab')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur données',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'matching',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: 'p-1',
    project_label: 'Portail transporteurs',
    project_stage: 'qualified',
    account_id: 'a-1',
    account_name: 'NOVA LOGISTIQUE',
    entity_id: null,
    entity_name: null,
    ...over,
  } as unknown as OpenNeedRow
}

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 's-1',
    projectId: 'p-1',
    projectLabel: 'Portail transporteurs',
    accountId: 'a-1',
    accountName: 'NOVA LOGISTIQUE',
    needId: 'n-1',
    needRole: 'Ingénieur données',
    consultantId: 'c-1',
    consultantName: 'Sophie M.',
    stage: 'submitted',
    // #2335.1 — champ requis par le contrat depuis l'ajout du sous-statut.
    substatus: null,
    stageEnteredAt: '2026-08-20T09:00:00.000Z',
    submittedAt: '2026-08-20T09:00:00.000Z',
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: 55_000,
    cvSnapshot: null,
    plannedDays: null,
    dailyCostCents: null,
    plannedMarginCents: null,
    ownerId: null,
    ownerName: null,
    recipientContactId: null,
    recipientContactName: null,
    channel: null,
    message: null,
    availability: null,
    conditions: null,
    consultantAgreement: null,
    consultantAgreementDate: null,
    nextActionLabel: null,
    nextActionDueAt: null,
    nextActionOwnerId: null,
    nextActionOwnerName: null,
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:00.000Z',
    ...over,
  }
}

function mount(row: OpenNeedRow) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NeedPositioningsTab need={row} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  submissions.mockReset()
  positionedInClear.mockReturnValue([])
})

const CLEAR = {
  correspondsSkills: ['SAP S/4HANA', 'Data'],
  correspondsAxes: ['availability'],
  partialAxes: [],
  lacksSkills: ['Migration'],
  lacksAxes: [],
  toConfirmSkills: [],
  toConfirmAxes: ['rate'],
}

describe('Théo C projects-besoin-fiche — « Les profils de ce besoin », un tableau', () => {
  function withOne(over: Partial<Submission> = {}) {
    submissions.mockReturnValue({
      data: { items: [submission({ id: 's-1', needId: 'n-1', ...over })], funnel: null },
      isLoading: false,
      isError: false,
    })
  }

  it('porte les colonnes de la maquette, dans l’ordre', () => {
    withOne()
    mount(need())
    expect(screen.getByRole('heading', { name: 'Les profils de ce besoin' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      'Consultant',
      'Correspondance',
      'Suivi',
      'Prochaine échéance',
      'Ouvrir',
    ])
  })

  it('écrit la correspondance EN CLAIR, jamais en points', () => {
    withOne({ consultantId: 'c-1' })
    positionedInClear.mockReturnValue([{ consultantId: 'c-1', inClear: CLEAR }])
    mount(need())
    const cell = screen.getByTestId('positioned-in-clear')
    expect(cell).toHaveTextContent(
      'Correspond : SAP S/4HANA, Data, Disponibilité · Manque : Migration · À confirmer : TJM',
    )
    expect(cell.textContent).not.toMatch(/\d+\s*\/\s*100|\bpts?\b/)
  })

  it('sans rapprochement lu pour ce profil, le dit — aucune correspondance devinée', () => {
    withOne({ consultantId: 'c-9' })
    mount(need())
    expect(screen.getByTestId('positioned-in-clear')).toHaveTextContent('Pas encore rapproché')
  })

  it('la disponibilité DÉCLARÉE au positionnement gagne ; sans elle, « à confirmer »', () => {
    withOne({ availability: 'Dès le 2 novembre' })
    const { unmount } = mount(need())
    expect(screen.getByText('Disponibilité déclarée : Dès le 2 novembre')).toBeInTheDocument()
    unmount()
    withOne({ availability: null })
    mount(need())
    expect(screen.getByText('Disponibilité à confirmer')).toBeInTheDocument()
  })

  it('la prochaine échéance est celle du positionnement ; absente, « À préciser »', () => {
    withOne({ nextActionLabel: 'Relancer', nextActionDueAt: '2026-10-24T00:00:00.000Z' })
    const { unmount } = mount(need())
    expect(screen.getByTestId('positioned-due')).toHaveTextContent('Relancer')
    unmount()
    withOne()
    mount(need())
    expect(screen.getByTestId('positioned-due')).toHaveTextContent('À préciser')
  })
})

describe('NeedPositioningsTab', () => {
  it('lit les positionnements du PROJET, filtre sur ce besoin', () => {
    submissions.mockReturnValue({
      data: {
        items: [
          submission({ id: 's-1', needId: 'n-1', consultantName: 'Sophie M.' }),
          submission({ id: 's-2', needId: 'n-2', consultantName: 'Autre rôle' }),
        ],
        funnel: { submitted: 2, acceptanceRate: null, medianDaysToFeedback: null, noFeedback: 0 },
      },
      isLoading: false,
      isError: false,
    })
    mount(need())
    // Le profil rattaché à CE besoin apparaît…
    expect(screen.getByText('Sophie M.')).toBeInTheDocument()
    // … celui d'un rôle voisin du même projet n'apparaît pas ici.
    expect(screen.queryByText('Autre rôle')).not.toBeInTheDocument()
  })

  it('lie chaque candidat positionné vers le marché inversé de SON profil (#2152.49)', () => {
    // Une fiche besoin ne connaît qu'un vivier, pas un consultant précis : le
    // lien porte donc l'id de CHAQUE candidat positionné, même patron que
    // `VivierTableRow` (Où placer {{name}} → `/consultants/$id/reverse-market`).
    submissions.mockReturnValue({
      data: {
        items: [submission({ id: 's-1', needId: 'n-1', consultantId: 'c-42', consultantName: 'Sophie M.' })],
        funnel: { submitted: 1, acceptanceRate: null, medianDaysToFeedback: null, noFeedback: 0 },
      },
      isLoading: false,
      isError: false,
    })
    mount(need())
    const link = screen.getByRole('link', { name: /Où placer Sophie M\./ })
    expect(link).toHaveAttribute('href', '/consultants/c-42/reverse-market')
  })

  it('ne rattache PAS un positionnement sans rôle précisé à ce besoin', () => {
    // `needId: null` = personne n'a précisé le rôle — le lui attribuer serait
    // une supposition, pas une lecture.
    submissions.mockReturnValue({
      data: { items: [submission({ id: 's-3', needId: null, consultantName: 'Rôle non précisé' })], funnel: null },
      isLoading: false,
      isError: false,
    })
    mount(need())
    expect(screen.queryByText('Rôle non précisé')).not.toBeInTheDocument()
  })

  it('dit qu’aucun profil n’est positionné sur CE besoin — jamais « aucun sur le projet »', () => {
    submissions.mockReturnValue({ data: { items: [], funnel: null }, isLoading: false, isError: false })
    mount(need())
    expect(screen.getByText(/Aucun profil positionné sur ce besoin/)).toBeInTheDocument()
  })

  it('nomme les positionnements qui existent ailleurs sur l’affaire', () => {
    submissions.mockReturnValue({
      data: { items: [submission({ id: 's-2', needId: 'n-2' })], funnel: null },
      isLoading: false,
      isError: false,
    })
    mount(need())
    expect(screen.getByText(/1 positionnement existe sur l’affaire « Portail transporteurs »/)).toBeInTheDocument()
  })

  it('distingue un échec de lecture d’un vide réel', () => {
    submissions.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    mount(need())
    expect(screen.getByText(/Les positionnements n’ont pas pu être chargés/)).toBeInTheDocument()
  })

  it('dit qu’il charge plutôt que d’afficher un vide', () => {
    submissions.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    mount(need())
    expect(screen.getByText(/Je regarde qui a été positionné/)).toBeInTheDocument()
  })
})
