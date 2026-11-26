import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { AccountReferenceDossier } from './AccountReferenceDossier'

vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn().mockResolvedValue({}), addAngle: vi.fn(), isPending: false }),
}))

describe('AccountReferenceDossier', () => {
  it('un compte ordinaire ne montre aucune section de dossier de référence', () => {
    const account = { id: 'acc-1', raw_analysis: {} } as unknown as Account
    const { container } = render(<AccountReferenceDossier account={account} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('un dossier de référence montre ses sections', () => {
    const dossier = {
      counts: { units: 1, historical_needs: 1, tjm_observations: 1, contacts: 1 },
      programmes: [],
      purchasing: [],
      organisation: [],
      expertises: [],
      tjm: [],
      needs: [],
      ecosystem: [],
    }
    const account = { id: 'acc-1', raw_analysis: { reference_dossier: dossier } } as unknown as Account
    const { getByTestId } = render(<AccountReferenceDossier account={account} />)
    expect(getByTestId('reference-dossier')).toBeInTheDocument()
  })
})
