import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { ImpactedAccountsNotice } from '@/features/profile/components/ImpactedAccountsNotice'
import { useImpactedAccounts } from '@/features/profile/hooks/useImpactedAccounts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('@/features/profile/hooks/useImpactedAccounts', () => ({ useImpactedAccounts: vi.fn() }))

/**
 * #2306.24 — la vue agrégée sur Réglages › Profil : « N comptes concernés »
 * par un changement de secteurs/offres. GA-18/19 : une absence ne s'affiche
 * JAMAIS « 0 » — à zéro compte concerné, le bloc ne rend RIEN.
 */
function setup(accounts: { accountId: string; companyName: string; esnProfileVersion: number }[] | undefined) {
  vi.mocked(useImpactedAccounts).mockReturnValue({
    data: accounts ? { currentEsnProfileVersion: 3, accounts } : undefined,
  } as unknown as ReturnType<typeof useImpactedAccounts>)
  return renderWithRouter(<ImpactedAccountsNotice />)
}

describe('ImpactedAccountsNotice', () => {
  it('zéro compte concerné : ne rend RIEN (GA-18/19, jamais un « 0 »)', () => {
    setup([])
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument()
    expect(screen.queryByText(/concerné/i)).not.toBeInTheDocument()
  })

  it('chargement (data absente) : ne rend rien, ne devine pas', () => {
    setup(undefined)
    expect(screen.queryByText(/concerné/i)).not.toBeInTheDocument()
  })

  it('un compte concerné : singulier', async () => {
    setup([{ accountId: 'a1', companyName: 'ALTEN', esnProfileVersion: 1 }])
    expect(await screen.findByText(/1 compte a été analysé avec un profil ESN plus ancien/i)).toBeInTheDocument()
  })

  it('plusieurs comptes concernés : pluriel', async () => {
    setup([
      { accountId: 'a1', companyName: 'ALTEN', esnProfileVersion: 1 },
      { accountId: 'a2', companyName: 'CAPGEMINI', esnProfileVersion: 2 },
      { accountId: 'a3', companyName: 'SOPRA', esnProfileVersion: 1 },
    ])
    expect(await screen.findByText(/3 comptes ont été analysés avec un profil ESN plus ancien/i)).toBeInTheDocument()
  })
})
