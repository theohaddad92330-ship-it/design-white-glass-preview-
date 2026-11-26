import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { EsnAnswers } from '@bellum/contracts'
import { EsnSection } from '@/features/profile/components/EsnSection'
import { useEsnProfileWorkspaceMeta } from '@/features/profile/hooks/useEsnProfileWorkspaceMeta'
import { useImpactedAccounts } from '@/features/profile/hooks/useImpactedAccounts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('@/features/profile/hooks/useEsnProfileWorkspaceMeta', () => ({ useEsnProfileWorkspaceMeta: vi.fn() }))
vi.mock('@/features/profile/hooks/useImpactedAccounts', () => ({ useImpactedAccounts: vi.fn() }))

const ANSWERS = {} as EsnAnswers

function setup(impactedCount: number) {
  vi.mocked(useEsnProfileWorkspaceMeta).mockReturnValue({ data: { shared: false } } as unknown as ReturnType<
    typeof useEsnProfileWorkspaceMeta
  >)
  vi.mocked(useImpactedAccounts).mockReturnValue({
    data: {
      currentEsnProfileVersion: 2,
      accounts: Array.from({ length: impactedCount }, (_, i) => ({
        accountId: `a${i}`,
        companyName: `Compte ${i}`,
        esnProfileVersion: 1,
      })),
    },
  } as unknown as ReturnType<typeof useImpactedAccounts>)
  return renderWithRouter(<EsnSection answers={ANSWERS} />)
}

/** #2306.24 — Réglages › Profil PORTE la notice agrégée, à côté des stages
 *  secteurs/offres qu'elle concerne. */
describe('EsnSection — notice des comptes impactés', () => {
  it('affiche « N comptes concernés » quand le portefeuille en a', async () => {
    setup(2)
    expect(await screen.findByText(/2 comptes ont été analysés avec un profil ESN plus ancien/i)).toBeInTheDocument()
  })

  it('zéro compte concerné : aucune notice (GA-18/19)', () => {
    setup(0)
    expect(screen.queryByText(/concerné/i)).not.toBeInTheDocument()
  })
})
