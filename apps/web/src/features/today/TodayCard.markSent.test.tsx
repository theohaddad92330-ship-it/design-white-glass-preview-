import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MyPlanAction } from '@bellum/contracts'
import { buildTodayItems, type TodayItem } from './todayQueue'

vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    Link: forwardRef<HTMLAnchorElement, { children: React.ReactNode; to: string; params?: Record<string, string> }>(
      ({ children, to, params, ...rest }, ref) => (
        <a {...rest} ref={ref} href={params ? to.replace('$id', params.id ?? '') : to}>
          {children}
        </a>
      ),
    ),
  }
})
vi.mock('@/features/actions/components/SendTimingLine', () => ({ SendTimingLine: () => null }))
vi.mock('@/features/actions/components/CallbackDateDialog', () => ({ CallbackDateDialog: () => null }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/permissions', async () => ({
  ...(await vi.importActual<object>('@/lib/permissions')),
  useUserPermissions: () => ({ status: 'known', role: 'member', extraPermissions: [], permissions: ['records:write'] }),
}))

import { TodayCard } from './TodayCard'

/**
 * #4418.1 — « Marquer envoyé » dans « Aujourd'hui » : le geste existait sur la fiche contact, pas dans la file où
 * le commercial agit. Déclaratif (c73) : il appelle `declareSent`, qui planifie J+3 / J+6 / J+9 ; rien n'est envoyé.
 */
const NOW = new Date(2026, 9, 24, 10)
const markSent = vi.fn().mockResolvedValue(true)
const gestures = {
  isPending: () => false,
  markSent,
} as unknown as ComponentProps<typeof TodayCard>['gestures']

const planItem = (over: Partial<MyPlanAction> = {}): TodayItem => {
  const [item] = buildTodayItems(
    {
      approvals: [],
      crm: [],
      erp: [],
      sends: [],
      messages: [],
      sequences: [],
      calls: [],
      tasks: [],
      plan: [
        {
          id: 'p1',
          account_id: 'a1',
          company_name: 'ALSEDIS',
          label: 'Envoyer un email J1 à Muriel',
          due_date: '2026-10-24',
          channel: 'email',
          reason: null,
          contact_id: 'c1',
          contact_name: 'Muriel',
          contact_role: 'DG',
          signal: null,
          ...over,
        } as MyPlanAction,
      ],
    },
    NOW,
  )
  if (!item) throw new Error('no item')
  return item
}

const renderCard = (item: TodayItem) =>
  render(
    <TodayCard
      item={item}
      now={NOW}
      gestures={gestures}
      members={[]}
      hasMandate={false}
      variant="burst"
      onSkip={vi.fn()}
    />,
  )

describe('#4418.1 — « Marquer envoyé » sur la carte Aujourd’hui', () => {
  it('une carte e-mail avec contact porte le geste, qui déclare sans rien envoyer', async () => {
    markSent.mockClear()
    renderCard(planItem())
    fireEvent.click(screen.getByRole('button', { name: /marquer envoyé/i }))
    await waitFor(() => expect(markSent).toHaveBeenCalledTimes(1))
  })

  it('sans contact résolu, le geste ne se montre pas (rien n’est inventé)', () => {
    renderCard(planItem({ contact_id: null, contact_name: null, contact_role: null }))
    expect(screen.queryByRole('button', { name: /marquer envoyé/i })).toBeNull()
  })

  it('un appel ne se « marque » pas envoyé', () => {
    renderCard(planItem({ channel: 'phone' }))
    expect(screen.queryByRole('button', { name: /marquer envoyé/i })).toBeNull()
  })
})

describe('#4418.1 — « Fait » annonce la cadence, sans jamais dire « envoyé »', () => {
  it('l’infobulle de « Fait » annonce J+3, J+6, J+9 pour une approche e-mail avec contact', () => {
    renderCard(planItem())
    const done = screen.getAllByRole('button').find(button => /^fait$/i.test(button.textContent?.trim() ?? ''))
    expect(done?.getAttribute('title')).toMatch(/J\+3, J\+6, J\+9/)
  })

  it('SAIT DIRE NON : aucune chaîne de preuve d’envoi sur « Fait »', () => {
    renderCard(planItem())
    const done = screen.getAllByRole('button').find(button => /^fait$/i.test(button.textContent?.trim() ?? ''))
    expect(done?.getAttribute('title')).toMatch(/pas une preuve d’envoi/)
    expect(done?.getAttribute('title')).not.toMatch(/envoi vérifié|a été envoyé|envoyé le/i)
  })

  it('un appel garde l’infobulle d’origine : aucune cadence annoncée', () => {
    renderCard(planItem({ channel: 'phone' }))
    const done = screen.getAllByRole('button').find(button => /^fait$/i.test(button.textContent?.trim() ?? ''))
    expect(done?.getAttribute('title') ?? '').not.toMatch(/J\+3/)
  })
})
