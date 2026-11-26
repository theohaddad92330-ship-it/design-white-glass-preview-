import type { CriticalRisk } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CriticalRisksBlock } from './CriticalRisksBlock'

/**
 * #3256 (BEL-SC-227.19) — LE BLOC RISQUES CRITIQUES OUVRE LE COMPTE, ET NOMME
 * LES SIGNAUX QUI CONVERGENT.
 */

function risk(partial: Partial<CriticalRisk>): CriticalRisk {
  return { accountId: 'acc-1', companyName: 'ACME', kinds: ['financial', 'mission'], count: 2, ...partial }
}

describe('CriticalRisksBlock', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('une absence se lit « rien ne converge », jamais un 0 (GA-18/GA-19)', async () => {
    renderWithRouter(<CriticalRisksBlock risks={[]} />)
    expect(await screen.findByText('Aucun risque critique détecté pour le moment.')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('ouvre la fiche compte, comme les autres blocs transverses du brief', async () => {
    renderWithRouter(<CriticalRisksBlock risks={[risk({})]} />)
    expect(await screen.findByRole('link', { name: /ACME/ })).toHaveAttribute('href', '/accounts/acc-1')
  })

  it('nomme les genres de signaux qui convergent, sans les répéter', async () => {
    renderWithRouter(<CriticalRisksBlock risks={[risk({ kinds: ['mission', 'mission'] })]} />)
    expect(await screen.findByText('Renouvellement non engagé')).toBeInTheDocument()
  })
})
