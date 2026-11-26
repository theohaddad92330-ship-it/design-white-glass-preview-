import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { buildTodayItems, type TodayItem } from './todayQueue'
import type { MyPlanAction } from '@bellum/contracts'

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
vi.mock('@/lib/permissions', async () => ({
  ...(await vi.importActual<object>('@/lib/permissions')),
  useUserPermissions: () => ({ status: 'known', role: 'member', extraPermissions: [], permissions: ['records:write'] }),
}))
const generatePlanMail = vi.hoisted(() => vi.fn())
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('./planMail', async () => ({
  ...(await vi.importActual<object>('./planMail')),
  generatePlanMail,
}))

import { TodayCard } from './TodayCard'

const NOW = new Date(2026, 9, 24, 10)
const gestures: ComponentProps<typeof TodayCard>['gestures'] = {
  ...({} as ComponentProps<typeof TodayCard>['gestures']),
  isPending: () => false,
}

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
          label: 'Envoyer un email J1 à Muriel Kumpflen (DG)',
          due_date: '2026-10-24',
          channel: 'email',
          reason: null,
          contact_id: 'c1',
          contact_name: 'Muriel Kumpflen',
          contact_role: 'DG',
          signal: { text: 'Repli de CA : 72,4 M€ → 69,1 M€', at: '2026-10-02T08:00:00.000Z' },
          ...over,
        } as MyPlanAction,
      ],
    },
    NOW,
  )
  if (!item) throw new Error('no item')
  return item
}

function Harness({ initial }: { initial: TodayItem }) {
  const [draft, setDraft] = useState<TodayItem['draft']>(null)
  return (
    <TodayCard
      item={{ ...initial, draft }}
      now={NOW}
      gestures={gestures}
      members={[]}
      hasMandate={false}
      variant="burst"
      onSkip={vi.fn()}
      onDraftChange={setDraft}
    />
  )
}

describe('Carte e-mail du plan en rafale (#4521)', () => {
  it('nomme le compte et le contact (lien + fonction), le signal sur sa ligne, sans lire la consigne', () => {
    render(<Harness initial={planItem()} />)
    expect(screen.getByRole('link', { name: 'ALSEDIS' })).toHaveAttribute('href', '/accounts/a1')
    expect(screen.getByRole('link', { name: 'Muriel Kumpflen' })).toHaveAttribute('href', '/contacts/c1')
    expect(screen.getByText('DG', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByTestId('today-signal')).toHaveTextContent('Signal · Repli de CA : 72,4 M€ → 69,1 M€ (')
  })

  it('aucune ligne de signal quand la carte n’en porte pas', () => {
    render(<Harness initial={planItem({ signal: null })} />)
    expect(screen.queryByTestId('today-signal')).toBeNull()
  })

  it('signal sans date : aucune parenthèse, ni vide ni devinée (#4521.2)', () => {
    for (const at of [null, '', 'pas une date']) {
      const { unmount } = render(
        <Harness initial={planItem({ signal: { text: 'Repli de CA : 72,4 M€ → 69,1 M€', at } })} />,
      )
      expect(screen.getByTestId('today-signal').textContent).toBe('Signal · Repli de CA : 72,4 M€ → 69,1 M€')
      unmount()
    }
  })

  it('« Fait » nie la preuve d’envoi ET nomme la cadence J+3, J+6, J+9 (#4521.5, #4418.1)', () => {
    render(<Harness initial={planItem()} />)
    const done = screen.getByRole('button', {
      name: /marquer .* comme fait|marquer fait|fait/i,
      description: /preuve d’envoi/,
    })
    const title = done.getAttribute('title') ?? ''
    expect(title).toMatch(/n’est pas une preuve d’envoi/)
    expect(title).toMatch(/J\+3, J\+6, J\+9/)
    // la garde sait dire NON : un titre qui affirmerait un envoi, ou qui tairait la cadence, ne passe pas
    const respectsRule = (t: string) => /n’est pas une preuve d’envoi/.test(t) && /J\+3, J\+6, J\+9/.test(t)
    expect(respectsRule('Marque l’action comme envoyée — preuve d’envoi.')).toBe(false)
    expect(respectsRule('Mail envoyé, preuve d’envoi enregistrée.')).toBe(false)
    expect(respectsRule('Marque l’action comme traitée — ce n’est pas une preuve d’envoi.')).toBe(false)
  })

  it('« Générer le mail » : objet + corps dans la carte, modifiables, puis « Copier et ouvrir »', async () => {
    generatePlanMail.mockResolvedValueOnce({ subject: 'Votre CA', body: 'Bonjour Muriel' })
    render(<Harness initial={planItem()} />)
    expect(screen.queryByRole('button', { name: /copier et ouvrir/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /générer le mail/i }))
    expect(await screen.findByLabelText(/corps du mail/i)).toHaveValue('Bonjour Muriel')
    expect(screen.getByLabelText(/objet/i)).toHaveValue('Votre CA')
    await waitFor(() => expect(screen.getByRole('button', { name: /copier et ouvrir/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /fait/i })).toBeInTheDocument()
    expect(generatePlanMail).toHaveBeenCalledTimes(1)
  })

  it('sans contact résolu, pas de « Générer le mail » (rien n’est inventé)', () => {
    render(<Harness initial={planItem({ contact_id: null, contact_name: null, contact_role: null })} />)
    expect(screen.queryByRole('button', { name: /générer le mail/i })).toBeNull()
  })

  // #4521.1 — « 96 actions sans destinataire nommé » : la carte le DIT elle-même, sans ligne ni tiret inventés.
  it('sans contact nommé, la carte dit « destinataire non nommé » ; avec contact, elle ne le dit pas', () => {
    const { unmount } = render(
      <Harness initial={planItem({ contact_id: null, contact_name: null, contact_role: null })} />,
    )
    expect(screen.getByTestId('today-no-recipient')).toHaveTextContent('Destinataire non nommé')
    expect(screen.queryByRole('link', { name: /Kumpflen/ })).toBeNull()
    unmount()
    render(<Harness initial={planItem()} />)
    expect(screen.queryByTestId('today-no-recipient')).toBeNull()
  })
})
