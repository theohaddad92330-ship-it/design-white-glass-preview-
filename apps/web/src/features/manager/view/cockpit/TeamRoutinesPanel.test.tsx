import type { ManagerMemberStats, ManagerRoutinesOverview } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { TeamRoutinesPanel } from './TeamRoutinesPanel'

const MEMBERS: ManagerMemberStats[] = [
  {
    user_id: 'u-1',
    name: 'Ana Dupont',
    email: 'ana@exemple.fr',
    role: 'member',
    accounts: 4,
    contacts: 12,
    emails_sent: 0,
    analyses: 2,
    last_activity_at: null,
  },
]

describe('TeamRoutinesPanel (#2399.8, axe WORKSPACE)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it("liste les routines d'un membre par son nom résolu, jamais son identifiant", () => {
    const routines: ManagerRoutinesOverview = {
      members: [
        {
          user_id: 'u-1',
          routines: [
            {
              key: 'no_reply_follow_up',
              name: { fr: 'Relance sans réponse', en: 'No-reply follow-up' },
              status: 'active',
              channel: 'in_app',
              lastRunAt: '2026-09-20T08:00:00.000Z',
              nextTriggerAt: null,
            },
          ],
        },
      ],
    }
    render(<TeamRoutinesPanel routines={routines} members={MEMBERS} />)
    expect(screen.getByText('Ana Dupont')).toBeInTheDocument()
    expect(screen.getByText('Relance sans réponse')).toBeInTheDocument()
    expect(screen.queryByText('u-1')).not.toBeInTheDocument()
  })

  it('signale un dernier échec sans jamais montrer le corps du message', () => {
    const routines: ManagerRoutinesOverview = {
      members: [
        {
          user_id: 'u-1',
          routines: [
            {
              key: 'no_reply_follow_up',
              name: { fr: 'Relance sans réponse', en: 'No-reply follow-up' },
              status: 'active',
              channel: 'in_app',
              lastRunAt: '2026-09-20T08:00:00.000Z',
              lastFailed: true,
              nextTriggerAt: null,
            },
          ],
        },
      ],
    }
    render(<TeamRoutinesPanel routines={routines} members={MEMBERS} />)
    expect(screen.getByText('Dernière exécution en échec')).toBeInTheDocument()
  })

  it('sans membre à montrer (aucun abonnement matérialisé), le bloc entier disparaît — pas une liste vide', () => {
    const { container } = render(<TeamRoutinesPanel routines={{ members: [] }} members={MEMBERS} />)
    expect(container).toBeEmptyDOMElement()
  })
})
