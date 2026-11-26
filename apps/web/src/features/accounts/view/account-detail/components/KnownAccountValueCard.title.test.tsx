/**
 * #4286.4 (#3917.5) — le bloc « Ce que BellumAI ajoute à ce que tu sais » existe et se LIT à l'écran. Le libellé est
 * interpolé (`{{brand}}`), d'où l'introuvable au `grep` de la recette : ce test le prouve rendu, dans les deux langues.
 */
import type { Account } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import en from '@/i18n/locales/en/accountDetail.json'
import fr from '@/i18n/locales/fr/accountDetail.json'
import { KnownAccountValueCard } from './KnownAccountValueCard'

vi.mock('@/features/accounts/model/watchData', () => ({
  buildAccountWatchData: () => ({
    signals: [{ signal: 'Offre publiée : Architecte cloud', date: '2026-10-02', sourceKind: 'job' }],
  }),
}))
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({
  useCrmPresence: () => ({
    data: {
      provider: 'hubspot',
      matched: true,
      contactsCount: 0,
      contacts: [],
      openDeals: [],
      lastActivityAt: '2026-09-01T00:00:00.000Z',
    },
  }),
}))

const account = { id: 'a', company_name: 'SNCF', website: null, siren: null } as unknown as Account

describe('#4286.4 — le bloc « Ce que {{brand}} ajoute » se lit à l’écran', () => {
  it('rend le titre, marque interpolée, sur un compte que le CRM connaît', () => {
    render(<KnownAccountValueCard account={account} contacts={[]} />)
    expect(screen.getByRole('heading', { name: /Ce que .+ ajoute à ce que tu sais/ })).toBeInTheDocument()
  })

  it('le titre existe dans les deux langues avec la marque interpolée (parité fr/en)', () => {
    expect(fr.knownAccountValue.title).toContain('{{brand}}')
    expect(en.knownAccountValue.title).toContain('{{brand}}')
  })
})
