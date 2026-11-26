import type { AccountNeedsRow, PipelineDetection } from '@bellum/contracts'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Refonte Théo — /mes-cibles, « Pistes détectées sur tes comptes » (maquette validée
 * `decouvrir/mes-cibles.html`) : UN tableau Piste · Compte · Origine · Ce qui manque · Action, les plus
 * complètes d'abord, des compteurs teintés au-dessus. Ce que ces tests savent dire NON : l'ordre des
 * colonnes, la piste complète en tête, le geste de chaque ligne, une famille vide qui ferait une puce,
 * un score en points, et les gestes repris de l'ancien bandeau des détections (#4016 L6).
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    hash,
  }: {
    children: ReactNode
    to: string
    params?: Record<string, string>
    hash?: string
  }) => (
    <a
      href={
        (params ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), to) : to) +
        (hash ? `#${hash}` : '')
      }
    >
      {children}
    </a>
  ),
}))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../portfolio/view/EmptyStateActions', () => ({
  DiscoverAction: () => <a href="/discover">Découvrir des comptes</a>,
  ImportNeedsAction: () => null,
}))
vi.mock('./CreateProjectDialog', () => ({
  CreateProjectDialog: ({ draft }: { draft: { label: string } }) => <div role="dialog">Brouillon : {draft.label}</div>,
}))

const needsRows = vi.fn()
const detectionsList = vi.fn()
const confirm = vi.fn()
const dismiss = vi.fn()
vi.mock('../portfolio/hooks/useAccountNeeds', () => ({ useAccountNeeds: () => needsRows() }))
vi.mock('../pipeline-detections/api', () => ({
  usePipelineDetections: () => detectionsList(),
  useConfirmPipelineDetection: () => ({ mutate: confirm, isPending: false }),
  useDismissPipelineDetection: () => ({ mutate: dismiss, isPending: false }),
}))

const { PistesBoard } = await import('./PistesBoard')

function row(over: Partial<AccountNeedsRow>): AccountNeedsRow {
  return {
    account_id: '00000000-0000-4000-8000-000000000001',
    company_name: 'Société Générale',
    sector: null,
    score: 8.4,
    updated_at: null,
    it_implications: null,
    pains: null,
    it_challenges: null,
    programs: null,
    signals: null,
    angles: null,
    ...over,
  } as AccountNeedsRow
}

function detection(over: Partial<PipelineDetection> = {}): PipelineDetection {
  return {
    id: 'd1',
    kind: 'interest_to_opportunity',
    status: 'detected',
    accountId: 'a1',
    accountName: 'SNCF',
    label: 'Renfort data sur la maintenance prédictive',
    sourceId: 's1',
    sourceCallId: null,
    projectId: null,
    consultantId: null,
    submissionId: null,
    createdObjectId: null,
    detectedAt: '2026-10-11T05:50:00.000Z',
    decidedAt: null,
    ...over,
  }
}

const READY = row({
  pains: [
    {
      pain: 'Supervision de la plateforme de paiement',
      business_impact: null,
      esn_offer: 'Run applicatif',
      urgency: 'high',
    },
  ],
})
const TO_QUALIFY = row({
  account_id: '00000000-0000-4000-8000-000000000002',
  company_name: 'Groupe BPCE',
  programs: [{ name: 'Poste ouvert — Solution Architect', budget: null, description: null }],
})

function renderBoard() {
  return render(<PistesBoard onOpenAccount={vi.fn()} />)
}

beforeEach(() => {
  confirm.mockReset()
  dismiss.mockReset()
  needsRows.mockReturnValue({ data: [TO_QUALIFY, READY], isLoading: false, isError: false })
  detectionsList.mockReturnValue({ data: { items: [], autoDetect: 'on' }, isLoading: false })
})

describe('Pistes — un tableau du composant commun, dans l’ordre de la maquette validée', () => {
  it('les colonnes : Piste · Compte · Origine · Ce qui manque · Action', () => {
    renderBoard()
    const headers = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map(cell => cell.textContent)
    expect(headers).toEqual(['Piste', 'Compte', 'Origine', 'Ce qui manque', 'Action'])
  })

  it('la piste complète d’abord, avec « Rien : prête » et « Créer l’affaire » ; l’autre se qualifie', () => {
    renderBoard()
    const [first, second] = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(first).toHaveTextContent('Supervision de la plateforme de paiement')
    expect(first).toHaveTextContent('Rien : prête')
    expect(within(first!).getByRole('button', { name: 'Créer l’affaire' })).toBeInTheDocument()
    expect(second).toHaveTextContent('Ton offre en face')
    expect(
      within(second!).getByRole('button', {
        name: 'Qualifier la piste « Poste ouvert — Solution Architect » chez Groupe BPCE',
      }),
    ).toBeInTheDocument()
  })

  it('« Créer l’affaire » ouvre un BROUILLON renseigné de la piste, jamais une création au clic', () => {
    renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’affaire' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Brouillon : Supervision de la plateforme de paiement')
  })

  it('aucun score en points dans la liste', () => {
    renderBoard()
    expect(screen.queryByText(/8[.,]4/)).not.toBeInTheDocument()
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument()
  })
})

