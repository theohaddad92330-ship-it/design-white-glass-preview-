import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmMirrorAccountView } from '@bellum/contracts'
import { AccountCrmMirrorSection } from './AccountCrmMirrorSection'

const read = vi.hoisted(() => ({ mirror: null as CrmMirrorAccountView | null }))
vi.mock('@/features/accounts/hooks/useAccountCrmMirror', () => ({ useAccountCrmMirror: () => read.mirror }))

const deal = (extra: Partial<CrmMirrorAccountView['deals'][number]> = {}): CrmMirrorAccountView['deals'][number] => ({
  provider: 'hubspot',
  id: 'd1',
  title: 'TMA applicative',
  amount: 240000,
  currency: 'EUR',
  stage: 'Proposition envoyée',
  status: 'open',
  expectedCloseDate: '2026-12-01T00:00:00.000Z',
  closedAt: null,
  ownerName: 'Claire Martin',
  url: null,
  ...extra,
})

// SYNC-A — la fiche compte lit le miroir CRM : les affaires et activités du compte, le CRM du client nommé.
describe('AccountCrmMirrorSection (SYNC-A A.5)', () => {
  beforeEach(() => {
    read.mirror = null
  })

  it('une affaire se lit avec son statut, son étape, son montant, son propriétaire et le CRM branché', () => {
    read.mirror = { deals: [deal()], activities: [] }
    render(<AccountCrmMirrorSection accountId="a1" />)
    const list = screen.getByTestId('account-crm-mirror-deals')
    expect(list).toHaveTextContent('TMA applicative')
    expect(list).toHaveTextContent('Proposition envoyée')
    expect(list).toHaveTextContent(/240/)
    expect(list).toHaveTextContent('Claire Martin')
    expect(list).toHaveTextContent('HubSpot')
    expect(screen.queryByTestId('account-crm-mirror-activities')).toBeNull()
  })

  it('un montant absent ne s’affiche jamais « 0 »', () => {
    read.mirror = { deals: [deal({ amount: null, ownerName: null })], activities: [] }
    render(<AccountCrmMirrorSection accountId="a1" />)
    expect(screen.getByTestId('account-crm-mirror-deals')).not.toHaveTextContent(/\b0\s?€/)
  })

  it('une activité se lit par son type, son sujet et sa date ; la démo nomme un CRM de démonstration', () => {
    read.mirror = {
      deals: [],
      activities: [
        {
          provider: 'demo',
          id: 'a1',
          kind: 'meeting',
          subject: 'Soutenance de la proposition',
          occurredAt: '2026-10-01T09:00:00.000Z',
          done: true,
          ownerName: null,
          url: null,
        },
      ],
    }
    render(<AccountCrmMirrorSection accountId="a1" />)
    const list = screen.getByTestId('account-crm-mirror-activities')
    expect(list).toHaveTextContent('Soutenance de la proposition')
    expect(list).toHaveTextContent(/2026/)
    expect(list).not.toHaveTextContent('demo ')
  })

  it('rien dans le miroir (ou lecture en échec) : aucune section', () => {
    render(<AccountCrmMirrorSection accountId="a1" />)
    expect(screen.queryByTestId('account-crm-mirror')).toBeNull()
    read.mirror = { deals: [], activities: [] }
    render(<AccountCrmMirrorSection accountId="a1" />)
    expect(screen.queryByTestId('account-crm-mirror')).toBeNull()
  })
})
