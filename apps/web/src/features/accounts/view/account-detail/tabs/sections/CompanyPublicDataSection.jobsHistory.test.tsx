import { SEGMENT_CAPABILITY_EPOCH, type AccountAnalysis } from '@bellum/contracts'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CompanyPublicDataSection } from './CompanyPublicDataSection'

vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: null }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))

// Dérivée de l'epoch (+1 jour), jamais écrite en dur — comme `CompanyPublicDataSection.test.tsx`.
const FRESH_SIGNALS_COLLECTED_AT = new Date(
  new Date(SEGMENT_CAPABILITY_EPOCH.signals as string).getTime() + 24 * 3_600_000,
).toISOString()

// Seule `Date` est figée : les `findBy*` asynchrones continuent de tourner.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

type Job = { title: string; date?: string | null; url?: string }
const job = (title: string, date?: string | null): Job => ({ title, date: date ?? null })
// Le routeur monte en asynchrone : on attend la carte (son titre) avant d'interroger.
const render = async (jobs: Job[]) => {
  renderWithRouter(
    <CompanyPublicDataSection
      analysis={{ it_job_signals: jobs } as unknown as AccountAnalysis}
      signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT}
    />,
  )
  await screen.findByText("Offres d'emploi IT")
}

/**
 * #4757 (HIST-D) — L'HISTORIQUE COMPLET DES BESOINS D'UN COMPTE.
 *
 * Avant : `inTrade.slice(0, 6)` — six lignes, sans compte total, sans séparation entre récent et ancien.
 * Une offre de 2025 pouvait y figurer « par hasard » au même rang qu'une offre d'hier.
 */
describe('CompanyPublicDataSection — historique des besoins (#4757)', () => {
  it('sépare les besoins récents et historiques, chacun disant son compte', async () => {
    await render([
      job('Dev Java récent', '2026-10-07'),
      job('Architecte cloud', '2026-09-01'),
      job('Chef de projet SAP 2025', '2025-03-12'),
      job('Data engineer 2024', '2024-11-04'),
      job('DevOps 2025', '2025-06-20'),
    ])
    expect(screen.getByText('Besoins récents (2)')).toBeInTheDocument()
    expect(screen.getByText('Besoins historiques (3)')).toBeInTheDocument()
  })

  it('donne à chaque besoin passé sa date réelle, jamais une date devinée', async () => {
    await render([job('Dev Java récent', '2026-10-07'), job('Chef de projet SAP 2025', '2025-03-12')])
    expect(screen.getByText(/12 mars 2025/)).toBeInTheDocument()
    expect(screen.queryByText(/1 janv/)).not.toBeInTheDocument()
  })

  it('un besoin passé ne figure PAS dans le bloc récent (le tri au rendu)', async () => {
    await render([job('Dev Java récent', '2026-10-07'), job('Chef de projet SAP 2025', '2025-03-12')])
    const recent = screen.getByTestId('jobs-recent')
    const history = screen.getByTestId('jobs-history')
    expect(recent.textContent).toContain('Dev Java récent')
    expect(recent.textContent).not.toContain('Chef de projet SAP 2025')
    expect(history.textContent).toContain('Chef de projet SAP 2025')
  })

  it('trie du plus récent au moins récent dans chaque bloc', async () => {
    await render([
      job('Vieille 2023', '2023-01-10'),
      job('Milieu 2025', '2025-02-10'),
      job('Récente 2025', '2025-08-10'),
    ])
    const titles = Array.from(screen.getByTestId('jobs-history').querySelectorAll('[data-job-title]')).map(
      node => node.textContent,
    )
    expect(titles).toEqual(['Récente 2025', 'Milieu 2025', 'Vieille 2023'])
  })

  it('sans historique : aucun bloc historique, aucun « 0 »', async () => {
    await render([job('Dev Java récent', '2026-10-07')])
    expect(screen.queryByTestId('jobs-history')).toBeNull()
    expect(screen.queryByText(/Besoins historiques/)).toBeNull()
  })

  it('sans besoin récent : le bloc récent disparaît, l’historique reste', async () => {
    await render([job('Chef de projet SAP 2025', '2025-03-12')])
    expect(screen.queryByTestId('jobs-recent')).toBeNull()
    expect(screen.getByText('Besoins historiques (1)')).toBeInTheDocument()
  })

  it('une offre sans date lisible reste dans le bloc récent, sans date inventée', async () => {
    await render([job('Offre sans date', null), job('Offre illisible', 'bientôt')])
    expect(screen.getByTestId('jobs-recent').textContent).toContain('Offre sans date')
    expect(screen.getByTestId('jobs-recent').textContent).toContain('Offre illisible')
    expect(screen.queryByTestId('jobs-history')).toBeNull()
  })

  it('l’historique long est atteignable : dix lignes puis « Voir plus » avec le reste nommé', async () => {
    const old = Array.from({ length: 25 }, (_, i) =>
      job(`Besoin ancien ${String(i).padStart(2, '0')}`, `2025-01-${String(i + 1).padStart(2, '0')}`),
    )
    await render(old)
    expect(screen.getByText('Besoins historiques (25)')).toBeInTheDocument()
    expect(screen.getAllByTestId('job-row-history')).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Voir plus (15)' }))
    expect(screen.getAllByTestId('job-row-history')).toHaveLength(20)
    fireEvent.click(screen.getByRole('button', { name: 'Voir plus (5)' }))
    expect(screen.getAllByTestId('job-row-history')).toHaveLength(25)
    expect(screen.queryByRole('button', { name: /Voir plus/ })).toBeNull()
  })

  it('les besoins récents dépassant six restent atteignables, compte total affiché', async () => {
    // Des intitulés distincts : le pli par intitulé (K3) réunirait « Besoin récent 0 » et « Besoin récent 1 ».
    const stacks = ['Java', 'Python', 'Kafka', 'Cobol', 'Rust', 'Scala', 'Go', 'Ruby']
    const recent = stacks.map((stack, i) => job(`Développeur ${stack}`, `2026-10-${String(i + 10)}`))
    await render(recent)
    expect(screen.getByText('Besoins récents (8)')).toBeInTheDocument()
    expect(screen.getAllByTestId('job-row-recent')).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Voir plus (2)' }))
    expect(screen.getAllByTestId('job-row-recent')).toHaveLength(8)
  })

  it('deux offres de même intitulé à des époques différentes ne se plient pas en une seule', async () => {
    await render([job('Développeur Java', '2026-10-07'), job('Développeur Java', '2024-05-02')])
    expect(screen.getByText('Besoins récents (1)')).toBeInTheDocument()
    expect(screen.getByText('Besoins historiques (1)')).toBeInTheDocument()
  })
})
