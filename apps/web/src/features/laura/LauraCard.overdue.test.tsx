import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InterventionDefinition, OverdueFollowUp } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { i18n } from '@/i18n'
import { LauraCard } from './LauraCard'

/**
 * #3398.4a (recette salle démo 03/10) — « la bulle est générique et ne nomme pas
 * la relance due ("Relancer sur les deux profils conformité", Société Générale) ».
 * La bulle de `follow_up_overdue` compose, dans la langue active, la relance la
 * plus en retard que le serveur nomme (`overdueFollowUp`) : titre, compte, jours,
 * et le nombre des autres — jamais une relance devinée.
 */
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useLocation: () => ({ pathname: '/briefing' }) }
})

const apiFetchMock = vi.mocked(apiFetch)
const FOLLOW_UP: OverdueFollowUp = {
  title: 'Relancer sur les deux profils conformité',
  accountName: 'Société Générale',
  daysOverdue: 2,
  others: 0,
}

function served(overdueFollowUp?: OverdueFollowUp): void {
  const intervention: InterventionDefinition = {
    key: 'follow_up_overdue',
    family: 'business_value',
    condition: 'Des relances de comptes ont dépassé leur échéance.',
    action: 'Voir les actions en retard.',
    screen: '/briefing',
    route: '/actions',
    format: 'bubble',
    impact: 7,
    urgency: 8,
    actionability: 9,
  }
  apiFetchMock.mockResolvedValue({
    speaks: true,
    intervention,
    priority: 80,
    traceId: 'trace-1',
    ...(overdueFollowUp ? { overdueFollowUp } : {}),
  })
}

describe('la bulle `follow_up_overdue` nomme la relance due — #3398.4a', () => {
  const initialLanguage = i18n.language
  afterEach(async () => {
    cleanup()
    await i18n.changeLanguage(initialLanguage)
  })

  it('FR : le titre, le compte et le retard sont lisibles', async () => {
    await i18n.changeLanguage('fr')
    served(FOLLOW_UP)
    render(<LauraCard />)
    const surface = await waitFor(() => screen.getByRole('status'))
    expect(surface.textContent).toContain('Relancer sur les deux profils conformité')
    expect(surface.textContent).toContain('Société Générale')
    expect(surface.textContent).toMatch(/2 jours de retard/)
  })

  it('EN : composée dans la langue active', async () => {
    await i18n.changeLanguage('en')
    served(FOLLOW_UP)
    render(<LauraCard />)
    const surface = await waitFor(() => screen.getByRole('status'))
    expect(surface.textContent).toContain('Société Générale')
    expect(surface.textContent).toMatch(/2 days overdue/)
  })

  it('les autres relances se COMPTENT, sans les nommer', async () => {
    await i18n.changeLanguage('fr')
    served({ ...FOLLOW_UP, others: 3 })
    render(<LauraCard />)
    const surface = await waitFor(() => screen.getByRole('status'))
    expect(surface.textContent).toMatch(/3 autres/)
  })

  it('sans compte lisible : AUCUN nom inventé, le titre seul', async () => {
    await i18n.changeLanguage('fr')
    served({ ...FOLLOW_UP, accountName: null })
    render(<LauraCard />)
    const surface = await waitFor(() => screen.getByRole('status'))
    expect(surface.textContent).toContain('Relancer sur les deux profils conformité')
    expect(surface.textContent).not.toContain('null')
  })

  it('SAIT DIRE NON — sans relance nommée, la phrase du catalogue reste seule', async () => {
    await i18n.changeLanguage('fr')
    served(undefined)
    render(<LauraCard />)
    const surface = await waitFor(() => screen.getByRole('status'))
    expect(surface.textContent).not.toMatch(/de retard\./)
    expect(surface.textContent).toContain('ont dépassé leur échéance')
  })
})
