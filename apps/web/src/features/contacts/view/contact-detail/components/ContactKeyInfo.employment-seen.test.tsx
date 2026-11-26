import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ContactKeyInfo } from './ContactKeyInfo'

// #4599.6 — la ligne « E-mail absent » porte la recherche d'« Enrichir » (react-query) : doublée ici, testée à part.
vi.mock('./ContactEnrichButton', () => ({
  useContactEnrich: () => ({ enrich: vi.fn(), setScope: vi.fn(), disabled: false, hint: undefined }),
  ContactEnrichConfirm: () => null,
}))

// #4504.3 — la carte porte « Responsable du contact » (session) : mêmes doublures que ContactKeyInfo.test.tsx.
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('./ContactAssignControl', () => ({
  ContactAssignControl: ({ label }: { label?: string }) => <button type="button">{label ?? 'Attribuer'}</button>,
}))
vi.mock('@/features/team-guardrails/components/DoNotContactPreference', () => ({
  DoNotContactPreference: () => <span>Aucune opposition consignée</span>,
}))

/**
 * #4016.L2.a — « vu le <date> » sur la fiche d'un champion : QUAND son employeur
 * a été relu. Un fait daté, jamais « vérifié » ; sans date connue, AUCUNE ligne.
 */
function person(decisionRole: string, rawData: Record<string, unknown> | null): Contact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Claire Martin',
    title: 'Directrice SI',
    decision_role: decisionRole,
    raw_data: rawData,
  } as unknown as Contact
}

describe('ContactKeyInfo — « vu le » d’un champion (#4016.L2.a)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('montre la date du dernier contrôle d’un champion', () => {
    render(<ContactKeyInfo contact={person('champion', { employmentCheck: { at: '2026-10-08T05:50:00.000Z' } })} />)
    expect(screen.getByText(/Employeur vu le .*2026/)).toBeInTheDocument()
    expect(screen.queryByText(/vérifié/i)).not.toBeInTheDocument()
  })

  it('dit la même chose en anglais', async () => {
    await i18n.changeLanguage('en')
    render(<ContactKeyInfo contact={person('sponsor', { employmentCheck: { at: '2026-10-08T05:50:00.000Z' } })} />)
    expect(screen.getByText(/Employer seen on .*2026/)).toBeInTheDocument()
  })

  // #4286.13.b — tout contact relu porte son « vu le », pas seulement les champions.
  it('montre la date pour TOUT contact relu, quel que soit son rôle', () => {
    render(<ContactKeyInfo contact={person('blocker', { employmentCheck: { at: '2026-10-08T05:50:00.000Z' } })} />)
    expect(screen.getByText(/Employeur vu le .*2026/)).toBeInTheDocument()
  })

  it('sait dire NON : sans date connue, aucune ligne (jamais « 0 » ni une date devinée)', () => {
    const cases: Contact[] = [
      person('champion', null),
      person('champion', { employmentCheck: {} }),
      person('champion', { employmentCheck: { at: 'pas une date' } }),
      person('blocker', null),
    ]
    for (const contact of cases) {
      const { unmount } = render(<ContactKeyInfo contact={contact} />)
      expect(screen.queryByText(/Employeur vu le/)).not.toBeInTheDocument()
      unmount()
    }
  })
})
