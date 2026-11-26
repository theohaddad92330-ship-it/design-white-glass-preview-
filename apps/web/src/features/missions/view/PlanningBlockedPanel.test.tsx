import type { AdvDossier, AdvSummary } from '@bellum/contracts'
import { ADV_BLOCKERS } from '@bellum/contracts'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dossiers = vi.fn()
vi.mock('@/features/adv/api', () => ({ useAdvDossiers: () => dossiers() }))
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
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const { PlanningBlockedPanel } = await import('./PlanningBlockedPanel')

function summary(over: Partial<AdvSummary> = {}): AdvSummary {
  return {
    month: '2026-10',
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
      count: blocker === 'kyc_not_validated' ? null : blocker === 'missing_po' ? 2 : 0,
    })),
    ...over,
  }
}

function dossier(over: Partial<AdvDossier> = {}): AdvDossier {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Renfort sécurité du programme de refonte',
    accountId: '22222222-2222-4222-8222-222222222222',
    accountName: 'SNCF',
    kind: 'start',
    missionStatus: 'ready_to_start',
    state: 'incomplete',
    blockers: ['missing_po', 'missing_billing_contact'],
    openedOn: '2026-10-10',
    startedOn: '2026-11-03',
    endsOn: null,
    clientBillingReference: null,
    paymentTermsDays: null,
    paymentDetailsTransmittedAt: null,
    clientEntityId: null,
    clientEntityName: null,
    ...over,
  }
}

const NOW = new Date('2026-10-22T09:00:00Z')

describe('PlanningBlockedPanel — le filtre « Bloquées » (Théo C missions-planning.HT1)', () => {
  beforeEach(() => {
    dossiers.mockReturnValue({
      data: {
        month: '2026-10',
        summary: summary(),
        items: [
          dossier(),
          dossier({
            missionId: '33333333-3333-4333-8333-333333333333',
            missionLabel: 'Fiabilisation plateforme',
            kind: 'renewal',
            blockers: ['missing_po'],
          }),
          dossier({
            missionId: '44444444-4444-4444-8444-444444444444',
            missionLabel: 'Dossier complet',
            state: 'complete',
            blockers: [],
          }),
        ],
        renewalsTruncated: false,
      },
      isLoading: false,
      isError: false,
    })
  })
  afterEach(cleanup)

  it('ne liste que les dossiers incomplets et compte « 2 missions ne peuvent pas démarrer »', () => {
    render(<PlanningBlockedPanel now={NOW} onClear={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '2 missions ne peuvent pas démarrer' })).toBeTruthy()
    expect(screen.getByText('Renfort sécurité du programme de refonte')).toBeTruthy()
    expect(screen.getByText('Fiabilisation plateforme')).toBeTruthy()
    expect(screen.queryByText('Dossier complet')).toBeNull()
  })

  it('nomme le motif et l’ancienneté, et chaque ligne ouvre le dossier de la mission', () => {
    render(<PlanningBlockedPanel now={NOW} onClear={vi.fn()} />)
    const row = screen
      .getByText('Renfort sécurité du programme de refonte')
      .closest('tr, li, [data-row]') as HTMLElement
    expect(within(row).getByText('Bon de commande manquant')).toBeTruthy()
    expect(within(row).getByText('Contact de facturation manquant')).toBeTruthy()
    expect(within(row).getByText('12 jours')).toBeTruthy()
    const link = within(row).getByRole('link', { name: /Ouvrir le dossier/ })
    expect(link.getAttribute('href')).toBe('/missions/11111111-1111-4111-8111-111111111111')
  })

  it('reprend les compteurs par motif ; le motif non calculé reste « Non mesuré », jamais 0', () => {
    render(<PlanningBlockedPanel now={NOW} onClear={vi.fn()} />)
    const counters = screen.getByRole('list', { name: 'Compteurs par motif' })
    expect(within(counters).getByText('Bon de commande manquant')).toBeTruthy()
    expect(within(counters).getByText('Non mesuré')).toBeTruthy()
  })

  it('« Retirer le filtre » rend la main', async () => {
    const onClear = vi.fn()
    render(<PlanningBlockedPanel now={NOW} onClear={onClear} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le filtre' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('un échec de lecture ne se rend pas comme « aucune mission bloquée »', () => {
    dossiers.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<PlanningBlockedPanel now={NOW} onClear={vi.fn()} />)
    expect(screen.getByText(/n’ont pas pu être lus/)).toBeTruthy()
    expect(screen.queryByText(/ne peuvent pas démarrer/)).toBeNull()
  })

  it('aucun dossier incomplet : le dit sans chiffre 0', () => {
    dossiers.mockReturnValue({
      data: {
        month: '2026-10',
        summary: summary({ incomplete: 0 }),
        items: [dossier({ state: 'complete', blockers: [] })],
        renewalsTruncated: false,
      },
      isLoading: false,
      isError: false,
    })
    render(<PlanningBlockedPanel now={NOW} onClear={vi.fn()} />)
    expect(screen.getByText('Aucune mission bloquée pour le moment.')).toBeTruthy()
  })
})
