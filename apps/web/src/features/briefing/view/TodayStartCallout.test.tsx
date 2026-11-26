import type { BriefingAction, DailyBriefing } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { TodayStartCallout } from './TodayStartCallout'

// Louis 23/10 — porté depuis `view/day/StartHereCard.test.tsx` (PR11) : « Pourquoi celle-ci ? » revient sur la carte
// « Commencer ici » de Théo (la maquette `today-jour` porte « Pourquoi en premier ? »).

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, params }: { to: string; children: React.ReactNode; params?: { id: string } }) => (
    <a href={params ? to.replace('$id', params.id) : to}>{children}</a>
  ),
}))
vi.mock('./PriorityCard', () => ({
  PriorityCard: ({ action }: { action: BriefingAction }) => <div>[carte de priorité {action.id}]</div>,
}))

const action = {
  id: 'a1',
  labelKey: 'briefing.actions.label.account',
  labelVars: { name: 'SNCF' },
  href: '/accounts/acc-1',
  fact: null,
  context: { labelKey: 'briefing.context.signal48h', labelVars: {} },
  businessObject: { kind: 'account', id: 'acc-1', name: 'SNCF', logoUrl: null, website: null },
  priority: 1,
} as unknown as BriefingAction

const data = {
  firstName: 'Maëlle',
  actions: [action],
  agenda: { state: 'ready', events: [] },
  mail: { state: 'ready', positiveReplies: [], unread: [], awaitingReply: [] },
  tasks: { state: 'ready', tasks: [] },
} as unknown as DailyBriefing

describe('« Commencer ici » — la raison du rang (Théo A today-jour.R3/N5)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('« Pourquoi celle-ci ? » ouvre la raison du rang — la carte de priorité entière, jamais un score nu', () => {
    render(<TodayStartCallout data={data} first={action} />)
    expect(screen.queryByText('[carte de priorité a1]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pourquoi celle-ci ?' }))
    expect(screen.getByText('Pourquoi celle-ci passe en premier')).toBeTruthy()
    expect(screen.getByText('[carte de priorité a1]')).toBeTruthy()
  })

  it('sait dire NON : sans action en tête de file, aucun « Pourquoi » à ouvrir', () => {
    render(<TodayStartCallout data={{ ...data, actions: [] }} first={undefined} />)
    expect(screen.queryByRole('button', { name: 'Pourquoi celle-ci ?' })).toBeNull()
  })
})
