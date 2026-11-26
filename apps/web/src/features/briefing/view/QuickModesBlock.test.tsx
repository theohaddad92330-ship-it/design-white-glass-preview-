import type { DailyBriefing } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #2918 / #2100.1-.13 — le sélecteur de modes de travail rapides. Voir
 * `../quick-modes.ts` pour la portée du lot.
 */
const team = vi.fn()
const talentStats = vi.fn()

vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => team() }))
vi.mock('@/features/consultants/hooks', () => ({ useTalentStats: () => talentStats() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))

const { QuickModesBlock } = await import('./QuickModesBlock')

function briefing(over: Partial<DailyBriefing> = {}): DailyBriefing {
  return {
    date: '2026-09-26',
    timeZone: 'Europe/Paris',
    firstName: 'Louis',
    agenda: { state: 'not_connected', reason: null, events: [], conflicts: [], needsPreparation: [] },
    mail: { state: 'not_connected', reason: null, awaitingReply: [], positiveReplies: [], unread: [] },
    tasks: { state: 'ready', reason: null, tasks: [] },
    accountsToWatch: [],
    actions: [],
    generatedAt: new Date().toISOString(),
    ...over,
  } as DailyBriefing
}

const member = { data: { team: { workspace: { role: 'member' } } }, isLoading: false }
const manager = { data: { team: { workspace: { role: 'admin' } } }, isLoading: false }
const statsWith = (total: number) => ({ data: { total }, isLoading: false })
const statsLoading = () => ({ data: undefined, isLoading: true })

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('fr')
})

describe('QuickModesBlock', () => {
  it('#2100.9/#2100.11 — sans rendez-vous et sans vivier mesuré : seuls prospecter et le pipe restent', () => {
    team.mockReturnValue({ team: member.data.team, isLoading: false })
    talentStats.mockReturnValue(statsLoading())
    render(<QuickModesBlock data={briefing()} allActions={[]} />)
    expect(screen.getByText('Prospecter')).toBeInTheDocument()
    expect(screen.getByText('Remettre mon pipe à jour')).toBeInTheDocument()
    expect(screen.queryByText('Préparer mes rendez-vous')).not.toBeInTheDocument()
    expect(screen.queryByText('Positionner un consultant')).not.toBeInTheDocument()
  })

  it('#2100.10 — un vivier non vide fait apparaître le mode positionnement', () => {
    team.mockReturnValue({ team: member.data.team, isLoading: false })
    talentStats.mockReturnValue(statsWith(4))
    render(<QuickModesBlock data={briefing()} allActions={[]} />)
    expect(screen.getByText('Positionner un consultant')).toBeInTheDocument()
  })

  it('#2100.12 — sans messagerie connectée, une relance en attente garde le mode mais change sa description', () => {
    team.mockReturnValue({ team: member.data.team, isLoading: false })
    talentStats.mockReturnValue(statsLoading())
    render(<QuickModesBlock data={briefing()} allActions={[{ kind: 'follow_up' }]} />)
    expect(screen.getByText('Traiter mes relances')).toBeInTheDocument()
    expect(screen.getByText(/Aucune messagerie connectée/)).toBeInTheDocument()
  })

  it('#2100.13 — manager : la note d’arbitrage équipe apparaît sur le mode positionnement seul', () => {
    team.mockReturnValue({ team: manager.data.team, isLoading: false })
    talentStats.mockReturnValue(statsWith(2))
    render(<QuickModesBlock data={briefing()} allActions={[]} />)
    expect(screen.getAllByText(/arbitre aussi pour l’équipe/)).toHaveLength(1)
  })

  it('#2100.15/#2100.37 — chaque mode affiche sa durée et le volume d’éléments qu’elle propose', () => {
    team.mockReturnValue({ team: member.data.team, isLoading: false })
    talentStats.mockReturnValue(statsLoading())
    render(<QuickModesBlock data={briefing()} allActions={[]} />)
    // Prospecter : 45 min, ~15 min/compte → 3 comptes.
    expect(screen.getByText('45 min · 3 comptes')).toBeInTheDocument()
    // Remettre le pipe à jour : 15 min, ~3 min/affaire → 5 affaires.
    expect(screen.getByText('15 min · 5 affaires')).toBeInTheDocument()
  })
})
