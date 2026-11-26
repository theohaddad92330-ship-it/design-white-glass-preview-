import type { AccountAnalysis } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CompanyPublicDataSection } from './CompanyPublicDataSection'

let observed: string[] | undefined = []

// #3916.b — la carte « Annonces légales » lit aussi la veille des registres.
vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: null }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({
    data: observed === undefined ? null : { paths_observed: 41, esn_observed: 3, observed_stack: observed },
  }),
}))

beforeEach(() => {
  observed = []
})

const analysis = (over: Partial<AccountAnalysis> = {}) => ({ ...over }) as AccountAnalysis

/**
 * #1607.2 — L'ENVIRONNEMENT TECHNOLOGIQUE OBSERVÉ SUR LE DOSSIER.
 *
 * L'asymétrie corrigée : la pile observée s'affichait AVANT de dépenser un
 * crédit (l'aperçu de `/search`) et disparaissait une fois le compte au
 * portefeuille. Ce que ces tests tiennent, c'est surtout l'interdit du retour :
 * **ne jamais fusionner** les deux origines.
 */
describe('TechStackCard — les deux origines (#1607.2)', () => {
  it('rend les technologies observées, dans un bloc SÉPARÉ et nommé', async () => {
    observed = ['java', 'python', 'kafka']
    renderWithRouter(
      <CompanyPublicDataSection analysis={analysis({ detected_tech_stack: ['SAP'] })} accountId="acc-1" />,
    )

    expect(await screen.findByText('Environnements technologiques observés')).toBeInTheDocument()
    expect(screen.getByText('java')).toBeInTheDocument()
    // Les détectées restent à leur place, et le bloc observé ne les absorbe pas.
    expect(screen.getByText('SAP')).toBeInTheDocument()
  })

  it('DIT que les observations ne prouvent pas un usage actuel', async () => {
    observed = ['java', 'python']
    renderWithRouter(
      <CompanyPublicDataSection analysis={analysis({ detected_tech_stack: ['SAP'] })} accountId="acc-1" />,
    )

    // #1611 : l'absence dans un échantillon ne prouve rien, et la présence ne
    // prouve pas un usage. La phrase le dit, sinon la liste se lit comme un fait.
    expect(await screen.findByText(/ne prouvent pas un usage actuel/)).toBeInTheDocument()
  })

  it('rend la carte même SANS technologie détectée, si le corpus en observe', async () => {
    observed = ['java', 'python']
    renderWithRouter(<CompanyPublicDataSection analysis={analysis()} accountId="acc-1" />)

    expect(await screen.findByText('Environnements technologiques observés')).toBeInTheDocument()
  })

  it('borne à huit puis DIT le reste — une troncature muette se lit comme une liste complète', async () => {
    observed = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']
    renderWithRouter(<CompanyPublicDataSection analysis={analysis()} accountId="acc-1" />)

    expect(await screen.findByText('h')).toBeInTheDocument()
    expect(screen.queryByText('i')).not.toBeInTheDocument()
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('#3499 — une technologie déjà en pastille n’est PAS répétée dans les environnements observés', async () => {
    observed = ['sql', 'Java', 'kafka']
    renderWithRouter(
      <CompanyPublicDataSection analysis={analysis({ detected_tech_stack: ['SQL', 'java'] })} accountId="acc-1" />,
    )

    expect(await screen.findByText('Environnements technologiques observés')).toBeInTheDocument()
    expect(screen.getByText('kafka')).toBeInTheDocument()
    expect(screen.getAllByText(/^sql$/i)).toHaveLength(1)
    expect(screen.getAllByText(/^java$/i)).toHaveLength(1)
  })

  it('#3499 — si tout l’observé est déjà en pastille, le bloc observé disparaît', async () => {
    observed = ['SQL']
    renderWithRouter(
      <CompanyPublicDataSection analysis={analysis({ detected_tech_stack: ['SQL'] })} accountId="acc-1" />,
    )

    expect(await screen.findByText('SQL')).toBeInTheDocument()
    expect(screen.queryByText('Environnements technologiques observés')).not.toBeInTheDocument()
  })

  it('n’écrit RIEN quand le corpus ne couvre pas le compte', async () => {
    observed = undefined
    renderWithRouter(
      <CompanyPublicDataSection analysis={analysis({ detected_tech_stack: ['SAP'] })} accountId="acc-1" />,
    )

    expect(await screen.findByText('SAP')).toBeInTheDocument()
    expect(screen.queryByText('Environnements technologiques observés')).not.toBeInTheDocument()
  })

  it('garde le rendu d’avant quand aucun identifiant de compte n’est passé', async () => {
    observed = ['java', 'python']
    renderWithRouter(<CompanyPublicDataSection analysis={analysis({ detected_tech_stack: ['SAP'] })} />)

    // Le hook est désactivé sans `accountId` : les autres écrans qui montent ce
    // composant ne changent pas de rendu.
    expect(await screen.findByText('SAP')).toBeInTheDocument()
  })
})