describe('Pistes — les compteurs teintés filtrent, une famille vide ne fait aucune puce', () => {
  it('« Prêtes 1 » ne garde que la piste complète', () => {
    renderBoard()
    const counters = screen.getByRole('group', { name: 'Filtrer les pistes' })
    expect(within(counters).getByRole('button', { name: /Toutes.*2/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(counters).getByRole('button', { name: /Prêtes.*1/ }))
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
    expect(screen.queryByText('Poste ouvert — Solution Architect')).not.toBeInTheDocument()
  })

  // #4545 (25/10/2026) — la capture de production montrait « Prêtes 461 » = « Avec ton offre 461 » et « À qualifier
  // 2 247 » = « Sans offre rattachée 2 247 ». Le lot prévoyait de fusionner ces deux paires ; la lecture du code
  // montre que les ensembles DIFFÈRENT sur deux cas réels — donc on NE fusionne PAS, et ce test le prouve :
  //  · un besoin DÉDUIT (`implication`) rattaché à une offre : « Avec ton offre », mais pas « Prête » (il reste à
  //    confirmer) ;
  //  · une DÉTECTION à revoir : « À qualifier », mais ni « Avec ton offre » ni « Sans offre rattachée ».
  // La coïncidence 461 = 461 est celle d'un parc sans détection ni besoin déduit offert, pas une identité.
  it('NE FUSIONNE PAS : « Prêtes » ≠ « Avec ton offre » et « À qualifier » ≠ « Sans offre rattachée » dès qu’un cas les sépare', () => {
    const DEDUCED_WITH_OFFER = row({
      account_id: '00000000-0000-4000-8000-000000000003',
      company_name: 'Crédit Agricole',
      it_implications: 'Modernisation du socle de paiement',
      angles: [{ offer: 'Migration cloud' }] as AccountNeedsRow['angles'],
    })
    needsRows.mockReturnValue({ data: [TO_QUALIFY, READY, DEDUCED_WITH_OFFER], isLoading: false, isError: false })
    detectionsList.mockReturnValue({ data: { items: [detection()], autoDetect: 'on' }, isLoading: false })
    renderBoard()
    const counters = screen.getByRole('group', { name: 'Filtrer les pistes' })
    const countOf = (name: RegExp) => within(counters).getByRole('button', { name }).textContent?.match(/\d+/)?.[0]
    expect(countOf(/Prêtes/)).toBe('1') // READY seule
    expect(countOf(/Avec ton offre/)).toBe('2') // READY + le besoin déduit offert
    expect(countOf(/À qualifier/)).toBe('3') // TO_QUALIFY + le besoin déduit + la détection
    expect(countOf(/Sans offre rattachée/)).toBe('1') // TO_QUALIFY seule (la détection n'est ni l'un ni l'autre)
  })

  it('sans piste sans offre, la puce « Sans offre rattachée » n’existe pas', () => {
    needsRows.mockReturnValue({ data: [READY], isLoading: false, isError: false })
    renderBoard()
    expect(screen.queryByRole('button', { name: /Sans offre rattachée/ })).not.toBeInTheDocument()
  })

  it('la maturité (ex-onglets) vit sous « Plus de filtres » — repliée, jamais supprimée', () => {
    renderBoard()
    expect(screen.queryByRole('group', { name: 'Maturité du besoin' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Plus de filtres/ }))
    expect(screen.getByRole('group', { name: 'Maturité du besoin' })).toHaveTextContent('Besoins confirmés')
  })

  it('rien du tout : l’état vide NOMMÉ, avec sa porte vers Découvrir', () => {
    needsRows.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderBoard()
    expect(screen.getByText("Aucun besoin identifié pour l'instant")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Découvrir des comptes' })).toBeInTheDocument()
  })
})

describe('Pistes — les détections du pipe sont des lignes du tableau (#4016 L6)', () => {
  it('une ligne d’origine « Intérêt → affaire » ; Confirmer et Écarter envoient son identifiant', () => {
    detectionsList.mockReturnValue({ data: { items: [detection()], autoDetect: 'on' }, isLoading: false })
    renderBoard()
    const line = screen.getByText('Renfort data sur la maintenance prédictive').closest('tr')!
    expect(line).toHaveTextContent('Intérêt → affaire')
    expect(line).toHaveTextContent('À confirmer ou écarter')
    fireEvent.click(within(line).getByRole('button', { name: 'Ouvrir l’affaire' }))
    fireEvent.click(within(line).getByRole('button', { name: 'Écarter' }))
    expect(confirm).toHaveBeenCalledWith('d1')
    expect(dismiss).toHaveBeenCalledWith('d1')
  })

  it('#4016.L6.a — le lien vers l’appel source quand il existe, et aucun lien sinon', () => {
    detectionsList.mockReturnValue({
      data: {
        items: [detection({ sourceCallId: 'call-9' }), detection({ id: 'd2', label: 'Sans appel' })],
        autoDetect: 'on',
      },
      isLoading: false,
    })
    renderBoard()
    const links = screen.getAllByRole('link', { name: /appel/i })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/accounts/a1#activity-call-9')
  })
})
