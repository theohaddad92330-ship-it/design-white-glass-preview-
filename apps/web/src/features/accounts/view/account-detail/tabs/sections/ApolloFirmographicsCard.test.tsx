import type { AnalysisApolloOrgEnrichment } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ApolloFirmographicsCard } from './ApolloFirmographicsCard'

describe('ApolloFirmographicsCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('renders nothing when the enrichment block is empty', () => {
    const { container } = render(<ApolloFirmographicsCard enrichment={{}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the Apollo description verbatim and flags it as untranslated', () => {
    // The description comes back in English. We never machine-translate a
    // sourced fact silently — we say it is not translated instead.
    const english = 'Électricité de France (EDF) is a French multinational electric utility company.'
    render(<ApolloFirmographicsCard enrichment={{ shortDescription: english }} />)
    expect(screen.getByText(english)).toBeInTheDocument()
    expect(screen.getByText(/non traduite/i)).toBeInTheDocument()
  })

  it('does not show the untranslated notice when there is no description', () => {
    render(<ApolloFirmographicsCard enrichment={{ estimatedNumEmployees: 100 }} />)
    expect(screen.queryByText(/non traduite/i)).not.toBeInTheDocument()
  })

  it('renders the extended Apollo firmographics (present-only)', () => {
    const enrichment: AnalysisApolloOrgEnrichment = {
      estimatedNumEmployees: 272000,
      industry: 'construction',
      shortDescription: 'Global player in concessions and construction.',
      rawAddress: '1973 boulevard de la Défense, 92000 Nanterre, France',
      phone: '+33 1 47 16 35 00',
      publiclyTradedSymbol: 'DG',
      publiclyTradedExchange: 'EPA',
      parentOrganization: 'VINCI SA',
      keywords: ['BTP', 'infrastructure'],
      departmentalHeadCount: { engineering: 12000, operations: 40000 },
    }

    render(<ApolloFirmographicsCard enrichment={enrichment} />)

    expect(screen.getByText('Global player in concessions and construction.')).toBeInTheDocument()
    expect(screen.getByText('1973 boulevard de la Défense, 92000 Nanterre, France')).toBeInTheDocument()
    expect(screen.getByText('DG · EPA')).toBeInTheDocument()
    expect(screen.getByText('VINCI SA')).toBeInTheDocument()
    expect(screen.getByText('BTP')).toBeInTheDocument()
    // Closed-vocabulary Apollo values are translated at display time (FR here).
    expect(screen.getByText('Construction')).toBeInTheDocument()
    expect(screen.getByText('Ingénierie')).toBeInTheDocument()
    expect(screen.getByText('Opérations')).toBeInTheDocument()

    // Phone renders as a tel: link.
    expect(screen.getByRole('link', { name: '+33 1 47 16 35 00' })).toHaveAttribute('href', 'tel:+33 1 47 16 35 00')
  })

  it('translates industry / funding stage / departments in FR', () => {
    render(
      <ApolloFirmographicsCard
        enrichment={{
          industry: 'environmental services',
          latestFundingStage: 'Series B',
          latestFundingRoundDate: '2024-03-15',
          departmentalHeadCount: { information_technology: 900 },
        }}
      />,
    )
    expect(screen.getByText('Services à l’environnement')).toBeInTheDocument()
    expect(screen.getByText('Série B · mars 2024')).toBeInTheDocument()
    expect(screen.getByText('Informatique')).toBeInTheDocument()
  })

  it('translates the same values in EN (i18n parity)', async () => {
    await i18n.changeLanguage('en')
    render(
      <ApolloFirmographicsCard
        enrichment={{
          industry: 'environmental services',
          latestFundingStage: 'Series B',
          latestFundingRoundDate: '2024-03-15',
          departmentalHeadCount: { information_technology: 900 },
        }}
      />,
    )
    expect(screen.getByText('Environmental services')).toBeInTheDocument()
    expect(screen.getByText('Series B · Mar 2024')).toBeInTheDocument()
    expect(screen.getByText('Information technology')).toBeInTheDocument()
    await i18n.changeLanguage('fr')
  })

  // #3917.a — un financement sans date n'est jamais affiché comme s'il était récent.
  it('withdraws an undated funding round (total and stage), shows a dated one with its date', () => {
    const { unmount } = render(
      <ApolloFirmographicsCard
        enrichment={{ industry: 'construction', totalFundingPrinted: '$1.2B', latestFundingStage: 'Series B' }}
      />,
    )
    expect(screen.queryByText('Financement total')).not.toBeInTheDocument()
    expect(screen.queryByText('Dernier tour')).not.toBeInTheDocument()
    expect(screen.queryByText(/Série B/)).not.toBeInTheDocument()
    unmount()
    render(
      <ApolloFirmographicsCard
        enrichment={{
          totalFundingPrinted: '$1.2B',
          latestFundingStage: 'Series B',
          latestFundingRoundDate: '2021-02-01',
        }}
      />,
    )
    expect(screen.getByText('$1.2B')).toBeInTheDocument()
    expect(screen.getByText('Série B · févr. 2021')).toBeInTheDocument()
  })

  it('keeps an unknown Apollo value visible verbatim — never blank, never guessed', () => {
    render(
      <ApolloFirmographicsCard
        enrichment={{ industry: 'quantum yak shaving', departmentalHeadCount: { yak_shaving: 3 } }}
      />,
    )
    expect(screen.getByText('quantum yak shaving')).toBeInTheDocument()
    // Unknown department keeps the pre-existing cosmetic humanisation only.
    expect(screen.getByText('Yak shaving')).toBeInTheDocument()
  })

  it('#3917 — un seul effectif : la fiche en porte un chiffre exact, l’estimation ne s’ajoute pas', () => {
    render(
      <ApolloFirmographicsCard
        enrichment={{ estimatedNumEmployees: 106000, industry: 'automotive' }}
        recordedEmployees="98 500 salariés"
      />,
    )
    expect(screen.queryByText('Effectif observé')).not.toBeInTheDocument()
  })

  it('#3917.9 — un chiffre exact passe devant la tranche de la fiche, et le dit', () => {
    render(
      <ApolloFirmographicsCard
        enrichment={{ estimatedNumEmployees: 106000, industry: 'automotive' }}
        recordedEmployees="Plus de 10 000 salariés"
      />,
    )
    expect(screen.getByText('Effectif observé')).toBeInTheDocument()
    expect(screen.getByText(/plus précis que la tranche/i)).toBeInTheDocument()
  })

  it('#3917.9 — SAIT DIRE NON : une correction humaine de la fiche gagne, aucune estimation affichée', () => {
    render(
      <ApolloFirmographicsCard
        enrichment={{ estimatedNumEmployees: 106000, industry: 'automotive' }}
        recordedEmployees="Plus de 10 000 salariés"
        recordedAudit={{ source: 'human', createdAt: '2026-09-12T10:00:00Z' }}
      />,
    )
    expect(screen.queryByText('Effectif observé')).not.toBeInTheDocument()
  })

  it('#4286.8 — sans effectif sur la fiche, l’effectif OBSERVÉ sur les sources s’affiche sous ce nom', () => {
    render(<ApolloFirmographicsCard enrichment={{ estimatedNumEmployees: 106000, industry: 'automotive' }} />)
    expect(screen.getByText('Effectif observé')).toBeInTheDocument()
  })

  // R25 (Servier) — « CA annuel 8.1B » à côté de « Chiffre d'affaires 6068010000 » : un seul chiffre d'affaires.
  it('le CA de la fiche (registre) remplace celui de la source : jamais deux chiffres d’affaires', () => {
    const enrichment = { annualRevenuePrinted: '8.1B', industry: 'pharmaceuticals' }
    const { rerender } = render(<ApolloFirmographicsCard enrichment={enrichment} recordedRevenue="6068010000" />)
    expect(screen.queryByText('CA annuel')).not.toBeInTheDocument()
    rerender(<ApolloFirmographicsCard enrichment={enrichment} />)
    expect(screen.getByText('CA annuel')).toBeInTheDocument()
  })

  // V4-CORRECTIFS-C 4294.3 — une adresse déjà portée par la fiche (siège / adresse saisis) n'est pas répétée.
  it('4294.3 — n’affiche pas l’adresse Apollo quand la fiche porte déjà la même', () => {
    const rawAddress = '4 boulevard de Mons, 59650 Villeneuve-d’Ascq, France'
    const { rerender } = render(<ApolloFirmographicsCard enrichment={{ rawAddress, phone: '+33 1 00 00 00 00' }} />)
    expect(screen.getByText(rawAddress)).toBeInTheDocument()
    rerender(
      <ApolloFirmographicsCard
        enrichment={{ rawAddress, phone: '+33 1 00 00 00 00' }}
        recordedAddresses={['4 boulevard de Mons 59650 Villeneuve-d’Ascq']}
      />,
    )
    expect(screen.queryByText(rawAddress)).not.toBeInTheDocument()
  })

  describe('croissance d’effectif (headcountGrowth)', () => {
    it('affiche « Effectif +12 % sur 12 mois » depuis le ratio de 12 mois', () => {
      render(
        <ApolloFirmographicsCard
          enrichment={{ industry: 'construction', headcountGrowth: { sixMonths: 0.04, twelveMonths: 0.12 } }}
        />,
      )
      expect(screen.getByText('Évolution de l’effectif')).toBeInTheDocument()
      expect(screen.getByText(/\+12\s?%\s+sur 12 mois/)).toBeInTheDocument()
    })

    it('retombe sur la période présente la plus longue quand 12 mois manque, et signe une baisse', () => {
      render(<ApolloFirmographicsCard enrichment={{ headcountGrowth: { sixMonths: -0.035 } }} />)
      expect(screen.getByText(/-3[,.]5\s?%\s+sur 6 mois/)).toBeInTheDocument()
    })

    it('n’affiche aucune ligne quand aucune période n’est présente (jamais 0)', () => {
      const { container } = render(<ApolloFirmographicsCard enrichment={{ headcountGrowth: {} }} />)
      expect(container).toBeEmptyDOMElement()
      expect(screen.queryByText('Évolution de l’effectif')).not.toBeInTheDocument()
    })

    // Recette prod 02/11 (Kineis) : la source renvoie 0 sur 6 et 12 mois et -1 (−100 %) sur
    // 24 mois pour une entreprise bien vivante — un historique VIDE, pas une mesure.
    // « 0 % sur 12 mois » affichait une absence comme un zéro (GA-18).
    it('n’affiche pas « 0 % » quand toutes les périodes valent 0 ou −100 % (historique vide)', () => {
      const { container } = render(
        <ApolloFirmographicsCard
          enrichment={{ headcountGrowth: { sixMonths: 0, twelveMonths: 0, twentyFourMonths: -1 } }}
        />,
      )
      expect(container).toBeEmptyDOMElement()
    })

    it('ignore une période à −100 % et garde la période mesurée suivante', () => {
      render(<ApolloFirmographicsCard enrichment={{ headcountGrowth: { twelveMonths: -1, sixMonths: 0.05 } }} />)
      expect(screen.getByText(/\+5\s?%\s+sur 6 mois/)).toBeInTheDocument()
    })

    it('SAIT DIRE OUI : un 0 entouré de périodes mesurées reste affiché', () => {
      render(<ApolloFirmographicsCard enrichment={{ headcountGrowth: { twelveMonths: 0, twentyFourMonths: 0.08 } }} />)
      expect(screen.getByText(/0\s?%\s+sur 12 mois/)).toBeInTheDocument()
    })
  })
})
