import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeMissionStartReadiness } from '@bellum/contracts'
import type { AdvDossier } from '@bellum/contracts'

const advDossiers = vi.fn()
const readiness = vi.fn()
vi.mock('@/features/adv/api', () => ({
  useAdvDossiers: () => advDossiers(),
  useUpdateAdvDossier: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useAccountEntities: () => ({ data: { items: [] }, isError: false }),
}))
vi.mock('../api', () => ({
  useMissionStartReadiness: (_id: string, enabled: boolean) => (enabled ? readiness() : { data: undefined }),
  useMissionStartCheck: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { MissionStartBlockers } = await import('./MissionStartBlockers')

const ID = '11111111-1111-4111-8111-111111111111'
const dossier = (over: Partial<AdvDossier> = {}): AdvDossier => ({
  missionId: ID,
  missionLabel: 'Refonte SI',
  accountId: '22222222-2222-4222-8222-222222222222',
  accountName: 'Société Générale',
  kind: 'start',
  missionStatus: 'onboarding',
  state: 'incomplete',
  blockers: ['missing_client_reference', 'missing_po'],
  openedOn: null,
  startedOn: null,
  endsOn: null,
  clientBillingReference: null,
  paymentTermsDays: null,
  paymentDetailsTransmittedAt: null,
  clientEntityId: null,
  clientEntityName: null,
  ...over,
})
const ready = () =>
  computeMissionStartReadiness({
    declared: [],
    data: { consultantAssigned: true, startDate: '2026-10-01', dailyRate: 650 },
    now: new Date('2026-09-23T10:00:00Z'),
  })

beforeEach(() => {
  cleanup()
  advDossiers.mockReset()
  readiness.mockReset()
})

describe('MissionStartBlockers — Théo C missions-dossier (ADV fondue)', () => {
  it('une seule liste « Ce qui bloque le démarrage » : prérequis ET manques administratifs', () => {
    readiness.mockReturnValue({ data: ready() })
    advDossiers.mockReturnValue({ data: { items: [dossier()] } })
    render(<MissionStartBlockers missionId={ID} status="onboarding" label="Refonte SI" />)
    expect(screen.getAllByRole('heading', { name: 'Ce qui bloque le démarrage' })).toHaveLength(1)
    expect(screen.getByText('Accord du client')).toBeInTheDocument()
    expect(screen.getByText('Référence cliente manquante')).toBeInTheDocument()
    expect(screen.getByText('Bon de commande manquant')).toBeInTheDocument()
  })

  it('une référence se répare sur place, sans quitter le dossier', async () => {
    readiness.mockReturnValue({ data: ready() })
    advDossiers.mockReturnValue({ data: { items: [dossier()] } })
    render(<MissionStartBlockers missionId={ID} status="onboarding" label="Refonte SI" />)
    await userEvent.click(screen.getByRole('button', { name: /Réparer.*Référence cliente manquante/ }))
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
  })

  it('le dossier d’une AUTRE mission ne s’affiche pas', () => {
    readiness.mockReturnValue({ data: ready() })
    advDossiers.mockReturnValue({
      data: { items: [dossier({ missionId: '33333333-3333-4333-8333-333333333333' })] },
    })
    render(<MissionStartBlockers missionId={ID} status="onboarding" label="Refonte SI" />)
    expect(screen.queryByText('Référence cliente manquante')).toBeNull()
  })

  it('hors démarrage : un dossier complet ne rend rien', () => {
    readiness.mockReturnValue({ data: undefined })
    advDossiers.mockReturnValue({ data: { items: [dossier({ state: 'complete', blockers: [] })] } })
    const { container } = render(<MissionStartBlockers missionId={ID} status="active" label="Refonte SI" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('une mission en cours dont la reconduction est bloquée nomme le manque (rien ne se perd)', () => {
    readiness.mockReturnValue({ data: undefined })
    advDossiers.mockReturnValue({ data: { items: [dossier({ kind: 'renewal', missionStatus: 'active' })] } })
    render(<MissionStartBlockers missionId={ID} status="active" label="Refonte SI" />)
    expect(screen.getByRole('heading', { name: 'Ce qui bloque la reconduction' })).toBeInTheDocument()
    expect(screen.getByText('Bon de commande manquant')).toBeInTheDocument()
  })
})
