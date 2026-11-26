import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { AccountDecisionHeader } from './AccountDecisionHeader'

vi.mock('@/features/profile/hooks/useEsnProfile', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/profile/hooks/useEsnProfile')>()
  return { ...actual, useHasOfferObjective: vi.fn() }
})

function mockHasOfferObjective(hasObjective: boolean) {
  vi.mocked(useHasOfferObjective).mockReturnValue(hasObjective)
}

describe('AccountDecisionHeader', () => {
  it('rend `null` sur un dossier jamais analysé — jamais sept champs vides', () => {
    const { container } = renderWithRouter(
      <AccountDecisionHeader
        verdictFamily={null}
        hasNoGoTrigger={false}
        interestAxis={null}
        penetrabilityAxis={null}
        dossierReliability={null}
        confidenceTier={null}
        bestRouteLabel={null}
        nextActionLabel={null}
        lastAnalyzedAt={null}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('rassemble verdict, intérêt, pénétrabilité, confiance, route et prochaine action', async () => {
    renderWithRouter(
      <AccountDecisionHeader
        verdictFamily="GO"
        hasNoGoTrigger={false}
        interestAxis={{ key: 'potentiel_commercial', state: 'measured', value: 4, impact: null, lever: null }}
        penetrabilityAxis={{ key: 'accessibilite', state: 'measured', value: 2, impact: null, lever: null }}
        dossierReliability={78}
        confidenceTier="high"
        bestRouteLabel="RH — DRH"
        nextActionLabel="Préparer le premier message"
        lastAnalyzedAt={null}
      />,
    )

    expect(await screen.findByText('AGIR MAINTENANT')).toBeInTheDocument()
    expect(screen.getByText('4/5')).toBeInTheDocument()
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('78/100')).toBeInTheDocument()
    expect(screen.getByText('RH — DRH')).toBeInTheDocument()
    expect(screen.getByText('Préparer le premier message')).toBeInTheDocument()
  })

  it('nomme « non mesuré » un axe inconnu — jamais un zéro (GA-18/19)', async () => {
    renderWithRouter(
      <AccountDecisionHeader
        verdictFamily="EXPLORER"
        hasNoGoTrigger={false}
        interestAxis={{ key: 'potentiel_commercial', state: 'unknown', value: null, impact: null, lever: null }}
        penetrabilityAxis={null}
        dossierReliability={null}
        confidenceTier={null}
        bestRouteLabel={null}
        nextActionLabel={null}
        lastAnalyzedAt={null}
      />,
    )

    expect((await screen.findAllByText('Inconnu')).length).toBeGreaterThan(0)
    expect(screen.getByText('Voie d’entrée non identifiée')).toBeInTheDocument()
    expect(screen.getByText('Aucune action suggérée')).toBeInTheDocument()
  })

  it('#3261.9 — suggère la date de revue à dernière analyse + 90 j (PLAN_STALE_DAYS)', async () => {
    renderWithRouter(
      <AccountDecisionHeader
        verdictFamily="GO"
        hasNoGoTrigger={false}
        interestAxis={null}
        penetrabilityAxis={null}
        dossierReliability={null}
        confidenceTier={null}
        bestRouteLabel={null}
        nextActionLabel={null}
        lastAnalyzedAt="2026-01-01T00:00:00.000Z"
      />,
    )

    expect(await screen.findByText('Date de revue suggérée')).toBeInTheDocument()
    // 2026-01-01 + 90 jours = 2026-04-01
    expect(screen.getByText('01/04/2026')).toBeInTheDocument()
  })

  it('#3261.9 — aucune date de revue sur un dossier jamais analysé (aucune ligne, jamais devinée)', () => {
    renderWithRouter(
      <AccountDecisionHeader
        verdictFamily="GO"
        hasNoGoTrigger={false}
        interestAxis={null}
        penetrabilityAxis={null}
        dossierReliability={null}
        confidenceTier={null}
        bestRouteLabel={null}
        nextActionLabel={null}
        lastAnalyzedAt={null}
      />,
    )

    expect(screen.queryByText('Date de revue suggérée')).not.toBeInTheDocument()
  })

  it('#3818 — un STOP sans déclencheur, sans objectif renseigné, ne dit jamais ÉCARTER POUR CET OBJECTIF', async () => {
    mockHasOfferObjective(false)
    renderWithRouter(
      <AccountDecisionHeader
        verdictFamily="NO-GO"
        hasNoGoTrigger={false}
        interestAxis={null}
        penetrabilityAxis={null}
        dossierReliability={null}
        confidenceTier={null}
        bestRouteLabel={null}
        nextActionLabel={null}
        lastAnalyzedAt={null}
      />,
    )

    expect(await screen.findByText('ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ')).toBeInTheDocument()
    expect(screen.queryByText('ÉCARTER POUR CET OBJECTIF')).not.toBeInTheDocument()
  })

  it('#3818 — objectif renseigné : un STOP sans déclencheur garde ÉCARTER POUR CET OBJECTIF', async () => {
    mockHasOfferObjective(true)
    renderWithRouter(
      <AccountDecisionHeader
        verdictFamily="NO-GO"
        hasNoGoTrigger={false}
        interestAxis={null}
        penetrabilityAxis={null}
        dossierReliability={null}
        confidenceTier={null}
        bestRouteLabel={null}
        nextActionLabel={null}
        lastAnalyzedAt={null}
      />,
    )

    expect(await screen.findByText('ÉCARTER POUR CET OBJECTIF')).toBeInTheDocument()
  })
})
